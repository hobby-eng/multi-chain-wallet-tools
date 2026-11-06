import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageSigningError } from "../src/bip322-signing.js";

const native = vi.hoisted(() => ({ init: vi.fn(), packet: vi.fn(), verify: vi.fn() }));
vi.mock("btcutil-js", () => ({ init: native.init }));
const api = () => ({
  bip322: { buildToSignPacketSimple: native.packet, verifyMessage: native.verify },
});
async function keyOwner() {
  const { Bip322Signing } = await import("../src/bip322-signing.js");
  return new Bip322Signing(key);
}
function startup() {
  const callbacks: { resolve(value: ReturnType<typeof api>): void; reject(cause: Error): void }[] =
    [];
  const promise = new Promise<ReturnType<typeof api>>((resolve, reject) =>
    callbacks.push({ resolve, reject }),
  );
  native.init.mockReturnValue(promise);
  return callbacks[0]!;
}

// Public generator key and its standard witness output. No real wallet material is used.
const key = "1".padStart(64, "0");
const request = {
  address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
  message: "Public owner-lifetime fixture",
  network: "mainnet",
  mode: "native-segwit",
  scriptPubKeyHex: "0014751e76e8199196d454941c45d1b3a323f1433bd6",
} as const;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const cleared: Uint8Array[] = [];

beforeEach(() => {
  vi.resetModules();
  native.init.mockReset().mockResolvedValue(api());
  native.packet.mockReset();
  native.verify.mockReset();
  cleared.length = 0;
  // oxlint-disable-next-line typescript/unbound-method -- Native fill is called with its explicit receiver below.
  const fill = Uint8Array.prototype.fill;
  // Observe the native mutable-buffer boundary without replacing an application module.
  vi.spyOn(Uint8Array.prototype, "fill").mockImplementation(function (
    this: Uint8Array,
    value: number,
    start?: number,
    end?: number,
  ) {
    if (this.length === 32 && value === 0) cleared.push(this);
    return fill.call(this, value, start, end);
  });
});

afterEach(() => vi.restoreAllMocks());

describe("a BIP-322 signing key has one bounded operation lifetime", () => {
  it("clears its bytes when request admission refuses", async () => {
    const signer = await keyOwner();
    await expect(signer.sign({ ...request, message: "" })).rejects.toMatchObject({
      code: "EMPTY_MESSAGE",
    });
    expect(native.packet).not.toHaveBeenCalled();
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toEqual(new Uint8Array(32));
    await expect(signer.sign(request)).rejects.toMatchObject({ code: "KEY_RELEASED" });
  });

  it("does not sign after disposal while external initialization is pending", async () => {
    const pending = startup();
    const signer = await keyOwner();
    const result = signer.sign(request);
    await settle();
    expect(native.init).toHaveBeenCalledOnce();
    expect(native.packet).not.toHaveBeenCalled();
    signer[Symbol.dispose]();
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toEqual(new Uint8Array(32));
    pending.resolve(api());
    await expect(result).rejects.toMatchObject({ code: "KEY_RELEASED" });
    expect(native.verify).not.toHaveBeenCalled();
  });

  it("refuses concurrent use without retiring the operation already in progress", async () => {
    const pending = startup();
    const signer = await keyOwner();
    const result = signer.sign(request);
    await settle();
    await expect(signer.sign(request)).rejects.toMatchObject({ code: "SIGNING_ACTIVE" });
    expect(cleared).toHaveLength(0);
    pending.reject(new Error("Synthetic backend failure"));
    await expect(result).rejects.toMatchObject({ code: "BACKEND_FAILED" });
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toEqual(new Uint8Array(32));
  });

  it("redacts arbitrary external failure text and releases its key", async () => {
    native.packet.mockImplementation(() => {
      throw new Error("Public fake phrase pasted into a wrong field");
    });
    const signer = await keyOwner();
    await expect(signer.sign(request)).rejects.toEqual(new MessageSigningError("BACKEND_FAILED"));
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toEqual(new Uint8Array(32));
    await expect(signer.sign(request)).rejects.toMatchObject({ code: "KEY_RELEASED" });
  });
});

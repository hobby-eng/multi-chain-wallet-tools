import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HDKey } from "@scure/bip32";

interface Observations {
  payloads: Uint8Array[];
  hexInputs: Uint8Array[];
  refuseEncoding: boolean;
}

const observed = vi.hoisted((): Observations => ({
  payloads: [],
  hexInputs: [],
  refuseEncoding: false,
}));

// The external codec boundary retains only public-vector buffers so cleanup can be observed.
vi.mock("@scure/base", async (original) => {
  const actual = await original<typeof import("@scure/base")>();
  return {
    ...actual,
    createBase58check: (...args: Parameters<typeof actual.createBase58check>) => {
      const codec = actual.createBase58check(...args);
      return {
        ...codec,
        encode: (bytes: Uint8Array) => {
          observed.payloads.push(bytes);
          if (observed.refuseEncoding) throw new Error("Synthetic codec refusal.");
          return codec.encode(bytes);
        },
      };
    },
  };
});

vi.mock("@noble/hashes/utils.js", async (original) => {
  const actual = await original<typeof import("@noble/hashes/utils.js")>();
  return {
    ...actual,
    bytesToHex: (bytes: Uint8Array) => {
      observed.hexInputs.push(bytes);
      return actual.bytesToHex(bytes);
    },
  };
});

import { Bip85 } from "../src/bip85.js";
import { encodeWif } from "../src/crypto.js";

/** The published BIP85 application-vector root, never an owner's wallet. */
const ROOT =
  "xprv9s21ZrQH143K2LBWUUQRFXhucrQqBpKdRRxNVq2zBqsx8HVqFk2uYo8kmbaLLHRdqtQpUm98uKfu3vca1LqdGhUtyoFnCNkfmXRyPXLjbKb";

beforeEach(() => {
  observed.payloads.length = 0;
  observed.hexInputs.length = 0;
  observed.refuseEncoding = false;
});
afterEach(() => vi.restoreAllMocks());

describe("BIP85 secret allocation lifetimes", () => {
  it("wipes the root when deriving its child throws", () => {
    const cleared = vi.spyOn(HDKey.prototype, "wipePrivateData");
    vi.spyOn(HDKey.prototype, "derive").mockImplementation(() => {
      throw new Error("Synthetic child refusal.");
    });
    expect(() => Bip85.hex(ROOT, 16, 0)).toThrow("Synthetic child refusal.");
    expect(cleared).toHaveBeenCalledOnce();
  });

  it("wipes the private-key getter copy after deriving entropy", () => {
    const getter = Object.getOwnPropertyDescriptor(HDKey.prototype, "privateKey")?.get;
    if (getter === undefined) throw new Error("The external HDKey contract changed.");
    const copies: Uint8Array[] = [];
    vi.spyOn(HDKey.prototype, "privateKey", "get").mockImplementation(function (this: HDKey) {
      const value: unknown = getter.call(this);
      if (value !== null && !(value instanceof Uint8Array))
        throw new Error("The external HDKey getter returned a malformed value.");
      if (value !== null && this.depth === 4) copies.push(value);
      return value;
    });
    Bip85.hex(ROOT, 16, 0);
    expect(copies.length).toBeGreaterThan(0);
    for (const bytes of copies) expect(bytes.every((byte) => byte === 0)).toBe(true);
  });

  for (const refuses of [false, true]) {
    it(`wipes the XPRV payload when encoding refuses: ${refuses}`, () => {
      observed.refuseEncoding = refuses;
      if (refuses) expect(() => Bip85.xprv(ROOT, 0)).toThrow("Synthetic codec refusal.");
      else expect(Bip85.xprv(ROOT, 0).xprv.startsWith("xprv")).toBe(true);
      const payload = observed.payloads.find((bytes) => bytes.length === 78);
      expect(payload).toBeDefined();
      expect(payload?.every((byte) => byte === 0)).toBe(true);
    });

    it(`wipes a WIF payload while retaining its borrowed key when encoding refuses: ${refuses}`, () => {
      const key = new Uint8Array(32).fill(1);
      observed.refuseEncoding = refuses;
      if (refuses) expect(() => encodeWif(key, 0x80)).toThrow("Synthetic codec refusal.");
      else expect(encodeWif(key, 0x80)).not.toBe("");
      const payload = observed.payloads.find((bytes) => bytes.length === 34);
      expect(payload).toBeDefined();
      expect(payload?.every((byte) => byte === 0)).toBe(true);
      expect(key.every((byte) => byte === 1)).toBe(true);
      key.fill(0);
    });
  }

  it("leaves no unowned hexadecimal-output copy after the entropy is wiped", () => {
    Bip85.hex(ROOT, 16, 0);
    const inputs = observed.hexInputs.filter((bytes) => bytes.length === 16);
    expect(inputs.length).toBeGreaterThan(0);
    for (const bytes of inputs) expect(bytes.every((byte) => byte === 0)).toBe(true);
  });
});

import { afterEach, expect, it, vi } from "vitest";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { Slip39RestoreRequest } from "../src/slip39-restore-request.js";
import { PassiveSlip39 } from "../../../test/support/slip39-passive.js";

vi.mock("@noble/hashes/pbkdf2.js", () => ({
  pbkdf2: vi.fn(
    (_hash: unknown, _password: Uint8Array, _salt: Uint8Array, options: { dkLen: number }) =>
      new Uint8Array(options.dkLen),
  ),
}));
afterEach(() => vi.clearAllMocks());

it("transfers inputs once and disposes detached sender/received buffers independently", () => {
  using sender = new Slip39RestoreRequest(PassiveSlip39.share(1), "ASCII password");
  expect(sender.assess().requiresConfirmation).toBe(false);
  const { request, transfer } = sender.take();
  const received: unknown = structuredClone(request, { transfer: [...transfer] });
  expect(request.shares.byteLength).toBe(0);
  expect(() => sender.wipe()).not.toThrow();
  expect(() => sender.take()).toThrow();
  using receiver = new Slip39RestoreRequest(received);
  const entropy = receiver.recover();
  expect(entropy).toHaveLength(16);
  entropy.fill(0);
  // The receiver owns the transferred native arrays, not another hidden text copy.
  if (
    typeof received !== "object" ||
    received === null ||
    !("shares" in received) ||
    !(received.shares instanceof Uint8Array)
  )
    throw new Error("Native transfer fixture did not return bytes.");
  receiver.wipe();
  expect(received.shares.every((byte) => byte === 0)).toBe(true);
});

it("independently refuses unconfirmed expensive work before its KDF", () => {
  using sender = new Slip39RestoreRequest(PassiveSlip39.share(15), "");
  const { request } = sender.take(false);
  using receiver = new Slip39RestoreRequest(request);
  expect(() => receiver.recover()).toThrow("Confirm the assessed SLIP-39 work");
  expect(pbkdf2).not.toHaveBeenCalled();
});

it("admits confirmed expensive metadata only through the passive KDF", () => {
  using sender = new Slip39RestoreRequest(PassiveSlip39.share(15), "");
  const { request } = sender.take(true);
  using receiver = new Slip39RestoreRequest(request);
  const entropy = receiver.recover();
  entropy.fill(0);
  expect(pbkdf2).toHaveBeenCalledTimes(4);
});

it.each([false, true])("retires admitted wire buffers on later malformed=%s metadata", (throws) => {
  const shares = Uint8Array.of(1, 2);
  const passphrase = Uint8Array.of(3, 4);
  const wire = {
    shares,
    passphrase,
    get confirmed(): unknown {
      if (throws) throw new Error("Synthetic private getter fault");
      return "invalid";
    },
  };
  expect(() => new Slip39RestoreRequest(wire)).toThrow("worker request is invalid");
  expect(shares).toEqual(Uint8Array.of(0, 0));
  expect(passphrase).toEqual(Uint8Array.of(0, 0));
});

it("refuses malformed UTF8 with a stable safe code and releases its inputs", () => {
  const shares = Uint8Array.of(0xff);
  const passphrase = new Uint8Array();
  using receiver = new Slip39RestoreRequest({ shares, passphrase, confirmed: true });
  expect(() => receiver.recover()).toThrow("not valid text");
  receiver.wipe();
  expect(shares).toEqual(Uint8Array.of(0));
});

it("refuses unsupported phrase size and invalid password before any stretching", () => {
  using large = new Slip39RestoreRequest(PassiveSlip39.share(15, 128));
  expect(() => large.assess()).toThrow("BIP39 entropy size");
  expect(pbkdf2).not.toHaveBeenCalled();
  using nonAscii = new Slip39RestoreRequest(PassiveSlip39.share(15), "\uFEFFpassword");
  expect(() => nonAscii.assess()).toThrow("ASCII");
  expect(pbkdf2).not.toHaveBeenCalled();
});

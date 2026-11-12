import { beforeEach, describe, expect, it, vi } from "vitest";
import { Bip322VerificationError, Bip322Verifier } from "../src/bip322-verifier.js";

const native = vi.hoisted(() => ({ init: vi.fn(), verify: vi.fn() }));
vi.mock("btcutil-js", () => ({ init: native.init }));

beforeEach(() => {
  native.init.mockReset().mockResolvedValue({ bip322: { verifyMessage: native.verify } });
  native.verify.mockReset();
});

describe("BIP-322 verification preserves the distinction between a mismatch and a failed check", () => {
  it("preserves the external validity and time-constraint result", async () => {
    const result = { valid: true, timeConstraints: { lockTime: 500 } };
    native.verify.mockReturnValue(result);
    const verifier = new Bip322Verifier();
    expect(
      await verifier.verify("public message", " public address ", " public signature ", "mainnet"),
    ).toBe(result);
    expect(native.verify).toHaveBeenCalledExactlyOnceWith(
      "public message",
      "public address",
      "public signature",
      "mainnet",
    );
    await verifier.verify("public message", "public address", "public signature", "mainnet");
    expect(native.init).toHaveBeenCalledOnce();
  });

  it("preserves an explicit negative result", async () => {
    native.verify.mockReturnValue({ valid: false });
    expect(await new Bip322Verifier().verify("message", "address", "signature", "mainnet")).toEqual(
      { valid: false },
    );
  });

  it.each([
    new Error("Public fake phrase in an external error"),
    new TypeError("Synthetic runtime failure"),
    new Error("verify message: invalid signature: unknown backend problem"),
    { message: "verify message: invalid signature: err_code=ErrNullFail, err_desc=forged shape" },
  ])(
    "redacts and rejects an unknown external failure without claiming a mismatch",
    async (failure) => {
      native.verify.mockImplementation(() => {
        throw failure;
      });
      await expect(
        new Bip322Verifier().verify("message", "address", "signature", "mainnet"),
      ).rejects.toEqual(new Bip322VerificationError());
    },
  );

  it.each([
    "verify message: error decoding signature as base64: illegal base64 data at input byte 3",
    "verify message: error parsing signature as witness: EOF",
    "verify message: error parsing signature as full variant: error parsing transaction: x",
    "verify message: error parsing signature as pof variant: error parsing packet: x",
    "verify message: signature too short",
  ])("refuses unreadable signature text with its own code: %s", async (text) => {
    native.verify.mockImplementation(() => {
      throw new Error(text);
    });
    await expect(
      new Bip322Verifier().verify("message", "address", "signature", "mainnet"),
    ).rejects.toEqual(new Bip322VerificationError("UNREADABLE_SIGNATURE"));
  });

  it("refuses a simple signature for an address that needs a full one with its own code", async () => {
    native.verify.mockImplementation(() => {
      throw new Error(
        "verify message: only native SegWit outputs (P2WPKH, P2WSH, P2TR) are supported for the simple variant",
      );
    });
    await expect(
      new Bip322Verifier().verify("message", "address", "signature", "mainnet"),
    ).rejects.toEqual(new Bip322VerificationError("SIMPLE_FOR_ADDRESS"));
  });

  it("keeps near misses of those texts a failure of the check", async () => {
    for (const text of [
      "verify message: error parsing signature as something new: x",
      "verify message: signature too short, and more",
      "verify message: only native SegWit outputs are supported for the simple variant",
      "decode address: error decoding signature as base64: x",
    ]) {
      native.verify.mockImplementation(() => {
        throw new Error(text);
      });
      await expect(
        new Bip322Verifier().verify("message", "address", "signature", "mainnet"),
      ).rejects.toEqual(new Bip322VerificationError());
    }
  });

  it("does not interpret a startup exception as a script outcome", async () => {
    native.init.mockRejectedValue(
      new Error("verify message: invalid signature: err_code=ErrNullFail, err_desc=startup fault"),
    );
    await expect(
      new Bip322Verifier().verify("message", "address", "signature", "mainnet"),
    ).rejects.toEqual(new Bip322VerificationError());
    expect(native.verify).not.toHaveBeenCalled();
  });
});

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

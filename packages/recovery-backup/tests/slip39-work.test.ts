import { PassiveSlip39 } from "../../../test/support/slip39-passive.js";
// Real share framing, checksum, admission and cleanup; PBKDF2 is passive even at exponent15.
import { afterEach, expect, it, vi } from "vitest";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { Slip39 } from "../src/slip39.js";

vi.mock("@noble/hashes/pbkdf2.js", () => ({
  pbkdf2: vi.fn(
    (_hash: unknown, _password: Uint8Array, _salt: Uint8Array, options: { dkLen: number }) =>
      new Uint8Array(options.dkLen),
  ),
}));
afterEach(() => vi.clearAllMocks());

it.each([
  [0, 10000n, false],
  [1, 20000n, false],
  [15, 327680000n, true],
] as const)("assesses exponent%s without stretching", (exponent, iterations, confirmation) => {
  using plan = Slip39.prepare([PassiveSlip39.share(exponent)]);
  expect(plan.work).toMatchObject({
    iterationExponent: exponent,
    valueBytes: 16,
    rounds: 4,
    prfIterations: iterations,
    requiresConfirmation: confirmation,
  });
  expect(pbkdf2).not.toHaveBeenCalled();
  plan.wipe();
  expect(() => plan.recover()).toThrow();
  expect(plan.work.prfIterations).toBe(iterations);
});

it("counts every PBKDF2 output hash block", () => {
  using plan = Slip39.prepare([PassiveSlip39.share(15, 128)]);
  expect(plan.work.prfIterations).toBe(655360000n);
  expect(pbkdf2).not.toHaveBeenCalled();
});

it("refuses mixed sets before any stretching", () => {
  const first = PassiveSlip39.share(0);
  const second = PassiveSlip39.share(1);
  expect(() => Slip39.prepare([first, second])).toThrow(/different sets/u);
  expect(pbkdf2).not.toHaveBeenCalled();
});

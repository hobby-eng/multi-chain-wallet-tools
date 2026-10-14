import { describe, expect, it } from "vitest";
import { RelativeSequence } from "../src/consensus-limits.js";
import { relativeLock } from "../src/descriptor-policy.js";
import { decodeScript } from "../src/script.js";

// The relative-lock facts of BIP68 and BIP112 in one place, and what each context makes of them
// (AUD-024-FUN002). Expected values follow the BIPs, not the code under test.

/** The public generator point, a valid compressed key with no wallet behind it. */
const POINT = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

/** A 1-of-1 multisig spend, or a recovery key after OP_CHECKSEQUENCEVERIFY with `operand`. */
function recoveryScript(operand: string): string {
  return `635121${POINT}51ae67${operand}b27521${POINT}ac68`;
}

describe("the facts of a relative sequence (BIP68, BIP112)", () => {
  it("reads blocks, 512-second units and the disable flag", () => {
    const blocks = new RelativeSequence(144);
    expect([blocks.disabled, blocks.timeBased, blocks.units, blocks.delay]).toEqual([
      false,
      false,
      144,
      "144 blocks",
    ]);
    const time = new RelativeSequence((1 << 22) | 10);
    expect([time.timeBased, time.units, time.seconds, time.delay]).toEqual([
      true,
      10,
      5120,
      "5120 seconds",
    ]);
    expect(new RelativeSequence(0x80000001).disabled).toBe(true);
    // Bits outside the mask and the two flags add nothing.
    expect(new RelativeSequence(0x00010090).units).toBe(144);
  });

  it("says a descriptor's disabled older() is no active lock", () => {
    expect(relativeLock(0x80000001)).toBe(
      "2147483649 (disabled flag set; invalid as an active relative lock)",
    );
    expect(relativeLock(144)).toBe("144 = 144 blocks");
  });

  it("rounds requested seconds up within the 16-bit BIP68 delay", () => {
    // Independently calculated from BIP68's 512-second units and type flag, not a round trip.
    for (const [seconds, encoded, delay] of [
      [0, 4_194_304, 0],
      [1, 4_194_305, 512],
      [512, 4_194_305, 512],
      [513, 4_194_306, 1024],
      [33_553_920, 4_259_839, 33_553_920],
    ]) {
      const sequence = RelativeSequence.fromSeconds(seconds!);
      expect(sequence.value).toBe(encoded);
      expect(sequence.seconds).toBe(delay);
      expect(sequence.disabled).toBe(false);
    }
    expect(() => RelativeSequence.fromSeconds(33_553_921)).toThrow(
      "Relative time delay is too large.",
    );
    for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => RelativeSequence.fromSeconds(invalid)).toThrow(
        "Relative time delay must be a non-negative safe integer.",
      );
  });
});

describe("a raw script's CSV operand", () => {
  it("imposes no delay with its disable flag set (BIP112)", () => {
    // 0x80000001 as a five-byte script number, positive: the disable flag and one block.
    const policy = decodeScript(
      recoveryScript("050100008000"),
      "bitcoin",
      "mainnet",
      "spending",
    ).inferredPolicy;
    expect(policy).toContain("no delay (the CSV operand has its disable flag set)");
    expect(policy).not.toContain("relative delay");
  });

  it("names the delay of an active operand, in blocks or in seconds", () => {
    expect(
      decodeScript(recoveryScript("029000"), "bitcoin", "mainnet", "spending").inferredPolicy,
    ).toContain("one recovery key after relative delay 144 blocks");
    expect(
      decodeScript(recoveryScript("030a0040"), "bitcoin", "mainnet", "spending").inferredPolicy,
    ).toContain("one recovery key after relative delay 5120 seconds");
  });

  it("takes no branch through a negative operand, which fails CSV", () => {
    expect(
      decodeScript(recoveryScript("4f"), "bitcoin", "mainnet", "spending").inferredPolicy,
    ).not.toContain("recovery key after");
  });
});

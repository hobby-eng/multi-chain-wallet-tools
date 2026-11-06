import { describe, expect, it } from "vitest";
import { PolicyLock } from "../src/policy-lock.js";
import { CONSENSUS_LIMITS, RelativeSequence } from "../src/consensus-limits.js";

describe("Policy lock kind admission", () => {
  it("preserves a stable shared refusal when relative-time rounding exceeds BIP68", () => {
    const maximum = CONSENSUS_LIMITS.bip68SequenceMask * RelativeSequence.secondsPerUnit;
    expect(new PolicyLock("relative-time", maximum).fragment).toBe("older(4259839)");
    expect(() => new PolicyLock("relative-time", maximum + 1)).toThrow(
      expect.objectContaining({ code: "sequence.time.range" }),
    );
  });
  it.each(["unknown", "relative_time", null, undefined, 42, {}])(
    "refuses an unsupported lock kind before compiling it: case %#",
    (kind) => {
      expect(() => Reflect.construct(PolicyLock, [kind, 512])).toThrow(
        expect.objectContaining({ code: "policy.lock.kind" }),
      );
      expect(() => PolicyLock.normalizeInputValue(kind, 1, "minutes")).toThrow(
        expect.objectContaining({ code: "policy.lock.kind" }),
      );
    },
  );
  it("preserves every supported fragment and the relative-time rounding rule", () => {
    expect(new PolicyLock("none", 0).fragment).toBe("");
    expect(new PolicyLock("height", 100).fragment).toBe("after(100)");
    expect(new PolicyLock("time", 500000000).fragment).toBe("after(500000000)");
    expect(new PolicyLock("relative-blocks", 144).fragment).toBe("older(144)");
    expect(new PolicyLock("relative-time", 513).fragment).toBe("older(4194306)");
    expect(PolicyLock.normalizeInputValue("relative-time", 1, "minutes")).toBe(60);
  });
});

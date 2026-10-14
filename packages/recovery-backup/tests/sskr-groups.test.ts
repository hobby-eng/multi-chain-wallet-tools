import { describe, expect, it } from "vitest";
import { SskrGroupPolicy, validateSskrGroups } from "../src/sskr-groups.js";

describe("SSKR group policy", () => {
  it("exposes the BCR-2020-011 four-bit index limits to every host", () => {
    expect(SskrGroupPolicy.parameters()).toEqual({
      minimum: 1,
      maximumGroups: 16,
      maximumMembers: 16,
    });
    expect(Object.isFrozen(SskrGroupPolicy.parameters())).toBe(true);
    const groups = Array.from({ length: 16 }, () => ({ threshold: 16, count: 16 }));
    expect(new SskrGroupPolicy(16, groups).pack()).toEqual(new Uint8Array(32).fill(16));
  });

  it("owns its validated policy independently of caller arrays and packed outputs", () => {
    const groups = [
      { threshold: 2, count: 3 },
      { threshold: 1, count: 2 },
    ];
    const policy = new SskrGroupPolicy(2, groups);
    groups[0]!.count = 17;
    policy.pack().fill(0);
    expect(policy.groupThreshold).toBe(2);
    expect(policy.pack()).toEqual(Uint8Array.of(2, 3, 1, 2));
  });

  it.each([0, -1, 1.5, NaN, Infinity, 17])("refuses a member count of %s", (count) => {
    expect(() => new SskrGroupPolicy(1, [{ threshold: 1, count }])).toThrow(
      "SSKR group 1 must use an integer threshold/count from 1 to 16.",
    );
  });

  it.each([0, -1, 1.5, NaN, Infinity, 4])("refuses a member threshold of %s", (threshold) => {
    expect(() => new SskrGroupPolicy(1, [{ threshold, count: 3 }])).toThrow(
      "SSKR group 1 must use an integer threshold/count from 1 to 16.",
    );
  });

  it.each([undefined, 0, -1, 1.5, NaN, Infinity, 2])(
    "refuses a group threshold of %s for one group",
    (threshold) => {
      expect(() => new SskrGroupPolicy(threshold, [{ threshold: 1, count: 1 }])).toThrow(
        "SSKR groups required must be an integer from 1 through the number of groups.",
      );
    },
  );

  it("refuses a seventeenth group and keeps Envelope's deliberate no-groups policy", () => {
    const groups = Array.from({ length: 17 }, () => ({ threshold: 1, count: 1 }));
    expect(() => new SskrGroupPolicy(1, groups)).toThrow("SSKR requires from 1 to 16 groups.");
    expect(() =>
      validateSskrGroups(1, groups, { label: "Envelope SSKR", allowEmpty: true }),
    ).toThrow("Envelope SSKR supports at most 16 groups.");
    for (const threshold of [undefined, 0]) {
      expect(
        validateSskrGroups(threshold, [], { label: "Envelope SSKR", allowEmpty: true }),
      ).toEqual(new Uint8Array());
    }
    expect(() => validateSskrGroups(1, [], { label: "Envelope SSKR", allowEmpty: true })).toThrow(
      "Envelope SSKR groups required must be an integer from 1 through the number of groups.",
    );
    expect(() => new SskrGroupPolicy(0, [])).toThrow(
      "SSKR groups required must be an integer from 1 through the number of groups.",
    );
  });
});

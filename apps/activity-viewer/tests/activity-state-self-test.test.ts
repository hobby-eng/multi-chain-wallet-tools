import { describe, expect, it } from "vitest";
import { ActivityStateSelfTest } from "../src/activity-state-self-test.js";

describe("Activity Viewer state startup checks", () => {
  it("checks exact accounting, incomplete spend refusal, and network-bound resources locally", () => {
    expect(ActivityStateSelfTest.run()).toEqual([
      "Core confirmation and export accounting",
      "Orchard completeness and spend state",
      "Platform history resource binding",
    ]);
  });
});

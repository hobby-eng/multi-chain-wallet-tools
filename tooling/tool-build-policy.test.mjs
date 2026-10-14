import { describe, expect, it } from "vitest";
import { BUILD_PROFILES } from "./build-profiles.mjs";
import { ToolBuildPolicy } from "./tool-build-policy.mjs";

describe("shared build admission before projection", () => {
  const policy = new ToolBuildPolicy("key-derivation", BUILD_PROFILES["multi-chain"]);
  it("refuses unknown included and excluded values through the public owner", () => {
    for (const [included, excluded] of [
      [["unknown"], []],
      [[], ["unknown"]],
    ]) {
      expect(() => policy.coins(included, excluded)).toThrow(/Unknown/u);
      expect(() => policy.features(["bitcoin"], included, excluded)).toThrow(/Unknown/u);
    }
  });
  it("normalizes aliases and retains required dependency refusals", () => {
    expect(policy.features(["bitcoin"], ["derive", "matcher"])).toEqual([
      "derive",
      "wallet-matcher",
    ]);
    expect(() => policy.features(["bitcoin"], ["derive", "mnemocode-cards"])).toThrow(
      /requires the "mnemocode"/u,
    );
    expect(() =>
      new ToolBuildPolicy("key-derivation", BUILD_PROFILES["dash-community"]).coins(["bitcoin"]),
    ).toThrow(/only Dash/u);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@ckd/dash-wasm/dash_shielded_wasm_bg.wasm", () => ({
  default: readFileSync(
    new URL("../../dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm", import.meta.url),
  ),
}));
import { deriveDashShielded } from "../src/coins/dash/shielded.js";

describe("Dash Shielded caller seed ownership", () => {
  it("preserves the caller's seed and gives identical output on reuse", () => {
    const seed = Uint8Array.from({ length: 64 }, (_, index) => index);
    const original = seed.slice();
    const options = { seed, network: "testnet" as const, account: 0, start: 0, count: 1 };
    const first = deriveDashShielded(options);
    expect(seed).toEqual(original);
    expect(first.rows).toHaveLength(1);
    expect(deriveDashShielded(options)).toEqual(first);
    expect(deriveDashShielded({ ...options, seed: original.slice() })).toEqual(first);
    expect(seed).toEqual(original);
  });

  it("preserves rejected caller input when the actual WASM binding throws", () => {
    const seed = Uint8Array.of(7); // ZIP32 requires at least 32 bytes.
    const original = seed.slice();
    expect(() =>
      deriveDashShielded({ seed, network: "testnet", account: 0, start: 0, count: 1 }),
    ).toThrow();
    expect(seed).toEqual(original);
  });
});

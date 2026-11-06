import { DerivationBranches } from "@ckd/coins/derivation-branches.js";
import { describe, expect, it } from "vitest";
import { getCoinAdapter } from "@ckd/coins/registry.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { DerivationResults } from "@ckd/ui/derivation-results.js";

function result(id: string): DerivationResult {
  return {
    id,
    title: id,
    networkLabel: "test",
    pathTemplate: "m/i",
    basicSummary: [],
    summary: [],
    rows: [{ index: 0, path: "m/0", title: "0", basic: [], advanced: [] }],
    notices: [],
  };
}

describe("receive/change result planning", () => {
  it("uses adapter metadata for Bitcoin and Dash Core without coin-specific UI branches", () => {
    expect(new DerivationBranches(getCoinAdapter("bitcoin-taproot"), 0, true).plans).toEqual([
      { kind: "receive", branch: 0 },
      { kind: "change", branch: 1 },
    ]);
    expect(new DerivationBranches(getCoinAdapter("dash-core"), 0, true).plans).toEqual([
      { kind: "receive", branch: 0 },
      { kind: "change", branch: 1 },
    ]);
    expect(new DerivationBranches(getCoinAdapter("dash-legacy-mobile"), 0, true).plans).toEqual([
      { kind: "receive", branch: 0 },
      { kind: "change", branch: 1 },
    ]);
  });

  it("preserves explicitly selected branches for callers without the extra change output", () => {
    expect(new DerivationBranches(getCoinAdapter("ethereum"), 1, true).plans).toEqual([
      { kind: "receive", branch: 1 },
    ]);
    expect(new DerivationBranches(getCoinAdapter("dash-platform"), 7, false).plans).toEqual([
      { kind: "receive", branch: 7 },
    ]);
  });

  it("creates independent selection and paging state for overlapping row indices", () => {
    const results = new DerivationResults();
    results.accept("receive", result("receive"));
    results.accept("change", result("change"));
    results.activate("receive");
    results.select(0, false);
    results.moveWindow(200);
    results.activate("change");
    expect(results.selected.has(0)).toBe(true);
    expect(results.windowStart).toBe(0);
    results.activate("receive");
    expect(results.selected.has(0)).toBe(false);
    expect(results.windowStart).toBe(200);
    results.wipe();
  });
});

it("plans Platform receive and internal/change with hardened paths on both networks", () => {
  const adapter = getCoinAdapter("dash-platform");
  for (const network of ["mainnet", "testnet"] as const) {
    const paths = new DerivationBranches(adapter, 0, true).plans.map((plan) =>
      adapter.pathPreview({ network, account: 2, branch: plan.branch, start: 0, count: 1 }),
    );
    const coin = network === "mainnet" ? 5 : 1;
    expect(paths).toEqual([`m/9'/${coin}'/17'/2'/0'/0`, `m/9'/${coin}'/17'/2'/1'/0`]);
  }
});

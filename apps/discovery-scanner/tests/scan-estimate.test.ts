import { describe, expect, it, vi } from "vitest";

// The coin registry loads the Dash shielded WASM; the test reads it from disk as the build embeds it.
vi.mock("@ckd/dash-wasm/dash_shielded_wasm_bg.wasm", async () => {
  const { readFileSync } = await import("node:fs");
  return {
    default: readFileSync(
      new URL(
        "../../../packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm",
        import.meta.url,
      ),
    ),
  };
});
import {
  LARGE_SCAN_LOOKUPS,
  countCandidateLines,
  formatLookupEstimate,
  needsLargeScanConfirmation,
  seedLookupEstimate,
  seedLookupsPerPhrase,
  type SeedLookupSettings,
} from "../src/scan-estimate.js";
import { getRecoveryCoin } from "../src/coins/index.js";

const coins = (...ids: string[]) => ids.map(getRecoveryCoin);

/** The scanner's default address counts, with every optional Dash family off. */
const defaults: SeedLookupSettings = {
  coreReceiveCount: "100",
  coreChangeCount: "100",
  scanCore: true,
  scanLegacyCore: false,
  legacyCoreCount: "100",
  scanCoinJoin: false,
  coinJoinExternalCount: "100",
  coinJoinInternalCount: "20",
  scanIdentityFunding: false,
  scanProviderCollateral: false,
  providerCollateralCount: "100",
  scanPlatformAddresses: true,
  platformAddressCount: "100",
  scanPlatformIdentities: true,
  identityScanLimit: "10",
  requestConcurrency: "5",
  includeUsedZeroBalance: false,
  scanShieldedPool: false,
};

describe("seed scan lookup estimate", () => {
  it("counts one lookup per batch of 100 addresses for each standard branch", () => {
    // Four address families with a receive and a change branch each.
    expect(seedLookupsPerPhrase(coins("bitcoin"), defaults)).toBe(8);
    // Three wallet profiles, receive addresses only.
    expect(seedLookupsPerPhrase(coins("ethereum"), defaults)).toBe(3);
    // Core receive + change in two batches, two Platform batches, ten identity proof calls.
    expect(seedLookupsPerPhrase(coins("dash"), defaults)).toBe(14);
    expect(seedLookupsPerPhrase(coins("bitcoin", "ethereum", "dash"), defaults)).toBe(25);
    expect(seedLookupsPerPhrase(coins("bitcoin"), { ...defaults, coreReceiveCount: "101" })).toBe(
      12,
    );
  });

  it("refuses a coin it has no estimate for instead of dropping it", () => {
    expect(() => seedLookupsPerPhrase([{ id: "unknown-coin" }], defaults)).toThrow(
      "No lookup estimate",
    );
  });

  it("counts candidate lines the way the scan pairs them", () => {
    expect(countCandidateLines("")).toBe(0);
    expect(countCandidateLines("one")).toBe(1);
    expect(countCandidateLines("one\n")).toBe(1);
    expect(countCandidateLines("one\r\n\n  \ntwo\r\n")).toBe(2);
  });

  it("estimates total lookups and time at the selected concurrency", () => {
    const estimate = seedLookupEstimate(25_000, 8, "5");
    expect(estimate).toEqual({ lookups: 200_000, seconds: 40_000 });
    expect(formatLookupEstimate(25_000, estimate)).toBe(
      "25,000 phrases · at least 200,000 provider lookups · about 11 h 7 min",
    );
    expect(formatLookupEstimate(1, seedLookupEstimate(1, 8, "5"))).toBe(
      "1 phrase · at least 8 provider lookups · under a minute",
    );
    // The shared concurrency rule names the field and its range.
    expect(() => seedLookupEstimate(1, 8, "6")).toThrow(
      /^Estimate concurrency must be an integer/u,
    );
  });

  it("asks for confirmation only above the large-scan limit", () => {
    expect(needsLargeScanConfirmation({ lookups: LARGE_SCAN_LOOKUPS, seconds: 0 })).toBe(false);
    expect(needsLargeScanConfirmation({ lookups: LARGE_SCAN_LOOKUPS + 1, seconds: 0 })).toBe(true);
  });
});

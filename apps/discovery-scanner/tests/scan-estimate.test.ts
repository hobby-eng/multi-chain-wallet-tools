import { describe, expect, it } from "vitest";
import {
  LARGE_SCAN_LOOKUPS,
  countCandidateLines,
  formatLookupEstimate,
  needsLargeScanConfirmation,
  seedLookupEstimate,
  seedLookupsPerPhrase,
  type SeedLookupSettings,
} from "../src/scan-estimate.js";

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
    expect(seedLookupsPerPhrase(["bitcoin"], defaults)).toBe(8);
    // Three wallet profiles, receive addresses only.
    expect(seedLookupsPerPhrase(["ethereum"], defaults)).toBe(3);
    // Core receive + change in two batches, two Platform batches, ten identity proof calls.
    expect(seedLookupsPerPhrase(["dash"], defaults)).toBe(14);
    expect(seedLookupsPerPhrase(["bitcoin", "ethereum", "dash"], defaults)).toBe(25);
    expect(seedLookupsPerPhrase(["bitcoin"], { ...defaults, coreReceiveCount: "101" })).toBe(12);
  });

  it("refuses a coin it has no estimate for instead of dropping it", () => {
    expect(() => seedLookupsPerPhrase(["unknown-coin"], defaults)).toThrow("No lookup estimate");
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
    expect(() => seedLookupEstimate(1, 8, "6")).toThrow("Invalid estimate concurrency");
  });

  it("asks for confirmation only above the large-scan limit", () => {
    expect(needsLargeScanConfirmation({ lookups: LARGE_SCAN_LOOKUPS, seconds: 0 })).toBe(false);
    expect(needsLargeScanConfirmation({ lookups: LARGE_SCAN_LOOKUPS + 1, seconds: 0 })).toBe(true);
  });
});

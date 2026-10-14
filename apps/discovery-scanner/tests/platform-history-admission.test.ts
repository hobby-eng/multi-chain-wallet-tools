import { describe, expect, it } from "vitest";
import { bech32m } from "@scure/base";
import { PlatformAddressHistoryAdmission } from "@ckd/dash-network/platform-address-history-admission.js";
import type { PlatformHistorySummaryView } from "@ckd/network-boundary/protocol.js";
import { validatePlatformHistory } from "../src/coins/dash/platform-history.js";

// Public DIP17 addresses already pinned by Discovery's Platform recovery fixtures.
const ADDRESS = "dash1kzjl7qzxy9lar37j8r37z3kvt07epqe20ckxfezw";
const OTHER_ADDRESS = "dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs";
const TESTNET_ADDRESS = bech32m.encode(
  "tdash",
  bech32m.decode(ADDRESS as `${string}1${string}`).words,
);

const history = (resource: string): PlatformHistorySummaryView => ({
  resource,
  balance: "1000",
  transactionCount: 3,
  incomingCount: 2,
  outgoingCount: 1,
  totalReceived: "2500",
  totalSent: "1500",
  totalFees: null,
  firstSeen: null,
  lastSeen: null,
  indexedHeight: 500_001,
});

describe("Discovery Platform history resource admission", () => {
  it("binds isolated address summaries through shared admission and preserves exact totals", () => {
    const admission = new PlatformAddressHistoryAdmission(ADDRESS, "mainnet");
    expect(validatePlatformHistory(history(ADDRESS), admission, 1000n)).toMatchObject({
      transactionCount: 3,
      totalReceived: 2500n,
      totalSent: 1500n,
      indexedHeight: 500_001,
    });
  });

  it.each([
    [OTHER_ADDRESS, /did not match the requested address/u],
    [TESTNET_ADDRESS, /not for mainnet/u],
    ["invalid-address", /Invalid Dash Platform Bech32m/u],
  ] as const)("refuses an address summary for %s", (resource, message) => {
    const admission = new PlatformAddressHistoryAdmission(ADDRESS, "mainnet");
    expect(() => validatePlatformHistory(history(resource), admission, 1000n)).toThrow(message);
  });

  it("retains proof-balance reconciliation after shared resource admission", () => {
    const admission = new PlatformAddressHistoryAdmission(ADDRESS, "mainnet");
    expect(() => validatePlatformHistory(history(ADDRESS), admission, 999n)).toThrow(
      /did not match the proof-verified DAPI balance/u,
    );
  });

  it("retains exact identity-ID binding for identity summaries", () => {
    const identifier = "AAQQBHYeZsnZRVbNFegRSRA8dBRHiiTxN4sgCsaU9VWu";
    expect(validatePlatformHistory(history(identifier), identifier, 1000n).totalReceived).toBe(
      2500n,
    );
    expect(() => validatePlatformHistory(history(ADDRESS), identifier, 1000n)).toThrow(
      /wrong resource/u,
    );
  });
});

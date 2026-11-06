// Real public entry points with synthetic provider/native boundaries; no egress or wallet scan.
import { afterEach, expect, it, vi } from "vitest";
import { queryCoreAddress } from "../../../packages/dash-network/src/public-address.ts";
import { normalizeIdentityLookupInput } from "../../../packages/dash-network/src/platform-identity-source.ts";
import { DashPlatformNetworkService } from "../../../apps/discovery-scanner/src/dash-platform-network.ts";
import { runBlobWorkerSelfTest } from "../../../packages/dash-network/src/blob-worker-self-test.ts";
import { dashSeedLookups, seedLookupEstimate, needsLargeScanConfirmation } from "../../../apps/discovery-scanner/src/scan-estimate.ts";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("rejects malformed matching output amounts instead of reporting exact zero flow", async () => {
  const address = "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5";
  const fetcher = async (url) => {
    let body;
    if (url.endsWith("/status")) body = { status: "ok" };
    else if (url.includes("/blocks?")) body = { resultSet: [{ height: 2531735, timestamp: "2026-09-01T19:54:32.000Z" }], pagination: { page: 1, limit: 1, total: 1482434 } };
    else if (url.includes("/transactions?")) body = { resultSet: [{ hash: "ab".repeat(32), type: "CLASSIC", blockHeight: 2531700, confirmations: 36, timestamp: "2026-09-01T18:54:00.000Z", vIn: [{ address, amount: "200" }, { address: "Xother", amount: "900" }], vOut: [{ value: "not-an-amount", address, addresses: [address] }] }], pagination: { page: 1, limit: 1, total: 1 } };
    else body = { address, balance: "810", received: "1000", sent: "200", txCount: 1 };
    return Response.json(body);
  };
  await expect(queryCoreAddress(address, "mainnet", 20, undefined, fetcher)).rejects.toThrow();
});

it("admits a canonical 32-byte Base58 identity with leading zero bytes", async () => {
  const identifier = "1".repeat(31) + "2";
  expect(normalizeIdentityLookupInput(identifier)).toMatchObject({ kind: "identity-id", identityId: identifier });
  vi.stubGlobal("fetch", async (url) => Response.json(url.endsWith("/status")
    ? { network: "mainnet", indexer: { status: "synced" }, api: { block: { height: 10 } } }
    : { identifier, totalTransfers: 0, totalTxs: 0, balance: "0", totalGasSpent: "0", timestamp: null }));
  await expect(new DashPlatformNetworkService().platformIdentityHistory("mainnet", identifier)).resolves.toMatchObject({ totalReceived: "0", totalSent: "0" });
});

it("counts separately queried Core branches before the large-scan threshold", () => {
  const lookups = dashSeedLookups({ coreReceiveCount: "1", coreChangeCount: "1", scanCore: true, scanLegacyCore: false, legacyCoreCount: "0", scanCoinJoin: false, coinJoinExternalCount: "0", coinJoinInternalCount: "0", scanIdentityFunding: false, scanProviderCollateral: false, providerCollateralCount: "0", scanPlatformAddresses: false, platformAddressCount: "0", scanPlatformIdentities: false, identityScanLimit: "1", requestConcurrency: "5", includeUsedZeroBalance: false, scanShieldedPool: false });
  // Paper arithmetic only: no 600-phrase derivation, requests or KDF work is executed.
  expect({ minimum: lookups >= 2, confirmation: needsLargeScanConfirmation(seedLookupEstimate(600, lookups, "5")) }).toEqual({ minimum: true, confirmation: true });
});

it("revokes the public Blob URL if the native Worker constructor refuses", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-audit");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal("Worker", class { constructor() { throw new DOMException("synthetic CSP refusal", "SecurityError"); } });
  await expect(runBlobWorkerSelfTest()).rejects.toThrow("synthetic CSP refusal");
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:synthetic-audit");
});

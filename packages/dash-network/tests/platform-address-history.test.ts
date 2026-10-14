import { describe, expect, it, vi } from "vitest";
import { queryPlatformAddressHistory } from "../src/platform-address-history.js";
import { bech32m } from "@scure/base";

const PLATFORM_ADDRESS = "dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs";

// Synthetic DIP18 P2PKH payload: type 0xb0 followed by a zero HASH160 (20 bytes).
const syntheticAddress = (prefix: string): string =>
  bech32m.encode(prefix, bech32m.toWords(Uint8Array.of(0xb0, ...new Uint8Array(20))));

function historyFixture(resource: unknown, statusNetwork = "evo1", infoNetwork?: unknown) {
  return vi.fn(async (input: string) => {
    const url = new URL(input);
    const body = url.pathname.endsWith("/status")
      ? {
          network: statusNetwork,
          indexer: { status: "synced" },
          api: { block: { height: 100, timestamp: "2026-09-01T00:00:00.000Z" } },
        }
      : url.pathname.endsWith("/info")
        ? {
            bech32mAddress: resource,
            ...(infoNetwork === undefined ? {} : { network: infoNetwork }),
            totalTxs: 1,
            incomingTxs: 1,
            outgoingTxs: 0,
            nonce: 0,
            balance: "9007199254740993",
            totalIncomingAmount: "9007199254740993",
            totalOutgoingAmount: null,
          }
        : {
            resultSet: [{ hash: "ab".repeat(32), incoming: true, status: "SUCCESS" }],
            pagination: { total: 1 },
          };
    return new Response(JSON.stringify(body));
  });
}

describe("Dash Platform Explorer address history", () => {
  it("requires a synchronized index and parses exact-credit totals and transitions", async () => {
    const fetcher = vi.fn(async (url: string) => {
      let body: unknown;
      if (url.endsWith("/status")) {
        body = {
          network: "evo1",
          indexer: { status: "synced", syncProgress: 100 },
          api: { block: { height: 426_096, timestamp: "2026-09-01T20:03:54.205Z" } },
        };
      } else if (url.endsWith("/info")) {
        body = {
          base58Address: "Xexample",
          bech32mAddress: PLATFORM_ADDRESS,
          totalTxs: 1,
          incomingTxs: 1,
          outgoingTxs: 0,
          nonce: 0,
          balance: "800",
          totalIncomingAmount: "1000",
          totalOutgoingAmount: null,
        };
      } else if (url.includes(`/platformAddress/${PLATFORM_ADDRESS}/transitions?`)) {
        body = {
          resultSet: [
            {
              hash: "AB".repeat(32),
              blockHash: "CD".repeat(32),
              blockHeight: 426_000,
              type: "ADDRESS_FUNDING_FROM_ASSET_LOCK",
              batchType: null,
              timestamp: "2026-09-01T19:03:54.205Z",
              gasUsed: 15_000,
              status: "SUCCESS",
              error: null,
              incoming: true,
            },
          ],
          pagination: { page: 1, limit: 1, total: 1 },
        };
      } else {
        // Any other route is unknown to the provider, as the former /transactions route is now.
        return new Response("{}", { status: 404 });
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const snapshot = await queryPlatformAddressHistory(
      PLATFORM_ADDRESS,
      "mainnet",
      20,
      undefined,
      fetcher,
    );
    expect(snapshot.provider).toBe("Dash Platform Explorer");
    expect(snapshot.indexStatus).toBe("synced");
    expect(snapshot.indexedHeight).toBe(426_096);
    expect(snapshot.totalIncomingCredits).toBe(1_000n);
    expect(snapshot.totalOutgoingCredits).toBe(0n);
    expect(snapshot.explorerBalanceCredits).toBe(800n);
    expect(snapshot.requests).toBe(3);
    expect(snapshot.transitions).toHaveLength(1);
    expect(snapshot.transitions[0]).toMatchObject({
      incoming: true,
      type: "ADDRESS_FUNDING_FROM_ASSET_LOCK",
      status: "SUCCESS",
      gasUsed: 15_000n,
    });
  });

  it("fails closed when Platform Explorer reports a lagging index", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            network: "evo1",
            indexer: { status: "syncing" },
            api: { block: { height: 1, timestamp: "2026-09-01T00:00:00.000Z" } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    await expect(
      queryPlatformAddressHistory(PLATFORM_ADDRESS, "mainnet", 20, undefined, fetcher),
    ).rejects.toThrow(/not synchronized/u);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    undefined,
    null,
    123,
    "",
    "invalid-address",
    PLATFORM_ADDRESS.replace("dash", "daSh"),
    syntheticAddress("dash"),
    syntheticAddress("tdash"),
  ])(
    "rejects missing, malformed, or unrelated resource %s before reading history",
    async (resource) => {
      const fetcher = historyFixture(resource);
      await expect(
        queryPlatformAddressHistory(PLATFORM_ADDRESS, "mainnet", 20, undefined, fetcher),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls.every(([url]) => !url.includes("/transitions?"))).toBe(true);
    },
  );

  it.each([PLATFORM_ADDRESS, PLATFORM_ADDRESS.toUpperCase(), ` ${PLATFORM_ADDRESS} `])(
    "admits equivalent normalized resource %s and retains exact indexed amounts",
    async (resource) => {
      const fetcher = historyFixture(resource);
      const snapshot = await queryPlatformAddressHistory(
        PLATFORM_ADDRESS.toUpperCase(),
        "mainnet",
        20,
        undefined,
        fetcher,
      );
      expect(snapshot.address).toBe(PLATFORM_ADDRESS);
      expect(snapshot.explorerBalanceCredits).toBe(9_007_199_254_740_993n);
      expect(snapshot.transitions).toHaveLength(1);
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(fetcher.mock.calls[1]?.[0]).toContain(`/platformAddress/${PLATFORM_ADDRESS}/info`);
    },
  );

  it("rejects a wrong status network before accepting resource info", async () => {
    const fetcher = historyFixture(PLATFORM_ADDRESS, "dash-testnet-51");
    await expect(
      queryPlatformAddressHistory(PLATFORM_ADDRESS, "mainnet", 20, undefined, fetcher),
    ).rejects.toThrow(/wrong network/u);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects an explicitly contradictory info network", async () => {
    const fetcher = historyFixture(PLATFORM_ADDRESS, "evo1", "testnet");
    await expect(
      queryPlatformAddressHistory(PLATFORM_ADDRESS, "mainnet", 20, undefined, fetcher),
    ).rejects.toThrow(/wrong network/u);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("admits testnet resources only under a matching synchronized network", async () => {
    const address = syntheticAddress("tdash");
    const fetcher = historyFixture(address.toUpperCase(), "dash-testnet-51");
    const snapshot = await queryPlatformAddressHistory(address, "testnet", 20, undefined, fetcher);
    expect(snapshot.address).toBe(address);
    expect(snapshot.explorerBalanceCredits).toBe(9_007_199_254_740_993n);
  });
});

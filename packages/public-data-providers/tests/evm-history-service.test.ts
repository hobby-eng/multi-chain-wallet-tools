import { afterEach, describe, expect, it, vi } from "vitest";
import { hasEvmHistory } from "../src/evm-network-facts.js";
import { EvmHistoryService } from "../src/evm-history-service.js";
import { EVM_NETWORKS, evmNetwork } from "../src/evm-networks.js";

afterEach(() => vi.unstubAllGlobals());

// EIP-55's own example address, and a counterparty.
const ADDRESS = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const OTHER = `0x${"22".repeat(20)}`;

/** A Blockscout API v2 root with one confirmed incoming transfer of 5 wei to ADDRESS. */
function blockscout() {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const items = String(input).endsWith("/internal-transactions")
      ? []
      : [
          {
            block_number: 1,
            hash: `0x${"ab".repeat(32)}`,
            timestamp: "2026-11-01T00:00:00.000000Z",
            from: { hash: OTHER },
            to: { hash: ADDRESS },
            status: "ok",
            value: "5",
            fee: { type: "actual", value: "1" },
          },
        ];
    return new Response(JSON.stringify({ items, next_page_params: null }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("EVM history service", () => {
  const service = new EvmHistoryService(EVM_NETWORKS.filter(hasEvmHistory));

  it.each([
    ["ethereum", "https://eth.blockscout.com/api/v2", "ETH"],
    ["ethereum-classic", "https://etc.blockscout.com/api/v2", "ETC"],
  ])(
    "reads %s's history from its own Blockscout root, in its own asset",
    async (coin, root, asset) => {
      const fetcher = blockscout();
      const history = await service.addressHistory(coin, "mainnet", ADDRESS);
      expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
        `${root}/addresses/${ADDRESS.toLowerCase()}/transactions`,
        `${root}/addresses/${ADDRESS.toLowerCase()}/internal-transactions`,
      ]);
      expect(history).toMatchObject({
        status: "complete",
        asset,
        atomicUnit: "wei",
        decimals: 18,
        source: "Blockscout",
        totalReceivedAtomic: "5",
        transactionCount: 1,
      });
    },
  );

  it("refuses a network it was not given, and a chain without a history root, before any request", async () => {
    const fetcher = blockscout();
    await expect(service.addressHistory("base", "mainnet", ADDRESS)).rejects.toMatchObject({
      code: "evm.coin",
    });
    await expect(
      service.addressHistory("ethereum-classic", "testnet", ADDRESS),
    ).rejects.toMatchObject({ code: "evm.network" });
    const withoutHistory = new EvmHistoryService([evmNetwork("base")]);
    await expect(withoutHistory.addressHistory("base", "mainnet", ADDRESS)).rejects.toThrow(
      /Base has no history provider/u,
    );
    await expect(
      service.addressHistory("ethereum-classic", "mainnet", "0xnot-an-address"),
    ).rejects.toThrow(/invalid Ethereum/iu);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

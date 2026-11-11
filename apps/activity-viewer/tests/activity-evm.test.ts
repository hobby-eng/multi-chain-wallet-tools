import { describe, expect, it, vi } from "vitest";
import { createEvmActivityAdapter } from "../src/activity-evm.js";
import { evmNetwork } from "@ckd/public-data-providers/evm-networks.js";
import { emptyPublicHistory } from "@ckd/public-data-providers/history.js";

const ADDRESS = "0x52908400098527886E0F7030069857D2E4169EE7";

/** An account reader that answers for `chainId` with one wei and nonce 3 at block 9. */
function accounts(chainId: string) {
  return {
    accounts: vi.fn(async (_coin: string, _network: string, addresses: string[]) => ({
      chainId,
      blockNumber: "9",
      entries: addresses.map((address) => ({ address, balance: "1", nonce: "3" })),
    })),
  };
}

describe("EVM network activity", () => {
  it("reads BNB Chain's balance and nonce from its own network and reports no history as unsupported", async () => {
    const reader = accounts("56");
    const adapter = createEvmActivityAdapter(evmNetwork("bnb-chain"), reader);
    expect(adapter).toMatchObject({
      id: "bnb-chain",
      label: "BNB Chain",
      asset: "BNB",
      decimals: 18,
      networks: ["mainnet"],
      readsHistory: false,
    });
    const result = await adapter.query(ADDRESS, "mainnet", new AbortController().signal);
    expect(reader.accounts).toHaveBeenCalledWith(
      "bnb-chain",
      "mainnet",
      [ADDRESS],
      expect.anything(),
    );
    expect(result).toMatchObject({
      coin: "bnb-chain",
      address: ADDRESS,
      balanceAtomic: 1n,
      nonce: 3n,
      blockHeight: 9n,
    });
    expect(result.history).toMatchObject({
      status: "unsupported",
      asset: "BNB",
      atomicUnit: "wei",
      decimals: 18,
      source: "https://bsc-rpc.publicnode.com",
      totalReceivedAtomic: null,
      transactionCount: null,
    });
  });

  it("keeps Ethereum's history from its history reader, on both networks", async () => {
    const history = {
      addressHistory: vi.fn(async () => ({
        ...emptyPublicHistory("ETH", "wei", 18),
        status: "complete" as const,
        source: "Blockscout",
      })),
    };
    const adapter = createEvmActivityAdapter(evmNetwork("ethereum"), accounts("11155111"), history);
    expect(adapter.networks).toEqual(["mainnet", "testnet"]);
    expect(adapter.readsHistory).toBe(true);
    const result = await adapter.query(ADDRESS, "testnet", new AbortController().signal);
    expect(history.addressHistory).toHaveBeenCalledWith(
      "ethereum",
      "testnet",
      ADDRESS,
      expect.anything(),
    );
    expect(result.history.source).toBe("Blockscout");
  });

  it("reads Ethereum Classic's balance, nonce and history as ETC on Mainnet only", async () => {
    const history = {
      addressHistory: vi.fn(async () => ({
        ...emptyPublicHistory("ETC", "wei", 18),
        status: "complete" as const,
        source: "Blockscout",
      })),
    };
    const reader = accounts("61");
    const adapter = createEvmActivityAdapter(evmNetwork("ethereum-classic"), reader, history);
    expect(adapter).toMatchObject({
      id: "ethereum-classic",
      label: "Ethereum Classic",
      asset: "ETC",
      decimals: 18,
      networks: ["mainnet"],
      readsHistory: true,
    });
    const result = await adapter.query(ADDRESS, "mainnet", new AbortController().signal);
    expect(reader.accounts).toHaveBeenCalledWith(
      "ethereum-classic",
      "mainnet",
      [ADDRESS],
      expect.anything(),
    );
    expect(history.addressHistory).toHaveBeenCalledWith(
      "ethereum-classic",
      "mainnet",
      ADDRESS,
      expect.anything(),
    );
    expect(result).toMatchObject({ coin: "ethereum-classic", balanceAtomic: 1n, nonce: 3n });
    expect(result.history).toMatchObject({ asset: "ETC", source: "Blockscout" });
  });
});

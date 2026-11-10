import { describe, expect, it } from "vitest";
import { validateEvmAccountsPayload } from "../src/evm-network-facts.js";
import { EVM_NETWORKS } from "../src/evm-networks.js";

const ADDRESS = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

describe("the EVM network table", () => {
  it("lists Ethereum first, then the other networks, each id, label and chain id once", () => {
    expect(EVM_NETWORKS.map(({ id }) => id)).toEqual([
      "ethereum",
      "bnb-chain",
      "polygon",
      "arbitrum",
      "optimism",
      "base",
      "avalanche",
      "gnosis",
    ]);
    const chainIds = EVM_NETWORKS.flatMap(({ networks }) =>
      Object.values(networks).map(({ chainId }) => chainId),
    );
    expect(new Set(chainIds).size).toBe(chainIds.length);
    expect(new Set(EVM_NETWORKS.map(({ label }) => label)).size).toBe(EVM_NETWORKS.length);
  });

  it("names only HTTPS endpoints, and a testnet for Ethereum alone", () => {
    for (const { id, networks } of EVM_NETWORKS) {
      for (const chain of Object.values(networks)) {
        expect(new URL(chain.rpc).protocol).toBe("https:");
        if (chain.history !== undefined) expect(new URL(chain.history).protocol).toBe("https:");
      }
      expect(networks.testnet !== undefined).toBe(id === "ethereum");
    }
  });
});

describe("the evm.accounts payload at the network boundary", () => {
  const coins = ["ethereum", "base"];
  it("admits exactly a network, a selected EVM network and a bounded address batch", () => {
    expect(() =>
      validateEvmAccountsPayload({ network: "mainnet", coin: "base", addresses: [ADDRESS] }, coins),
    ).not.toThrow();
  });

  it.each([
    [{ network: "mainnet", addresses: [ADDRESS] }, /unsupported fields/u],
    [{ network: "mainnet", coin: "base", addresses: [ADDRESS], url: "x" }, /unsupported fields/u],
    [{ network: "mainnet", coin: "bnb-chain", addresses: [ADDRESS] }, /not included/u],
    [{ network: "mainnet", coin: 56, addresses: [ADDRESS] }, /not included/u],
    [{ network: "regtest", coin: "base", addresses: [ADDRESS] }, /mainnet or testnet/u],
    [{ network: "mainnet", coin: "base", addresses: Array(101).fill(ADDRESS) }, /1 and 100/u],
  ])("refuses %j", (payload, message) => {
    expect(() => validateEvmAccountsPayload(payload, coins)).toThrow(message);
  });
});

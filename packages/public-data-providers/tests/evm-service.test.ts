import { afterEach, describe, expect, it, vi } from "vitest";
import { EVM_NETWORKS, evmNetwork } from "../src/evm-networks.js";
import { EvmAccountService } from "../src/evm-service.js";

afterEach(() => vi.unstubAllGlobals());

// Independent of the EVM network table: each network's EIP-155 chain id (hex, as eth_chainId answers it)
// and its PublicNode endpoint, as checked against the live endpoints on 2026-11-10.
const MAINNETS: Readonly<Record<string, readonly [string, string]>> = {
  ethereum: ["0x1", "https://ethereum-rpc.publicnode.com"],
  "bnb-chain": ["0x38", "https://bsc-rpc.publicnode.com"],
  polygon: ["0x89", "https://polygon-bor.publicnode.com"],
  arbitrum: ["0xa4b1", "https://arbitrum-one-rpc.publicnode.com"],
  optimism: ["0xa", "https://optimism-rpc.publicnode.com"],
  base: ["0x2105", "https://base-rpc.publicnode.com"],
  avalanche: ["0xa86a", "https://avalanche-c-chain-rpc.publicnode.com"],
  gnosis: ["0x64", "https://gnosis-rpc.publicnode.com"],
};
// EIP-55's own example address.
const ADDRESS = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

interface Call {
  id: string;
  method: string;
  params: string[];
}

/** A JSON-RPC endpoint of chain `chainId` at block 0x10, with zero balances and nonces. */
function endpoint(
  chainId: string,
  answer: (replies: Call[], calls: Call[]) => unknown = (replies) => replies,
) {
  const urls: string[] = [];
  const bodies: Call[][] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    const calls = JSON.parse(String(init?.body)) as Call[];
    bodies.push(calls);
    const replies = calls.map(({ id, method }) => ({
      jsonrpc: "2.0",
      id,
      result: method === "eth_chainId" ? chainId : method === "eth_blockNumber" ? "0x10" : "0x0",
    }));
    return new Response(JSON.stringify(answer(replies as unknown as Call[], calls)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, urls, bodies };
}

describe("EVM account service", () => {
  it.each(Object.entries(MAINNETS))(
    "reads %s from its own endpoint after it proves its chain id",
    async (id, [chainId, url]) => {
      const { urls, bodies } = endpoint(chainId);
      const batch = await new EvmAccountService(EVM_NETWORKS).accounts(id, "mainnet", [ADDRESS]);
      expect(urls).toEqual([url, url]);
      expect(bodies[0]?.map(({ method }) => method)).toEqual(["eth_chainId", "eth_blockNumber"]);
      expect(batch).toEqual({
        chainId: BigInt(chainId).toString(),
        blockNumber: "16",
        entries: [{ address: ADDRESS, balance: "0", nonce: "0" }],
      });
    },
  );

  it("reads Ethereum's Sepolia testnet from its own endpoint and chain id", async () => {
    const { urls } = endpoint("0xaa36a7");
    const batch = await new EvmAccountService(EVM_NETWORKS).accounts("ethereum", "testnet", [
      ADDRESS,
    ]);
    expect(urls).toEqual([
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://ethereum-sepolia-rpc.publicnode.com",
    ]);
    expect(batch.chainId).toBe("11155111");
  });

  it("refuses an endpoint of another chain after one request, before reading any account", async () => {
    const { fetcher } = endpoint("0x1");
    await expect(
      new EvmAccountService(EVM_NETWORKS).accounts("bnb-chain", "mainnet", [ADDRESS]),
    ).rejects.toMatchObject({
      code: "evm.chain-id",
      message: expect.stringMatching(/BNB Chain RPC reported chain 1, not chain 56/u),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing testnet, an unselected network and a bad batch before any request", async () => {
    const { fetcher } = endpoint("0x38");
    const service = new EvmAccountService([evmNetwork("base")]);
    await expect(
      new EvmAccountService(EVM_NETWORKS).accounts("bnb-chain", "testnet", [ADDRESS]),
    ).rejects.toMatchObject({ code: "evm.network" });
    await expect(service.accounts("ethereum", "mainnet", [ADDRESS])).rejects.toMatchObject({
      code: "evm.coin",
    });
    await expect(service.accounts("hyperevm", "mainnet", [ADDRESS])).rejects.toMatchObject({
      code: "evm.coin",
    });
    await expect(service.accounts("base", "mainnet", [])).rejects.toThrow(/1 to 100/u);
    await expect(
      service.accounts("base", "mainnet", Array<string>(101).fill(ADDRESS)),
    ).rejects.toThrow(/1 to 100/u);
    await expect(service.accounts("base", "mainnet", ["0xnot-an-address"])).rejects.toThrow(
      /invalid Ethereum/iu,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("pins all 200 reads of 100 accounts to the head block it observed", async () => {
    const { fetcher, bodies } = endpoint("0x2105");
    const addresses = Array<string>(100).fill(ADDRESS);
    const batch = await new EvmAccountService(EVM_NETWORKS).accounts("base", "mainnet", addresses);
    expect(batch.entries).toHaveLength(100);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(bodies[1]).toHaveLength(200);
    expect(bodies[1]?.every(({ params }) => params[1] === "0x10")).toBe(true);
  });

  it.each([
    [
      "an error object",
      (replies: Call[]) =>
        replies.map((reply, index) =>
          index === 0 ? { ...reply, error: { code: -32000 } } : reply,
        ),
    ],
    ["a repeated id", (replies: Call[]) => [replies[0], replies[0]]],
    ["a short batch", (replies: Call[]) => replies.slice(1)],
    ["a non-hex result", (replies: Call[]) => replies.map((reply) => ({ ...reply, result: "1" }))],
  ])("fails on %s instead of reading zero", async (_name, answer) => {
    endpoint("0x64", (replies, calls) =>
      calls[0]?.method === "eth_chainId" ? replies : answer(replies),
    );
    await expect(
      new EvmAccountService(EVM_NETWORKS).accounts("gnosis", "mainnet", [ADDRESS]),
    ).rejects.toMatchObject({ code: "evm.response" });
  });

  // The head batch: its chain id reply (the first call) and its block number reply.
  it.each([
    [
      "an error object on eth_chainId",
      (replies: Call[]) =>
        replies.map((reply, index) =>
          index === 0 ? { ...reply, error: { code: -32601 } } : reply,
        ),
      /malformed or failed response/u,
    ],
    [
      "a non-hex chain id",
      (replies: Call[]) =>
        replies.map((reply, index) => (index === 0 ? { ...reply, result: "100" } : reply)),
      /malformed or failed response/u,
    ],
    ["a short head batch", (replies: Call[]) => replies.slice(1), /incomplete batch/u],
    [
      "an unrequested id",
      (replies: Call[]) =>
        replies.map((reply, index) => (index === 0 ? { ...reply, id: "block-2" } : reply)),
      /repeated or unrequested response ID/u,
    ],
  ])("fails on %s in the head batch before reading any account", async (_name, answer, message) => {
    const { fetcher } = endpoint("0x64", (replies, calls) =>
      calls[0]?.method === "eth_chainId" ? answer(replies) : replies,
    );
    await expect(
      new EvmAccountService(EVM_NETWORKS).accounts("gnosis", "mainnet", [ADDRESS]),
    ).rejects.toMatchObject({ code: "evm.response", message: expect.stringMatching(message) });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

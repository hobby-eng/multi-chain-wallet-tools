import { EVM_RPC_QUANTITY } from "@ckd/core/numeric-limits.js";
import { normalizeEthereumAddress } from "./address-normalization.js";
import {
  EVM_NETWORK_ERRORS,
  evmChain,
  type EvmChainFacts,
  type EvmNetworkFacts,
} from "./evm-network-facts.js";
import { fetchJson, record } from "./http.js";
import {
  RECOVERY_EVM_ACCOUNT_BATCH,
  type EvmAccountBatchView,
  type PublicDataNetwork,
} from "./types.js";

interface RpcCall {
  readonly jsonrpc: "2.0";
  readonly id: string;
  readonly method: string;
  readonly params: readonly string[];
}

const call = (id: string, method: string, params: readonly string[] = []): RpcCall => ({
  jsonrpc: "2.0",
  id,
  method,
  params,
});

/**
 * Balances and nonces of EVM accounts, read from each network's own JSON-RPC endpoint. The networks
 * come from the caller (a composed build inlines its selected rows), so this module names none.
 */
export class EvmAccountService {
  readonly #networks: ReadonlyMap<string, EvmNetworkFacts>;

  constructor(networks: readonly EvmNetworkFacts[]) {
    this.#networks = new Map(networks.map((facts) => [facts.id, facts]));
  }

  /**
   * The balance and nonce of each address on the EVM network `coin` (its id in the EVM network
   * table), all read at one block height. The endpoint
   * first proves its chain id (EIP-155), so that an endpoint of another chain is refused before any
   * account is read; a malformed or partial answer fails instead of reading as zero.
   */
  async accounts(
    coin: string,
    network: PublicDataNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<EvmAccountBatchView> {
    const facts = this.#networks.get(coin);
    if (facts === undefined) throw EVM_NETWORK_ERRORS.coin();
    if (network !== "mainnet" && network !== "testnet")
      throw new Error("Network Worker rejected an unsupported network.");
    const endpoint = evmChain(facts, network);
    if (
      !Array.isArray(addresses) ||
      addresses.length < 1 ||
      addresses.length > RECOVERY_EVM_ACCOUNT_BATCH
    )
      throw EVM_NETWORK_ERRORS.batch();
    addresses.forEach(normalizeEthereumAddress);
    const head = await this.#batch(facts.label, endpoint, signal, [
      call("chainId", "eth_chainId"),
      call("block", "eth_blockNumber"),
    ]);
    const reported = head("chainId");
    if (reported !== BigInt(endpoint.chainId))
      throw EVM_NETWORK_ERRORS.chainId(facts.label, reported.toString(), endpoint.chainId);
    const block = head("block");
    // Every read names this one height, as a canonical JSON-RPC quantity (no leading zeros).
    const blockNumber = `0x${block.toString(16)}`;
    const reads = await this.#batch(
      facts.label,
      endpoint,
      signal,
      addresses.flatMap((address, index) => [
        call(`balance:${index}`, "eth_getBalance", [address, blockNumber]),
        call(`nonce:${index}`, "eth_getTransactionCount", [address, blockNumber]),
      ]),
    );
    return {
      chainId: reported.toString(),
      blockNumber: block.toString(),
      entries: addresses.map((address, index) => ({
        address,
        balance: reads(`balance:${index}`).toString(),
        nonce: reads(`nonce:${index}`).toString(),
      })),
    };
  }

  /**
   * One JSON-RPC batch: the quantity each call returned, read by the call's id. Every call must come
   * back exactly once as a hex quantity; an error object, a repeated or foreign id or a short batch
   * fails.
   */
  async #batch(
    label: string,
    endpoint: EvmChainFacts,
    signal: AbortSignal | undefined,
    calls: readonly RpcCall[],
  ): Promise<(id: string) => bigint> {
    const raw = await fetchJson(endpoint.rpc, signal, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(calls),
    });
    if (!Array.isArray(raw) || raw.length !== calls.length)
      throw EVM_NETWORK_ERRORS.response(label, "an incomplete batch");
    const expected = new Set(calls.map(({ id }) => id));
    const results = new Map<string, string>();
    for (const item of raw) {
      const response = record(item, `${label} RPC response`);
      if (
        response.error !== undefined ||
        typeof response.id !== "string" ||
        typeof response.result !== "string" ||
        !EVM_RPC_QUANTITY.test(response.result)
      )
        throw EVM_NETWORK_ERRORS.response(label, "a malformed or failed response");
      if (!expected.has(response.id) || results.has(response.id))
        throw EVM_NETWORK_ERRORS.response(label, "a repeated or unrequested response ID");
      results.set(response.id, response.result);
    }
    return (id) => {
      const result = results.get(id);
      if (result === undefined) throw EVM_NETWORK_ERRORS.response(label, "no result for a call");
      return BigInt(result);
    };
  }
}

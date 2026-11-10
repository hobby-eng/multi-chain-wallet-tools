import { EVM_RPC_QUANTITY } from "@ckd/core/numeric-limits.js";
import { normalizeEthereumAddress } from "./address-normalization.js";
import {
  EVM_NETWORK_ERRORS,
  evmChain,
  type EvmChainFacts,
  type EvmNetworkFacts,
} from "./evm-network-facts.js";
import { jsonRpcBatch, jsonRpcCall as call, type JsonRpcCall } from "./json-rpc.js";
import {
  RECOVERY_EVM_ACCOUNT_BATCH,
  type EvmAccountBatchView,
  type PublicDataNetwork,
} from "./types.js";

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
   * One JSON-RPC batch (jsonRpcBatch): the quantity each call returned, read by the call's id. A
   * result that is not a hex quantity fails like an error object.
   */
  async #batch(
    label: string,
    endpoint: EvmChainFacts,
    signal: AbortSignal | undefined,
    calls: readonly JsonRpcCall[],
  ): Promise<(id: string) => bigint> {
    const fail = (what: string) => EVM_NETWORK_ERRORS.response(label, what);
    const results = await jsonRpcBatch(endpoint.rpc, calls, fail, signal);
    for (const result of results.values())
      if (typeof result !== "string" || !EVM_RPC_QUANTITY.test(result))
        throw fail("a malformed or failed response");
    return (id) => {
      const result = results.get(id);
      if (typeof result !== "string") throw fail("no result for a call");
      return BigInt(result);
    };
  }
}

import { normalizeEthereumAddress } from "./address-normalization.js";
import { evmAmountUnit, EvmNetworkRows, type EvmNetworkFacts } from "./evm-network-facts.js";
import { evmAddressHistory } from "./history.js";
import type { PublicDataNetwork, RecoveryHistory } from "./types.js";

/** How long one address history may take, all its pages together. */
const HISTORY_TOTAL_TIMEOUT_MS = 60_000;

/**
 * The address histories of the EVM networks whose rows of the EVM network table name a Blockscout
 * API v2 root (Ethereum's and Ethereum Classic's), each read from its own root in its own asset.
 * Balances and nonces of every EVM network come from EvmAccountService. The networks come from the
 * caller (a composed build inlines its selected rows), so this module names none.
 */
export class EvmHistoryService {
  readonly #networks: EvmNetworkRows;

  constructor(networks: readonly EvmNetworkFacts[]) {
    this.#networks = new EvmNetworkRows(networks);
  }

  /**
   * The history of `address` on the EVM network `coin` (its id in the EVM network table). A network
   * this service was not given, or a chain without a history endpoint, is refused before any request.
   */
  async addressHistory(
    coin: string,
    network: PublicDataNetwork,
    address: string,
    signal?: AbortSignal,
  ): Promise<RecoveryHistory> {
    const { facts, chain } = this.#networks.chain(coin, network);
    const endpoint = chain.history;
    if (endpoint === undefined) throw new Error(`${facts.label} has no history provider.`);
    normalizeEthereumAddress(address);
    return evmAddressHistory(
      address,
      endpoint,
      evmAmountUnit(facts),
      AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(HISTORY_TOTAL_TIMEOUT_MS)]),
    );
  }
}

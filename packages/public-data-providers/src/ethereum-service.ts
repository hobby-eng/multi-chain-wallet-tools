import { normalizeEthereumAddress } from "./address-normalization.js";
import { evmChain, type EvmNetworkFacts } from "./evm-network-facts.js";
import { ethereumAddressHistory } from "./history.js";
import type { PublicDataNetwork, RecoveryHistory } from "./types.js";

/**
 * Ethereum's address history, read from the Blockscout API that its row of the EVM network
 * table names. Balances
 * and nonces of every EVM network, Ethereum's included, come from EvmAccountService.
 */
export class EthereumPublicDataService {
  readonly #facts: EvmNetworkFacts;

  /** `facts` is Ethereum's row of the EVM network table, inlined by a composed build. */
  constructor(facts: EvmNetworkFacts) {
    this.#facts = facts;
  }

  async addressHistory(
    network: PublicDataNetwork,
    address: string,
    signal?: AbortSignal,
  ): Promise<RecoveryHistory> {
    if (network !== "mainnet" && network !== "testnet")
      throw new Error("Network Worker rejected an unsupported network.");
    const endpoint = evmChain(this.#facts, network).history;
    if (endpoint === undefined) throw new Error(`${this.#facts.label} has no history provider.`);
    normalizeEthereumAddress(address);
    return ethereumAddressHistory(
      address,
      endpoint,
      AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(60_000)]),
    );
  }
}

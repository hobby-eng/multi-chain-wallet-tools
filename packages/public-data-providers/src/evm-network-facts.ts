// What an EVM network is to the tools: one row of the EVM network table (evm-networks.json), its units, its
// endpoints and the request that asks it for accounts. No row lives here, so that a composed build
// holds the rows of its selected networks only.
import { RECOVERY_EVM_ACCOUNT_BATCH } from "@ckd/network-boundary/data-types.js";
import {
  assertOneOf,
  assertPublicTokenBatch,
  assertRecoveryNetwork,
  exactNetworkPayload,
} from "@ckd/network-boundary/request-validation.js";
import type { NetworkName } from "@ckd/core/types.js";

/** One chain of an EVM network: its EIP-155 chain id, its name and its public endpoints. */
export interface EvmChainFacts {
  /** The EIP-155 chain id that the JSON-RPC endpoint must report before any account is read. */
  readonly chainId: number;
  /** The chain's name in section proofs, such as "Sepolia testnet". */
  readonly name: string;
  /** The JSON-RPC endpoint of balances and nonces. */
  readonly rpc: string;
  /**
   * The Blockscout API v2 root of address history (EvmHistoryService); absent where the tools read
   * no history.
   */
  readonly history?: string;
}

/** One EVM network of the EVM network table: the same 0x accounts, its own chain, asset and endpoints. */
export interface EvmNetworkFacts {
  /** The coin id of the tools, such as "bnb-chain". */
  readonly id: string;
  readonly label: string;
  /** The native asset's ticker, such as "BNB". */
  readonly asset: string;
  /** Who runs the network's JSON-RPC endpoints, as the privacy notes and provider lines name it. */
  readonly rpcOperator: string;
  /**
   * The Deriver's single-key coin whose public address scheme lays out the network's own wallets
   * (Ethereum Classic's coin type 61 and Ledger's legacy path), checked before Ethereum's layouts;
   * absent for a network whose wallets derive at Ethereum's coin type only.
   */
  readonly walletCoin?: string;
  readonly networks: { readonly mainnet: EvmChainFacts; readonly testnet?: EvmChainFacts };
}

/** Every EVM network counts its native asset in 10^18 wei. */
export const EVM_DECIMALS = 18;
/** The name of the atomic unit of every EVM network's native asset. */
export const EVM_ATOMIC_UNIT = "wei";
/** Whether the network's row names a Blockscout history endpoint on any of its chains. */
export function hasEvmHistory(facts: Pick<EvmNetworkFacts, "networks">): boolean {
  return Object.values(facts.networks).some((chain) => chain?.history !== undefined);
}

/** The native unit of an EVM network, as balances, histories and exports name it. */
export function evmAmountUnit(facts: Pick<EvmNetworkFacts, "asset">): {
  asset: string;
  atomicUnit: string;
  decimals: number;
} {
  return { asset: facts.asset, atomicUnit: EVM_ATOMIC_UNIT, decimals: EVM_DECIMALS };
}

/** The networks (mainnet, and testnet where the row has one) that an EVM network offers. */
export function evmNetworkNames(facts: EvmNetworkFacts): NetworkName[] {
  return facts.networks.testnet === undefined ? ["mainnet"] : ["mainnet", "testnet"];
}

/** The stable codes of a refused EVM request or answer. */
export type EvmNetworkErrorCode =
  "evm.coin" | "evm.network" | "evm.batch" | "evm.chain-id" | "evm.response";

/** A refused EVM request or a provider answer that cannot be trusted; never read as zero. */
export class EvmNetworkError extends Error {
  readonly code: EvmNetworkErrorCode;

  constructor(code: EvmNetworkErrorCode, message: string) {
    super(message);
    this.name = "EvmNetworkError";
    this.code = code;
  }
}

/** The one source of the EVM refusals' texts, each built from its code. */
export const EVM_NETWORK_ERRORS = Object.freeze({
  coin: () =>
    new EvmNetworkError(
      "evm.coin",
      "Network Worker rejected an EVM network that this build does not include.",
    ),
  network: (label: string) =>
    new EvmNetworkError("evm.network", `${label} has no testnet in this tool; choose Mainnet.`),
  batch: () =>
    new EvmNetworkError(
      "evm.batch",
      `Network Worker requires 1 to ${RECOVERY_EVM_ACCOUNT_BATCH} EVM addresses per request.`,
    ),
  chainId: (label: string, reported: string, expected: number) =>
    new EvmNetworkError(
      "evm.chain-id",
      `${label} RPC reported chain ${reported}, not chain ${expected}; no account was read from it.`,
    ),
  response: (label: string, what: string) =>
    new EvmNetworkError("evm.response", `${label} RPC returned ${what}.`),
});

/** The chain of `network`, refused when the EVM network has none (most have no testnet here). */
export function evmChain(facts: EvmNetworkFacts, network: NetworkName): EvmChainFacts {
  const chain = facts.networks[network];
  if (chain === undefined) throw EVM_NETWORK_ERRORS.network(facts.label);
  return chain;
}

/**
 * The EVM networks a provider service was given (a composed build inlines its selected rows), by
 * id: the one lookup of the account and history services.
 */
export class EvmNetworkRows {
  readonly #networks: ReadonlyMap<string, EvmNetworkFacts>;

  constructor(networks: readonly EvmNetworkFacts[]) {
    this.#networks = new Map(networks.map((facts) => [facts.id, facts]));
  }

  /**
   * The row of `coin` and its chain on `network`; refuses a network these rows do not hold, a
   * network name other than mainnet and testnet, and a chain the row lacks, before any request.
   */
  chain(coin: string, network: NetworkName): { facts: EvmNetworkFacts; chain: EvmChainFacts } {
    const facts = this.#networks.get(coin);
    if (facts === undefined) throw EVM_NETWORK_ERRORS.coin();
    // The type admits only the two names; a value from the boundary is checked again here.
    if (network !== "mainnet" && network !== "testnet")
      throw new Error("Network Worker rejected an unsupported network.");
    return { facts, chain: evmChain(facts, network) };
  }
}

/**
 * Validates the untrusted `evm.accounts` payload of the network boundary: exactly a network, one of
 * the build's EVM networks (`coins`, by id) and a bounded batch of public addresses.
 */
export function validateEvmAccountsPayload(value: unknown, coins: readonly string[]): void {
  const body = exactNetworkPayload(value, ["network", "coin", "addresses"]);
  assertRecoveryNetwork(body.network);
  assertOneOf(body.coin, coins, "EVM network");
  assertPublicTokenBatch(body.addresses, RECOVERY_EVM_ACCOUNT_BATCH);
}

import table from "./evm-networks.json";
import type { EvmNetworkFacts } from "./evm-network-facts.js";

/**
 * Every EVM network of the tools, Ethereum first, read from the one EVM network table
 * (evm-networks.json), which tooling/evm-networks.mjs reads too. Only development entry points and
 * tests import this list: a composed build inlines the rows of its selected networks instead, so
 * that it names no endpoint of another network.
 *
 * Endpoint provenance (2026-11-10): every JSON-RPC endpoint answered eth_chainId with its row's
 * chain id, allowed any origin (CORS `*`) and accepted a 200-call JSON-RPC batch. Hyperliquid's
 * HyperEVM was left out: its public endpoint accepts only 20 calls per batch.
 */
export const EVM_NETWORKS: readonly EvmNetworkFacts[] = Object.freeze(
  Object.entries(table).map(([id, row]) => Object.freeze({ id, ...row })),
);

/** The row of the EVM network `id`; refuses an id the table does not hold. */
export function evmNetwork(id: string): EvmNetworkFacts {
  const facts = EVM_NETWORKS.find((row) => row.id === id);
  if (facts === undefined) throw new Error(`No EVM network ${id} in the EVM network table.`);
  return facts;
}

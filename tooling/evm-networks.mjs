// The EVM networks of the connected tools (the Discovery Scanner and the Activity Viewer), read from
// the one EVM network table that the runtime reads too (packages/public-data-providers/src/
// evm-networks.json). A build composes any of them from this table: it inlines the rows of its
// selected networks, so that it names no endpoint of another network, and a network is one row.
import TABLE from "../packages/public-data-providers/src/evm-networks.json" with { type: "json" };
import { SINGLE_KEY_COINS } from "./single-key-coins.mjs";

/** Every EVM network's row with its id, Ethereum first, in the table's order. */
export const EVM_NETWORKS = Object.freeze(
  Object.entries(TABLE).map(([id, row]) => Object.freeze({ id, ...row })),
);

/** The coin menus' group of the EVM networks (apps/discovery-scanner/src/coins/evm/coin.ts). */
export const EVM_NETWORK_GROUP = "EVM networks";

/** The EVM networks besides Ethereum: the coins they add to the connected tools' manifests. */
export const EVM_NETWORK_IDS = Object.freeze(
  EVM_NETWORKS.filter(({ id }) => id !== "ethereum").map(({ id }) => id),
);

/** Whether `coin` is an EVM network of the EVM network table, Ethereum included. */
export function isEvmCoin(coin) {
  return EVM_NETWORKS.some(({ id }) => id === coin);
}

/** The rows of the EVM networks (Ethereum's included) that a build selected, in table order. */
export function selectedEvmNetworks(options) {
  return EVM_NETWORKS.filter(({ id }) => options.hasCoin(id));
}

/**
 * Whether an EVM network's row names a Blockscout history endpoint on any of its chains (Ethereum,
 * Ethereum Classic). Deliberate copy of hasEvmHistory (packages/public-data-providers/src/
 * evm-network-facts.ts), which tooling cannot import; tooling/selective-composition.test.mjs keeps
 * both in step.
 */
export function hasEvmHistory(row) {
  return Object.values(row.networks).some((chain) => chain.history !== undefined);
}

/**
 * The Deriver's single-key coin whose public address scheme lays out an EVM network's own wallets
 * (Ethereum Classic's coin type 61 and Ledger's legacy path), checked before Ethereum's layouts: the
 * row's `walletCoin`; undefined for a network whose wallets derive at Ethereum's coin type only. A
 * seed scan of the network imports that scheme and runs that coin's derivation self-test. Refuses a
 * row that names a coin the Deriver does not have.
 */
export function evmWalletCoin(row) {
  if (row.walletCoin === undefined) return undefined;
  if (!Object.hasOwn(SINGLE_KEY_COINS, row.walletCoin))
    throw new Error(`EVM network ${row.id} names no single-key coin: ${row.walletCoin}.`);
  return row.walletCoin;
}

/** The selected rows whose history a build reads, in table order. */
export function selectedEvmHistoryNetworks(options) {
  return selectedEvmNetworks(options).filter(hasEvmHistory);
}

/**
 * The graph markers of the EVM history modules, the Scanner's history reader and the history
 * service, which a build with a selected history row holds and a build without one must not. The
 * Blockscout parser's module (history.ts) also holds Bitcoin's history, so it is no marker.
 */
export const EVM_HISTORY_MARKERS = Object.freeze({
  scanner: "/discovery-scanner/src/coins/evm/history.ts",
  service: "/evm-history-service.ts",
});

/** The JSON-RPC and history endpoints of an EVM network, on every chain it offers. */
function endpoints(row) {
  return Object.values(row.networks).flatMap((chain) => [
    chain.rpc,
    ...(chain.history === undefined ? [] : [chain.history]),
  ]);
}

/** The origins an EVM network's lookups reach, for the CSP of a build without Dash. */
export function evmProviderOrigins(coin) {
  const row = EVM_NETWORKS.find(({ id }) => id === coin);
  if (row === undefined) throw new Error(`No EVM network ${coin} in the EVM network table.`);
  return [...new Set(endpoints(row).map((url) => new URL(url).origin))];
}

/** Every host an EVM network's lookups reach. */
export function evmProviderHosts(row) {
  return [...new Set(endpoints(row).map((url) => new URL(url).host))];
}

/**
 * The graph markers of the modules that every EVM network shares, which a build without any EVM
 * network must not hold.
 */
export const EVM_SHARED_MARKERS = Object.freeze([
  "/coins/evm/",
  "/evm-service.ts",
  "/evm-network-facts.ts",
  "/watch-only/evm.ts",
  "/coins/keccak-account.ts",
]);

/**
 * Refuses a built page (`text`) that names an endpoint of an EVM network its build did not select:
 * each build inlines only its selected rows, so another network's host is a leak.
 */
export function assertSelectedEvmEndpoints(options, text, label) {
  const leaked = EVM_NETWORKS.filter(({ id }) => !options.hasCoin(id)).flatMap((row) =>
    evmProviderHosts(row).filter((host) => text.includes(host)),
  );
  if (leaked.length > 0)
    throw new Error(`${label} names endpoints of unselected EVM networks: ${leaked.join(", ")}`);
}

/**
 * What a full Multi-Chain connected tool must hold and a Dash Community one must not: the chain-id
 * check, the group's name, and every EVM network's name and endpoint hosts (JSON-RPC and history).
 * "Base" is too common a word to forbid by itself; its host stands for it.
 */
export function evmArtifactMarkers() {
  return {
    required: [
      "eth_chainId",
      EVM_NETWORK_GROUP,
      ...EVM_NETWORKS.flatMap((row) => [row.label, ...evmProviderHosts(row)]),
    ],
    forbidden: [
      "eth_chainId",
      EVM_NETWORK_GROUP,
      ...EVM_NETWORKS.flatMap((row) => [
        ...(row.label === "Base" ? [] : [row.label]),
        ...evmProviderHosts(row),
      ]),
    ],
  };
}

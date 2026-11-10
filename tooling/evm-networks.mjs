// The EVM networks of the connected tools (the Discovery Scanner and the Activity Viewer), read from
// the one EVM network table that the runtime reads too (packages/public-data-providers/src/
// evm-networks.json). A build composes any of them from this table: it inlines the rows of its
// selected networks, so that it names no endpoint of another network, and a network is one row.
import TABLE from "../packages/public-data-providers/src/evm-networks.json" with { type: "json" };

/** Every EVM network's row with its id, Ethereum first, in the table's order. */
export const EVM_NETWORKS = Object.freeze(
  Object.entries(TABLE).map(([id, row]) => Object.freeze({ id, ...row })),
);

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
 * check, the group's name, and every EVM network's name and JSON-RPC host. "Base" is too common a
 * word to forbid by itself; its host stands for it.
 */
export function evmArtifactMarkers() {
  return {
    required: [
      "eth_chainId",
      "EVM networks",
      ...EVM_NETWORKS.flatMap((row) => [row.label, new URL(row.networks.mainnet.rpc).host]),
    ],
    forbidden: [
      "eth_chainId",
      "EVM networks",
      ...EVM_NETWORKS.flatMap((row) => [
        ...(row.label === "Base" ? [] : [row.label]),
        ...evmProviderHosts(row),
      ]),
    ],
  };
}

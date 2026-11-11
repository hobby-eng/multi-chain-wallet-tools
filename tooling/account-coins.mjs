// The account coins of the connected tools (the Discovery Scanner and the Activity Viewer), read from
// the one account coin table that the runtime reads too (packages/public-data-providers/src/
// account-coins.json). A build composes any of them from this table: it inlines the rows of its
// selected coins and imports only their readers and derivations, so that it names no endpoint of
// another coin, and a coin is one row with the Deriver's derivation of the same id.
import TABLE from "../packages/public-data-providers/src/account-coins.json" with { type: "json" };

/** Every account coin's row with its id, in the table's order. */
export const ACCOUNT_COINS = Object.freeze(
  Object.entries(TABLE).map(([id, row]) => Object.freeze({ id, ...row })),
);

/** The account coins: the coins they add to the connected tools' manifests. */
export const ACCOUNT_COIN_IDS = Object.freeze(ACCOUNT_COINS.map(({ id }) => id));

/** The coin menus' group of the account coins (apps/discovery-scanner/src/coins/account/coin.ts). */
export const ACCOUNT_COIN_GROUP = "Other networks";

/** Whether `coin` is an account coin of the account coin table. */
export function isAccountCoin(coin) {
  return ACCOUNT_COIN_IDS.includes(coin);
}

/** The rows of the account coins that a build selected, in table order. */
export function selectedAccountCoins(options) {
  return ACCOUNT_COINS.filter(({ id }) => options.hasCoin(id));
}

/**
 * The provider of an api: account-coins/<api>.ts of the providers, exporting the api's name in upper
 * case with "_PROVIDER" (solana-rpc: SOLANA_RPC_PROVIDER), as the development list
 * (packages/public-data-providers/src/account-coins.ts) imports it.
 */
export function accountProviderModule(api) {
  return {
    symbol: `${api.toUpperCase().replaceAll("-", "_")}_PROVIDER`,
    file: `packages/public-data-providers/src/account-coins/${api}.ts`,
  };
}

/**
 * The source of the readers of `rows` against the providers' modules (`module` resolves a file):
 * their imports and the expression of an array of readers, each row inlined.
 */
export function accountReadersSource(rows, module) {
  const providers = new Map(rows.map(({ api }) => [api, accountProviderModule(api)]));
  return {
    imports: [
      `import { AccountStatesReader } from ${module("packages/public-data-providers/src/account-states-service.ts")};`,
      ...[...providers.values()].map(
        ({ symbol, file }) => `import { ${symbol} } from ${module(file)};`,
      ),
    ],
    readers: `[${rows.map((row) => `new AccountStatesReader(${JSON.stringify(row)}, ${providers.get(row.api).symbol})`).join(", ")}]`,
  };
}

/** The origins an account coin's lookups reach, for the CSP of a build without Dash. */
export function accountProviderOrigins(coin) {
  const row = ACCOUNT_COINS.find(({ id }) => id === coin);
  if (row === undefined) throw new Error(`No account coin ${coin} in the account coin table.`);
  return [new URL(row.endpoint).origin];
}

/** The host an account coin's lookups reach. */
export function accountProviderHost(row) {
  return new URL(row.endpoint).host;
}

/**
 * The graph markers of the modules that every account coin shares in each connected tool, which a
 * build without any account coin must not hold.
 */
export const ACCOUNT_SHARED_MARKERS = Object.freeze({
  "discovery-scanner": Object.freeze([
    "/coins/account/",
    "/account-states-service.ts",
    "/account-coin-facts.ts",
  ]),
  "activity-viewer": Object.freeze([
    "/activity-account.ts",
    "/account-states-service.ts",
    "/account-coin-facts.ts",
  ]),
});

/**
 * The graph markers of the account coins a build did not select: each coin's own modules (its
 * Deriver derivation) and its provider, unless a selected coin shares that provider.
 */
export function unselectedAccountMarkers(options) {
  const apis = new Set(selectedAccountCoins(options).map(({ api }) => api));
  return ACCOUNT_COINS.filter(({ id }) => !options.hasCoin(id)).flatMap(({ id, api }) => [
    `/coins/${id}/`,
    ...(apis.has(api) ? [] : [`/account-coins/${api}.ts`]),
  ]);
}

/**
 * Refuses a built page (`text`) that names an endpoint of an account coin its build did not select:
 * each build inlines only its selected rows, so another coin's host is a leak.
 */
export function assertSelectedAccountEndpoints(options, text, label) {
  const leaked = ACCOUNT_COINS.filter(({ id }) => !options.hasCoin(id))
    .map(accountProviderHost)
    .filter((host) => text.includes(host));
  if (leaked.length > 0)
    throw new Error(`${label} names endpoints of unselected account coins: ${leaked.join(", ")}`);
}

/**
 * What a full Multi-Chain connected tool must hold and a Dash Community one must not: the group's
 * name, Solana's batch request, every account coin's host, and in Multi-Chain each coin's name. The
 * names are short words that an embedded binary may hold by chance ("XRP" in base64), so a Dash
 * Community artifact is held to them by the word scan of verify-dash-community-artifacts.mjs, which
 * leaves such runs out, rather than here.
 */
export function accountArtifactMarkers() {
  const forbidden = [
    ACCOUNT_COIN_GROUP,
    "getMultipleAccounts",
    ...ACCOUNT_COINS.map(accountProviderHost),
  ];
  return { required: [...forbidden, ...ACCOUNT_COINS.map(({ label }) => label)], forbidden };
}

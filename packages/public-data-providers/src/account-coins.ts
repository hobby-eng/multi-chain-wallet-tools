import table from "./account-coins.json";
import type { AccountCoinFacts } from "./account-coin-facts.js";
import { AccountStatesReader, type AccountProvider } from "./account-states-service.js";
import { HORIZON_PROVIDER } from "./account-coins/horizon.js";
import { NEAR_RPC_PROVIDER } from "./account-coins/near-rpc.js";
import { SOLANA_RPC_PROVIDER } from "./account-coins/solana-rpc.js";
import { TRONGRID_PROVIDER } from "./account-coins/trongrid.js";
import { XRPL_PROVIDER } from "./account-coins/xrpl.js";

/**
 * Every account coin of the tools, read from the one account coin table (account-coins.json),
 * which tooling/account-coins.mjs reads too. Only development entry points and tests import this
 * module: a composed build inlines the rows of its selected coins and imports only their
 * providers, so that it names no endpoint of another coin.
 *
 * Endpoint provenance (2026-11-10, probed with Origin: null as the Network Worker sends it): every
 * endpoint allowed that origin and answered the reads its provider makes. PublicNode's Solana
 * endpoint admits 10 accounts per getMultipleAccounts, hence Solana's batch of 10.
 */
export const ACCOUNT_COINS: readonly AccountCoinFacts[] = Object.freeze(
  Object.entries(table).map(([id, row]) => Object.freeze({ id, ...row })),
);

/**
 * The provider of each api. Each api's module account-coins/<api>.ts exports its provider as the
 * api's name in upper case with "_PROVIDER" (solana-rpc: SOLANA_RPC_PROVIDER), the name a composed
 * build imports.
 */
const PROVIDERS: Readonly<Record<string, AccountProvider>> = {
  "solana-rpc": SOLANA_RPC_PROVIDER,
  xrpl: XRPL_PROVIDER,
  horizon: HORIZON_PROVIDER,
  "near-rpc": NEAR_RPC_PROVIDER,
  trongrid: TRONGRID_PROVIDER,
};

/** The row of the account coin `id`; refuses an id the table does not hold. */
export function accountCoin(id: string): AccountCoinFacts {
  const facts = ACCOUNT_COINS.find((row) => row.id === id);
  if (facts === undefined) throw new Error(`No account coin ${id} in the account coin table.`);
  return facts;
}

/** The reader of `facts`, with its api's provider; refuses an api without a provider. */
export function accountStatesReader(facts: AccountCoinFacts): AccountStatesReader {
  const provider = PROVIDERS[facts.api];
  if (provider === undefined) throw new Error(`No account coin provider ${facts.api}.`);
  return new AccountStatesReader(facts, provider);
}

/** A reader of every account coin of the table, in its order. */
export const ACCOUNT_COIN_READERS: readonly AccountStatesReader[] = Object.freeze(
  ACCOUNT_COINS.map(accountStatesReader),
);

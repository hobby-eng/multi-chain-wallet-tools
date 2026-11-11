// What an account coin is to the connected tools: one row of the account coin table
// (account-coins.json), its unit, its endpoint and how many addresses one request carries. An
// account coin keeps one balance per address on its own network (Solana, XRP, Stellar, NEAR, Tron,
// Cosmos, Injective, Hedera, TON); the tools read that balance and whether the address was used,
// mainnet only, nothing else. No row lives here, so that a composed build holds the rows of its
// selected coins only.
import { isUint256Decimal } from "@ckd/core/numeric-limits.js";
import type {
  AccountStatesView,
  AccountStateView,
  NumberedAccountView,
} from "@ckd/network-boundary/data-types.js";

/** One account coin of the account coin table. */
export interface AccountCoinFacts {
  /** The coin id of the tools, the Deriver's, such as "solana". */
  readonly id: string;
  readonly label: string;
  /** The native asset's ticker, such as "SOL". */
  readonly asset: string;
  /** The name of the atomic unit that balances count, such as "lamport". */
  readonly atomicUnit: string;
  /** How many decimal places one asset unit has in atomic units. */
  readonly decimals: number;
  /** The provider module that reads the coin: account-coins/<api>.ts in this package. */
  readonly api: string;
  /** The provider's public endpoint, whose host a composed build's CSP admits. */
  readonly endpoint: string;
  /** The most addresses one account.states request carries. */
  readonly batch: number;
  /**
   * The addresses one provider request reads: the batch of a provider that reads several at once,
   * 1 for one that is asked one address at a time.
   */
  readonly addressesPerRequest: number;
  /**
   * The least time in milliseconds from the end of one address's read to the start of the next,
   * one read at a time, for a provider that is asked one address at a time and limits a client
   * without a key (TON Center: about one request a second); absent where the provider needs none.
   */
  readonly pace?: number;
  /**
   * Whether the network numbers its accounts apart from what the tools look up (Hedera's 0.0.N):
   * each state then names the accounts its address finds (AccountStateView.accounts).
   */
  readonly numberedAccounts?: boolean;
}

/** The native unit of an account coin, as balances, histories and exports name it. */
export function accountAmountUnit(facts: AccountCoinFacts): {
  asset: string;
  atomicUnit: string;
  decimals: number;
} {
  return { asset: facts.asset, atomicUnit: facts.atomicUnit, decimals: facts.decimals };
}

/** The stable codes of a refused account.states request or answer. */
export type AccountCoinErrorCode =
  "account.coin" | "account.network" | "account.batch" | "account.address" | "account.response";

/** A refused account.states request or a provider answer that cannot be trusted; never read as zero. */
export class AccountCoinError extends Error {
  readonly code: AccountCoinErrorCode;

  constructor(code: AccountCoinErrorCode, message: string) {
    super(message);
    this.name = "AccountCoinError";
    this.code = code;
  }
}

/** The one source of the account coins' refusals, each built from its code; none repeats input. */
export const ACCOUNT_COIN_ERRORS = Object.freeze({
  coin: () =>
    new AccountCoinError(
      "account.coin",
      "Network Worker rejected an account coin that this build does not include.",
    ),
  network: (label: string) =>
    new AccountCoinError(
      "account.network",
      `${label} has no testnet in this tool; choose Mainnet.`,
    ),
  batch: (label: string, maximum: number) =>
    new AccountCoinError(
      "account.batch",
      `Network Worker requires 1 to ${maximum} ${label} addresses per request.`,
    ),
  address: (label: string) =>
    new AccountCoinError(
      "account.address",
      `Network Worker rejected a value that is not a ${label} address in its canonical form.`,
    ),
  response: (label: string, what: string) =>
    new AccountCoinError("account.response", `${label} provider returned ${what}.`),
});

/** The checks of one account coin's provider answers, each failing with its coded error. */
export interface AccountAnswerChecks {
  /** The coded refusal of an answer that is `what`, such as "malformed account data". */
  fail(what: string): AccountCoinError;
  /** `value` as a plain object, or the refusal of `what`. */
  record(value: unknown, what: string): Record<string, unknown>;
  /**
   * `value` as decimal text when it is a non-negative integer, given as a safe JSON number or as
   * decimal text; a number past 2^53, which JSON parsing may have rounded, is refused too.
   */
  integer(value: unknown, what: string): string;
}

/** The answer checks of the provider of `facts`. */
export function accountAnswerChecks(facts: Pick<AccountCoinFacts, "label">): AccountAnswerChecks {
  const fail = (what: string) => ACCOUNT_COIN_ERRORS.response(facts.label, what);
  return {
    fail,
    record(value, what) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw fail(what);
      // An object that is neither null nor an array, as checked above.
      return value as Record<string, unknown>;
    },
    integer(value, what) {
      if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
        return String(value);
      if (isUint256Decimal(value)) return value;
      throw fail(what);
    },
  };
}

const STATE_KEYS = ["address", "balance", "exists", "sequence", "used"];
/** The keys of a state of a coin that numbers its accounts. */
const NUMBERED_STATE_KEYS = ["accounts", ...STATE_KEYS];
const VIEW_KEYS = ["coin", "entries", "height"];
/**
 * The most accounts one state names: a provider reads one page of a key's accounts (Hedera's mirror
 * node, 100) and refuses an answer that has more.
 */
export const MAX_NUMBERED_ACCOUNTS = 100;
/**
 * A numbered account in its canonical form: shard and realm 0, as every mainnet account of the one
 * numbering network (Hedera) is, and its number in decimal without leading zeros.
 */
const NUMBERED_ACCOUNT = /^0\.0\.(?:0|[1-9][0-9]{0,11})$/u;

const NUMBERED_ACCOUNT_KEYS = ["balance", "id"];

/**
 * Whether `value` lists numbered accounts whose balances sum to `balance`: each a canonical number
 * with a non-negative integer balance and nothing else, in ascending order without repeats, at
 * most MAX_NUMBERED_ACCOUNTS.
 */
function isAccountList(value: unknown, balance: string): value is NumberedAccountView[] {
  if (!Array.isArray(value) || value.length > MAX_NUMBERED_ACCOUNTS) return false;
  let previous = -1n;
  let sum = 0n;
  for (const account of value) {
    if (!hasExactKeys(account, NUMBERED_ACCOUNT_KEYS)) return false;
    const { id } = account;
    if (typeof id !== "string" || !NUMBERED_ACCOUNT.test(id) || !isUint256Decimal(account.balance))
      return false;
    const number = BigInt(id.slice("0.0.".length));
    if (number <= previous) return false;
    previous = number;
    sum += BigInt(account.balance);
  }
  return sum.toString() === balance;
}

/** Whether `value` is a plain object with exactly the keys `keys` (sorted). */
function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const own = Object.keys(value).sort();
  return own.length === keys.length && own.every((key, index) => key === keys[index]);
}

/**
 * Whether `value` is the state of `address`: an account that does not exist holds nothing, and on a
 * coin that numbers its accounts (`numbered`) the address exists exactly when it names one.
 */
function isStateOf(value: unknown, address: string, numbered: boolean): value is AccountStateView {
  if (!hasExactKeys(value, numbered ? NUMBERED_STATE_KEYS : STATE_KEYS)) return false;
  const { exists, used, balance, sequence } = value;
  return (
    value.address === address &&
    typeof exists === "boolean" &&
    typeof used === "boolean" &&
    (used || !exists) &&
    isUint256Decimal(balance) &&
    (sequence === null || isUint256Decimal(sequence)) &&
    (exists || (balance === "0" && sequence === null)) &&
    (!numbered ||
      (isAccountList(value.accounts, String(balance)) && value.accounts.length > 0 === exists))
  );
}

/**
 * The states of `addresses` that `view` holds, checked wherever they arrive: the coin's own, one
 * entry per address in order, each naming its address, an existing account marked used,
 * non-negative integer balances and sequences, and on a coin that numbers its accounts the
 * canonical accounts the address finds with the balances it sums, nothing else. Anything else fails as a provider error,
 * never as an empty account (CORE-22).
 */
export function assertAccountStatesView(
  facts: AccountCoinFacts,
  addresses: readonly string[],
  view: unknown,
): AccountStatesView {
  if (
    !hasExactKeys(view, VIEW_KEYS) ||
    view.coin !== facts.id ||
    !(view.height === null || isUint256Decimal(view.height)) ||
    !Array.isArray(view.entries) ||
    view.entries.length !== addresses.length
  )
    throw ACCOUNT_COIN_ERRORS.response(facts.label, "an incomplete account batch");
  const { entries } = view;
  const numbered = facts.numberedAccounts === true;
  if (!addresses.every((address, index) => isStateOf(entries[index], address, numbered)))
    throw ACCOUNT_COIN_ERRORS.response(facts.label, "malformed account data");
  // The keys and every value were checked above.
  return view as unknown as AccountStatesView;
}

// Stellar's account states from Horizon: GET /accounts/{G…} for each address, one request at a
// time. An account exists once it received the base reserve; Horizon answers 404 with its
// not_found problem for an account the ledger does not hold. Its native balance is written in XLM
// with seven decimals, read here exactly into stroops.
import { AtomicAmount } from "@ckd/core/atomic-amount.js";
import { isStellarAccountId } from "@ckd/coins/stellar/strkey.js";
import type { AccountAnswerChecks } from "../account-coin-facts.js";
import {
  NO_ACCOUNT,
  readOneByOne,
  type AccountProvider,
  type AddressRead,
  type ProviderRead,
} from "../account-states-service.js";
import { fetchJsonAnswer } from "../http.js";

/** Horizon's HTTP status and problem type of an account the ledger does not hold. */
const NOT_FOUND_STATUS = 404;
const NOT_FOUND_PROBLEM = "https://stellar.org/horizon-errors/not_found";
/** Horizon's native balance: whole XLM, a point and exactly seven decimals. */
const NATIVE_BALANCE = /^(?:0|[1-9][0-9]{0,18})\.[0-9]{7}$/u;

/** The native balance among `balances`, in stroops (`decimals` places) as decimal text. */
function nativeBalance(checks: AccountAnswerChecks, balances: unknown, decimals: number): string {
  if (!Array.isArray(balances)) throw checks.fail("no balances");
  const native = balances
    .map((entry: unknown) => checks.record(entry, "malformed balances"))
    .filter((entry) => entry.asset_type === "native");
  const [entry] = native;
  if (entry === undefined || native.length !== 1 || typeof entry.balance !== "string")
    throw checks.fail("no native balance");
  const stroops = NATIVE_BALANCE.test(entry.balance)
    ? AtomicAmount.parseDecimal(entry.balance, decimals)
    : null;
  if (stroops === null) throw checks.fail("a malformed native balance");
  return stroops.toString();
}

/** The state of `address`; Horizon reports no ledger with an account. */
async function readAccount(
  address: string,
  { facts, checks, signal }: ProviderRead,
): Promise<AddressRead> {
  // A canonical account ID is base32 only: it needs no escaping in the path.
  const { status, body } = await fetchJsonAnswer(
    `${facts.endpoint}/accounts/${address}`,
    [NOT_FOUND_STATUS],
    signal,
  );
  const answer = checks.record(body, "malformed account data");
  if (status === NOT_FOUND_STATUS) {
    if (answer.type !== NOT_FOUND_PROBLEM || answer.status !== NOT_FOUND_STATUS)
      throw checks.fail("an error");
    return { state: NO_ACCOUNT(address), height: null };
  }
  if (answer.account_id !== address) throw checks.fail("the state of another account");
  return {
    state: {
      address,
      exists: true,
      used: true,
      balance: nativeBalance(checks, answer.balances, facts.decimals),
      sequence: checks.integer(answer.sequence, "a sequence"),
    },
    height: null,
  };
}

/** Stellar's provider (api "horizon"). */
export const HORIZON_PROVIDER: AccountProvider = {
  addressForm: "G…",
  sequence: true,
  // SEP-0005's first account ID of the public phrase (m/44'/148'/0'), its last character changed.
  addressVectors: {
    name: "Stellar StrKey account ID checksum",
    typed: "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX",
    canonical: "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX",
    refused: "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYY",
  },
  // An account ID (G…) with a valid checksum is canonical as written.
  canonical: (value) => (isStellarAccountId(value) ? value : null),
  read: (addresses, read) => readOneByOne(addresses, read, readAccount),
};

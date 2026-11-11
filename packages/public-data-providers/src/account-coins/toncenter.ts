// TON's account states from TON Center's API v3: GET /api/v3/walletInformation for each address,
// one request at a time, paced to the row's pace since TON Center answers 429 to a client without
// a key that sends more than about one request a second (probed 2026-11-10); a 429 is retried once
// after one more pace. use_v2=true makes TON Center answer from a liteserver, the chain's own state,
// not from its indexer, whose answer for an address it has not indexed yet looks like an unused
// one; both answer the same fields (probed 2026-11-10). The answer names no address and no block.
// An account is on chain once it received TON: "active" (its wallet deployed), "frozen", or
// "uninitialized" with a transaction or a balance. An address the chain never held is
// "uninitialized" with no transaction (last_transaction_lt 0) and no balance, so a status alone
// does not tell a used address. An active wallet's seqno is its sequence. Jettons (tokens) and
// staked TON are not read.
import { tonAccountId, tonFriendlyAddress } from "@ckd/coins/ton/address.js";
import {
  readOneByOne,
  type AccountProvider,
  type AddressRead,
  type ProviderRead,
} from "../account-states-service.js";
import { fetchJson, fetchJsonAnswer } from "../http.js";

/** The account statuses TON Center reports from a liteserver. */
const STATUSES = new Set(["active", "uninitialized", "frozen"]);
/** TON Center's HTTP status of a request past its rate limit. */
const RATE_LIMITED = 429;

/** The canonical form of a mainnet basechain address: user-friendly, non-bounceable (UQ…). */
function canonicalTonAddress(value: string): string | null {
  const accountId = tonAccountId(value);
  return accountId === null ? null : tonFriendlyAddress(accountId);
}

/** TON Center's answer for `url`, asked again once after one more pace if it was rate limited. */
async function walletInformation(url: string, { signal, rest }: ProviderRead): Promise<unknown> {
  const first = await fetchJsonAnswer(url, [RATE_LIMITED], signal);
  if (first.status !== RATE_LIMITED) return first.body;
  await rest();
  // A second 429 fails the lookup as any HTTP error does.
  return fetchJson(url, signal);
}

/** The state of `address`; TON Center reports no block with a wallet's state. */
async function readAccount(address: string, read: ProviderRead): Promise<AddressRead> {
  const { facts, checks } = read;
  const answer = checks.record(
    await walletInformation(
      `${facts.endpoint}/api/v3/walletInformation?address=${encodeURIComponent(address)}&use_v2=true`,
      read,
    ),
    "malformed account data",
  );
  const { status } = answer;
  if (typeof status !== "string" || !STATUSES.has(status))
    throw checks.fail("an unknown account status");
  const balance = checks.integer(answer.balance, "a balance");
  const lastTransaction = checks.integer(answer.last_transaction_lt, "a transaction mark");
  // An uninitialized address with a transaction or a balance is on chain, and so used.
  const exists = status !== "uninitialized" || lastTransaction !== "0" || balance !== "0";
  const sequence =
    exists && status === "active" && answer.seqno !== undefined
      ? checks.integer(answer.seqno, "a sequence")
      : null;
  return {
    state: {
      address,
      exists,
      used: exists,
      balance,
      sequence,
    },
    height: null,
  };
}

/** TON's provider (api "toncenter"). */
export const TONCENTER_PROVIDER: AccountProvider = {
  addressForm: "UQ…, EQ… or 0:…",
  sequence: true,
  // Trust Wallet's first v4R2 address of the public phrase (m/44'/607'/0') in its raw form, its
  // canonical non-bounceable form, and that form with its last character changed.
  addressVectors: {
    name: "TON address forms and checksum",
    typed: "0:335996ba9cce6625ebfdd7019ced50927c1a08b1846a289a55efc37c01d77df9",
    canonical: "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY",
    refused: "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKZ",
  },
  // A user-friendly address (UQ… or EQ…, either base64 alphabet) or a raw one (0:…) of a mainnet
  // basechain account names the account; its canonical form is UQ… in the URL-safe alphabet.
  canonical: (value) => (canonicalTonAddress(value) === value ? value : null),
  account: canonicalTonAddress,
  read: (addresses, read) => readOneByOne(addresses, read, readAccount),
};

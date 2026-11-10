// Solana's account states from its JSON-RPC: one batch per lookup, getMultipleAccounts for the
// balances (an account that does not exist is null) and getSignaturesForAddress with limit 1 for
// each address, which tells an emptied, used address from an unused one as far as the node keeps
// signatures. PublicNode's endpoint admits 10 accounts per getMultipleAccounts (probed 2026-11-10),
// the row's batch.
import { solanaPublicKeyOf } from "@ckd/coins/solana/address.js";
import type { AccountStatesView } from "@ckd/network-boundary/data-types.js";
import type { AccountAnswerChecks } from "../account-coin-facts.js";
import type { AccountProvider, ProviderRead } from "../account-states-service.js";
import { jsonRpcBatch, jsonRpcCall } from "../json-rpc.js";

/** Every read is at finalized commitment, so that no answer rolls back. */
const COMMITMENT = "finalized";
/** The id of the batch's getMultipleAccounts call; signatures:i is address i's signature call. */
const ACCOUNTS_CALL = "accounts";
const signaturesCall = (index: number) => `signatures:${index}`;

/** The slot and each account's lamports (null where none exists) of a getMultipleAccounts result. */
function accountsOf(
  checks: AccountAnswerChecks,
  result: unknown,
  count: number,
): { slot: string; lamports: (string | null)[] } {
  const body = checks.record(result, "an incomplete account batch");
  const context = checks.record(body.context, "an incomplete account batch");
  const slot = checks.integer(context.slot, "an incomplete account batch");
  if (!Array.isArray(body.value) || body.value.length !== count)
    throw checks.fail("an incomplete account batch");
  return {
    slot,
    lamports: body.value.map((account: unknown) =>
      account === null
        ? null
        : checks.integer(checks.record(account, "malformed account data").lamports, "a balance"),
    ),
  };
}

/** Whether a getSignaturesForAddress result of limit 1 holds a signature. */
function signedIn(checks: AccountAnswerChecks, result: unknown): boolean {
  if (!Array.isArray(result) || result.length > 1) throw checks.fail("malformed signature data");
  return result.length === 1;
}

/** The states of up to a batch of `addresses` from one JSON-RPC batch. */
async function readAccounts(
  addresses: readonly string[],
  { facts, checks, signal }: ProviderRead,
): Promise<AccountStatesView> {
  const results = await jsonRpcBatch(
    facts.endpoint,
    [
      jsonRpcCall(ACCOUNTS_CALL, "getMultipleAccounts", [
        addresses,
        { encoding: "base64", dataSlice: { offset: 0, length: 0 }, commitment: COMMITMENT },
      ]),
      ...addresses.map((address, index) =>
        jsonRpcCall(signaturesCall(index), "getSignaturesForAddress", [
          address,
          { limit: 1, commitment: COMMITMENT },
        ]),
      ),
    ],
    checks.fail,
    signal,
  );
  const { slot, lamports } = accountsOf(checks, results.get(ACCOUNTS_CALL), addresses.length);
  return {
    coin: facts.id,
    height: slot,
    entries: addresses.map((address, index) => {
      const balance = lamports[index] ?? null;
      const exists = balance !== null;
      const signed = signedIn(checks, results.get(signaturesCall(index)));
      return { address, exists, used: exists || signed, balance: balance ?? "0", sequence: null };
    }),
  };
}

/** Solana's provider (api "solana-rpc"). */
export const SOLANA_RPC_PROVIDER: AccountProvider = {
  addressForm: "base58",
  sequence: false,
  // Solana's first address of the public phrase (m/44'/501'/0'/0'); "0" is outside base58.
  addressVectors: {
    name: "Solana base58 address form",
    typed: "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
    canonical: "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
    refused: "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpq0",
  },
  // A base58 address of 32 bytes is canonical as written; Solana's addresses have no checksum.
  canonical: (value) => (solanaPublicKeyOf(value) === null ? null : value),
  read: readAccounts,
};

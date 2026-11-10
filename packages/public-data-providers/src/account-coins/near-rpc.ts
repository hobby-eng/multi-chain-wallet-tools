// NEAR's account states from its JSON-RPC: view_account of each implicit account at final
// finality, one request at a time. An implicit account exists once it received NEAR; the RPC
// answers UNKNOWN_ACCOUNT for one the chain does not hold. The balance is the liquid amount; a
// staked (locked) amount is not read.
import {
  canonicalNearImplicitAccount,
  nearImplicitAccount,
  nearPublicKeyOf,
} from "@ckd/coins/near/account.js";
import {
  NO_ACCOUNT,
  readOneByOne,
  type AccountProvider,
  type AddressRead,
  type ProviderRead,
} from "../account-states-service.js";
import { fetchJson } from "../http.js";

/** The id of the one call of each request; the answer must carry it back. */
const CALL_ID = "0";
/** The RPC's error name of an account the chain does not hold. */
const UNKNOWN_ACCOUNT = "UNKNOWN_ACCOUNT";

/** The state of an account the RPC does not know (`error`); any other error fails. */
function unknownAccount(address: string, error: unknown, { checks }: ProviderRead): AddressRead {
  const cause = checks.record(checks.record(error, "an error").cause, "an error");
  const info = checks.record(cause.info, "an error");
  if (cause.name !== UNKNOWN_ACCOUNT) throw checks.fail("an error");
  if (info.requested_account_id !== address) throw checks.fail("the state of another account");
  return {
    state: NO_ACCOUNT(address),
    height: BigInt(checks.integer(info.block_height, "no block height")),
  };
}

/** The state of the implicit account `address` at final finality. */
async function readAccount(address: string, read: ProviderRead): Promise<AddressRead> {
  const { facts, checks, signal } = read;
  const raw = checks.record(
    await fetchJson(facts.endpoint, signal, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: CALL_ID,
        method: "query",
        params: { request_type: "view_account", finality: "final", account_id: address },
      }),
    }),
    "malformed account data",
  );
  if (raw.id !== CALL_ID) throw checks.fail("an unrequested response ID");
  if (raw.error !== undefined) return unknownAccount(address, raw.error, read);
  const account = checks.record(raw.result, "malformed account data");
  return {
    state: {
      address,
      exists: true,
      used: true,
      balance: checks.integer(account.amount, "a balance"),
      sequence: null,
    },
    height: BigInt(checks.integer(account.block_height, "no block height")),
  };
}

/** NEAR's provider (api "near-rpc"). */
export const NEAR_RPC_PROVIDER: AccountProvider = {
  addressForm: "ed25519:…",
  sequence: false,
  typedName: "account public key",
  // The public-input guard refuses 64 hex digits, the implicit account's own form, since they
  // cannot be told from a private key: a person enters the account's public key instead.
  inputNote:
    "NEAR lookups take the account's public key (ed25519:…), since 64 hex digits cannot be told from a private key.",
  // NEAR's first public key of the public phrase (m/44'/397'/0', as the Deriver shows it), its
  // implicit account, and the same key without its "ed25519:" prefix.
  addressVectors: {
    name: "NEAR public key form",
    typed: "ed25519:6j4b6zUaty6fD1awqcGCCU9JYGCWYUgdJhQrzfZhqE25",
    canonical: "5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412",
    refused: "6j4b6zUaty6fD1awqcGCCU9JYGCWYUgdJhQrzfZhqE25",
  },
  // An implicit account's 64 hex digits, canonical in lower case; named accounts are not read.
  canonical: canonicalNearImplicitAccount,
  account: (value) => {
    const publicKey = nearPublicKeyOf(value);
    return publicKey === null ? null : nearImplicitAccount(publicKey);
  },
  read: (addresses, read) => readOneByOne(addresses, read, readAccount),
};

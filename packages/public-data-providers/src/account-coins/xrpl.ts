// The XRP Ledger's account states from a rippled JSON-RPC server: account_info of each address in
// the latest validated ledger, one request at a time (rippled has no batch). An account exists once
// it received the reserve; actNotFound in a validated ledger is an account that does not exist.
import { xrpAccountIdOf } from "@ckd/coins/xrp/address.js";
import {
  NO_ACCOUNT,
  readOneByOne,
  type AccountProvider,
  type AddressRead,
  type ProviderRead,
} from "../account-states-service.js";
import { fetchJson } from "../http.js";

/** rippled's error code of an account that the validated ledger does not hold. */
const ACCOUNT_NOT_FOUND = "actNotFound";

/** The state of `address` in the latest validated ledger. */
async function readAccount(
  address: string,
  { facts, checks, signal }: ProviderRead,
): Promise<AddressRead> {
  const raw = await fetchJson(facts.endpoint, signal, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      method: "account_info",
      params: [{ account: address, ledger_index: "validated" }],
    }),
  });
  const result = checks.record(checks.record(raw, "malformed account data").result, "no result");
  if (result.validated !== true) throw checks.fail("an account state outside a validated ledger");
  const height = BigInt(checks.integer(result.ledger_index, "no ledger index"));
  if (result.status === "error" && result.error === ACCOUNT_NOT_FOUND) {
    if (result.account !== address) throw checks.fail("the state of another account");
    return { state: NO_ACCOUNT(address), height };
  }
  if (result.status !== "success") throw checks.fail("an error");
  const account = checks.record(result.account_data, "malformed account data");
  if (account.Account !== address) throw checks.fail("the state of another account");
  return {
    state: {
      address,
      exists: true,
      used: true,
      balance: checks.integer(account.Balance, "a balance"),
      sequence: checks.integer(account.Sequence, "a sequence"),
    },
    height,
  };
}

/** XRP's provider (api "xrpl"). */
export const XRPL_PROVIDER: AccountProvider = {
  addressForm: "r…",
  sequence: true,
  // XRP's first address of the public phrase (m/44'/144'/0'/0/0), and its last character changed.
  addressVectors: {
    name: "XRP classic address checksum",
    typed: "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3",
    canonical: "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3",
    refused: "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v4",
  },
  // A classic address (r…) with a valid checksum is canonical as written.
  canonical: (value) => (xrpAccountIdOf(value) === null ? null : value),
  read: (addresses, read) => readOneByOne(addresses, read, readAccount),
};

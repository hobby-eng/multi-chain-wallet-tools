// Tron's account states from TronGrid: GET /v1/accounts/{T…} for each address, one request at a
// time. An account exists once it was activated; TronGrid answers an empty data list for one that
// was not, and leaves the balance out of an activated account that holds no TRX. Frozen (staked)
// TRX is not read.
import { TRON_ADDRESS_PREFIX } from "@ckd/coins/tron/profiles.js";
import { base58Hash, bytesToHex } from "@ckd/core/crypto.js";
import {
  NO_ACCOUNT,
  readOneByOne,
  type AccountProvider,
  type AddressRead,
  type ProviderRead,
} from "../account-states-service.js";
import { fetchJson } from "../http.js";

/** The hex form TronGrid names an account by: the prefix byte 0x41 and the 20-byte hash. */
function hexAddress(address: string): string | null {
  const hash = base58Hash(address, [TRON_ADDRESS_PREFIX]);
  return hash === null ? null : bytesToHex(Uint8Array.of(TRON_ADDRESS_PREFIX, ...hash));
}

/** The state of `address`; TronGrid reports no block with an account. */
async function readAccount(
  address: string,
  { facts, checks, signal }: ProviderRead,
): Promise<AddressRead> {
  // A canonical address is base58 only: it needs no escaping in the path.
  const answer = checks.record(
    await fetchJson(`${facts.endpoint}/v1/accounts/${address}`, signal),
    "malformed account data",
  );
  if (answer.success !== true || !Array.isArray(answer.data) || answer.data.length > 1)
    throw checks.fail("an error");
  const [found] = answer.data;
  if (found === undefined) return { state: NO_ACCOUNT(address), height: null };
  const account = checks.record(found, "malformed account data");
  if (typeof account.address !== "string" || account.address !== hexAddress(address))
    throw checks.fail("the state of another account");
  return {
    state: {
      address,
      exists: true,
      used: true,
      balance: account.balance === undefined ? "0" : checks.integer(account.balance, "a balance"),
      sequence: null,
    },
    height: null,
  };
}

/** Tron's provider (api "trongrid"). */
export const TRONGRID_PROVIDER: AccountProvider = {
  addressForm: "T…",
  sequence: false,
  // Tron's first address of the public phrase (m/44'/195'/0'/0/0), and its last character changed.
  addressVectors: {
    name: "Tron base58check address checksum",
    typed: "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH",
    canonical: "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH",
    refused: "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdJ",
  },
  // A T… address with a valid checksum is canonical as written.
  canonical: (value) => (hexAddress(value) === null ? null : value),
  read: (addresses, read) => readOneByOne(addresses, read, readAccount),
};

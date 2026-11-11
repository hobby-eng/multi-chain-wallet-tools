// What names a Hedera account on mainnet, as wallets and the Deriver write it: its number 0.0.N
// (shard and realm 0), with or without HIP-15's checksum; an EVM address (an ECDSA key's alias, or
// the "long-zero" form of a number); or a public key's alias 0.0.<DER public key> (HIP-32), Ed25519
// or compressed secp256k1 (ECDSA), which the network maps to every account holding that key. The
// Deriver's rows show the Ed25519 alias. An ECDSA key also names the account of its EVM address
// alias, which an account created by a transfer to that address holds before it ever signs.
import { bytesToHex, secp256k1 } from "@ckd/core/crypto.js";
import { EthereumAddress } from "@ckd/core/eip55.js";
import { keccakAccount } from "../keccak-account.js";
import { HEDERA_ECDSA_PUBLIC_DER, HEDERA_ED25519_PUBLIC_DER } from "./profiles.js";

/** The prefix of an account that shard 0, realm 0 holds: every mainnet account. */
const MAINNET_PREFIX = "0.0.";
/**
 * The largest account number the public mirror node reads: it packs an entity's number into 38
 * bits and refuses a larger one (probed 2026-11-10).
 */
const LARGEST_ACCOUNT_NUMBER = 2n ** 38n - 1n;
/** An account number in its canonical decimal form, without leading zeros. */
const NUMBER = /^(?:0|[1-9][0-9]{0,11})$/u;
/** An Ed25519 public key's 32 bytes in hex. */
const ED25519_KEY_HEX = /^[0-9a-f]{64}$/u;
/** A compressed secp256k1 public key's 33 bytes in hex. */
const ECDSA_KEY_HEX = /^0[23][0-9a-f]{64}$/u;
/** HIP-15's ledger ID of mainnet (HIP-198): the one byte 0x00. */
const MAINNET_LEDGER_ID = [0x00] as const;
const LETTERS = 26;
const P3 = LETTERS ** 3;
const P5 = LETTERS ** 5;
const CHECKSUM_LETTERS = 5;

/** The alias of an Ed25519 public key, 0.0.<DER public key>, as the Hiero SDK writes it. */
export function hederaEd25519Alias(publicKey: Uint8Array): string {
  return `${MAINNET_PREFIX}${HEDERA_ED25519_PUBLIC_DER}${bytesToHex(publicKey)}`;
}

/** The alias of a compressed secp256k1 public key, 0.0.<DER public key>, as the Hiero SDK writes it. */
export function hederaEcdsaAlias(publicKey: Uint8Array): string {
  return `${MAINNET_PREFIX}${HEDERA_ECDSA_PUBLIC_DER}${bytesToHex(publicKey)}`;
}

/**
 * HIP-15's checksum of the account `address` ("0.0.N") on mainnet: five letters a-z, from the
 * HIP's reference algorithm, which reproduces all of its published examples.
 */
export function hederaMainnetChecksum(address: string): string {
  const digits = [...address].map((character) => (character === "." ? 10 : Number(character)));
  let evenSum = 0;
  let oddSum = 0;
  let weighted = 0;
  for (const [at, digit] of digits.entries()) {
    if (at % 2 === 0) evenSum = (evenSum + digit) % 11;
    else oddSum = (oddSum + digit) % 11;
    weighted = (weighted * 31 + digit) % P3;
  }
  // The ledger ID followed by six zero bytes.
  let ledger = 0;
  for (const byte of [...MAINNET_LEDGER_ID, 0, 0, 0, 0, 0, 0]) ledger = (ledger * 31 + byte) % P5;
  let checksum =
    ((((digits.length % 5) * 11 + evenSum) * 11 + oddSum) * P3 + weighted + ledger) % P5;
  checksum = (checksum * 1_000_003) % P5;
  let letters = "";
  for (let at = 0; at < CHECKSUM_LETTERS; at += 1) {
    letters = String.fromCharCode(0x61 + (checksum % LETTERS)) + letters;
    checksum = Math.floor(checksum / LETTERS);
  }
  return letters;
}

/** The account number of `text` ("0.0.N", canonical), or null. */
function accountNumber(text: string): bigint | null {
  if (!text.startsWith(MAINNET_PREFIX)) return null;
  const digits = text.slice(MAINNET_PREFIX.length);
  if (!NUMBER.test(digits)) return null;
  const value = BigInt(digits);
  return value <= LARGEST_ACCOUNT_NUMBER ? value : null;
}

/** The 64 hex digits of the Ed25519 key that the alias `text` names, or null. */
export function hederaAliasKey(text: string): string | null {
  const prefix = `${MAINNET_PREFIX}${HEDERA_ED25519_PUBLIC_DER}`;
  if (!text.startsWith(prefix)) return null;
  const key = text.slice(prefix.length);
  return ED25519_KEY_HEX.test(key) ? key : null;
}

/**
 * The compressed secp256k1 key that the alias `text` names, as 66 hex digits, and the EVM address
 * of that key in lower case; null when `text` is no such alias or its key is not on the curve.
 */
export function hederaEcdsaAliasKey(
  text: string,
): { readonly publicKey: string; readonly evmAddress: string } | null {
  const prefix = `${MAINNET_PREFIX}${HEDERA_ECDSA_PUBLIC_DER}`;
  if (!text.startsWith(prefix)) return null;
  const publicKey = text.slice(prefix.length);
  if (!ECDSA_KEY_HEX.test(publicKey)) return null;
  try {
    const point = secp256k1.Point.fromHex(publicKey).toBytes(true);
    return { publicKey, evmAddress: `0x${bytesToHex(keccakAccount(point))}` };
  } catch {
    return null;
  }
}

/**
 * What a canonical Hedera lookup names: an account number, an EVM address, an Ed25519 key, or an
 * ECDSA key with the EVM address of its alias.
 */
export type HederaLookup =
  | { readonly kind: "account"; readonly id: string }
  | { readonly kind: "evm"; readonly address: string }
  | { readonly kind: "key"; readonly publicKey: string }
  | { readonly kind: "ecdsa-key"; readonly publicKey: string; readonly evmAddress: string };

/**
 * What the canonical form `value` names, or null when `value` is not canonical: an account number
 * "0.0.N", an EIP-55 address, or a key's alias in lower case.
 */
export function hederaLookupOf(value: string): HederaLookup | null {
  if (accountNumber(value) !== null) return { kind: "account", id: value };
  const publicKey = hederaAliasKey(value);
  if (publicKey !== null) return { kind: "key", publicKey };
  const ecdsa = hederaEcdsaAliasKey(value);
  if (ecdsa !== null) return { kind: "ecdsa-key", ...ecdsa };
  if (EthereumAddress.accepts(value) && EthereumAddress.parse(value).checksummed === value)
    return { kind: "evm", address: value.toLowerCase() };
  return null;
}

/** The EVM address of an account number in its "long-zero" form: shard, realm and number. */
export function hederaLongZeroAddress(id: string): string | null {
  const value = accountNumber(id);
  return value === null ? null : `0x${"0".repeat(24)}${value.toString(16).padStart(16, "0")}`;
}

/**
 * The canonical lookup that a typed `value` names, or null: an account number with or without its
 * mainnet checksum ("0.0.N" or "0.0.N-abcde"), an EVM address in one case or with a valid EIP-55
 * checksum, or a public key as DER (Ed25519 or compressed secp256k1), bare or as its alias
 * "0.0.302…", in either case. A checksum of another network is refused, so that a testnet account
 * is not read on mainnet.
 */
export function hederaTypedLookup(value: string): string | null {
  const [id, checksum, ...rest] = value.split("-");
  if (id !== undefined && rest.length === 0 && accountNumber(id) !== null)
    return checksum === undefined || checksum === hederaMainnetChecksum(id) ? id : null;
  if (EthereumAddress.accepts(value)) return EthereumAddress.parse(value).checksummed;
  const lower = value.toLowerCase();
  const bare = [HEDERA_ED25519_PUBLIC_DER, HEDERA_ECDSA_PUBLIC_DER].some((prefix) =>
    lower.startsWith(prefix),
  );
  const alias = bare ? `${MAINNET_PREFIX}${lower}` : lower;
  return hederaAliasKey(alias) !== null || hederaEcdsaAliasKey(alias) !== null ? alias : null;
}

// Cardano's mainnet addresses of key hashes (CIP-19, cardano-foundation/CIPs @7720fed
// CIP-0019/README.md) and the bech32 texts of its keys (CIP-5, CIP-0005/README.md). An address is a
// header byte, its type in the high four bits and the network in the low four, followed by
// BLAKE2b-224 hashes of 32-byte Ed25519 public keys: the payment key and the stake key of a base
// address, the payment key alone of an enterprise address, the stake key alone of a reward (stake)
// address. Bech32 here has no length limit: "Cardano does not impose a length limit" (CIP-19).
import { blake2b } from "@noble/hashes/blake2.js";
import { bech32 } from "@scure/base";
import { concatBytes } from "@ckd/core/crypto.js";

/** CIP-19's network id of mainnet, the header's low four bits. */
const MAINNET = 0b0001;
/** CIP-19's header types of the addresses of key hashes: base (0), enterprise (6), reward (14). */
const ADDRESS_TYPE = Object.freeze({ base: 0b0000, enterprise: 0b0110, reward: 0b1110 });
/** CIP-5's prefixes of mainnet addresses. */
const ADDRESS_PREFIX = Object.freeze({ payment: "addr", reward: "stake" });
/** Bytes of a key hash: BLAKE2b-224. */
const KEY_HASH_BYTES = 28;

/** CIP-5's prefixes of the keys that the Deriver shows. */
export type CardanoKeyPrefix =
  | "root_xsk"
  | "acct_xsk"
  | "acct_xvk"
  | "addr_xsk"
  | "addr_xvk"
  | "addr_vk"
  | "stake_xsk"
  | "stake_xvk"
  | "stake_vk";

/** The bech32 text of `bytes` under `prefix`, without BIP-173's 90-character limit. */
function bech32Text(prefix: string, bytes: Uint8Array): string {
  return bech32.encode(prefix, bech32.toWords(bytes), false);
}

/** CIP-19's key hash of a 32-byte Ed25519 public key: its BLAKE2b-224. */
export function cardanoKeyHash(publicKey: Uint8Array): Uint8Array {
  return blake2b(publicKey, { dkLen: KEY_HASH_BYTES });
}

/** A mainnet address of `type` over the hashes of `keys`, in order. */
function address(type: number, prefix: string, keys: readonly Uint8Array[]): string {
  return bech32Text(
    prefix,
    concatBytes(Uint8Array.of((type << 4) | MAINNET), ...keys.map(cardanoKeyHash)),
  );
}

/** The base address (addr1q…) of a payment key and a stake key, the first address wallets show. */
export function cardanoBaseAddress(paymentKey: Uint8Array, stakeKey: Uint8Array): string {
  return address(ADDRESS_TYPE.base, ADDRESS_PREFIX.payment, [paymentKey, stakeKey]);
}

/** The enterprise address (addr1v…) of a payment key, which takes no part in staking. */
export function cardanoEnterpriseAddress(paymentKey: Uint8Array): string {
  return address(ADDRESS_TYPE.enterprise, ADDRESS_PREFIX.payment, [paymentKey]);
}

/** The reward address (stake1u…) of a stake key, the account that staking rewards accrue to. */
export function cardanoRewardAddress(stakeKey: Uint8Array): string {
  return address(ADDRESS_TYPE.reward, ADDRESS_PREFIX.reward, [stakeKey]);
}

/** The longest address text read: a CIP-19 base address is 103 characters, a reward address 59. */
const MAX_ADDRESS_CHARACTERS = 128;

/**
 * Whether `text` is a Cardano mainnet address of CIP-19: bech32 with a valid checksum under the
 * prefix addr or stake, whose header names mainnet. Any type is admitted (key or script hashes,
 * pointers); only addresses, never key texts.
 */
export function isCardanoMainnetAddress(text: string): boolean {
  const lower = text.trim().toLowerCase();
  const prefix = Object.values(ADDRESS_PREFIX).find((name) => lower.startsWith(`${name}1`));
  if (prefix === undefined || lower.length > MAX_ADDRESS_CHARACTERS) return false;
  let bytes: Uint8Array;
  try {
    bytes = bech32.decodeToBytes(lower, MAX_ADDRESS_CHARACTERS).bytes;
  } catch {
    return false;
  }
  const header = bytes[0];
  return header !== undefined && (header & 0b1111) === MAINNET;
}

/** A mainnet address of a key hash, as CIP-8 signs for it: its bytes and the key hash that signs. */
export interface CardanoSigningAddress {
  /** The address's bytes, header first, which a CIP-8 signature's protected header holds. */
  readonly bytes: Uint8Array;
  /**
   * The hash of the key that signs for it (CIP-30's signData): the payment key of a base or
   * enterprise address, the stake key of a reward address; each is the first credential.
   */
  readonly signer: Uint8Array;
}

/** The bytes each address type of a key hash has: the header and its one or two key hashes. */
const ADDRESS_BYTES: Readonly<Record<number, number>> = Object.freeze({
  [ADDRESS_TYPE.base]: 1 + 2 * KEY_HASH_BYTES,
  [ADDRESS_TYPE.enterprise]: 1 + KEY_HASH_BYTES,
  [ADDRESS_TYPE.reward]: 1 + KEY_HASH_BYTES,
});

/**
 * The mainnet base, enterprise or reward address `text` of key hashes, as it is signed for; undefined
 * for any other text, such as an address of a script or a pointer, or another network's.
 */
export function cardanoSigningAddress(text: string): CardanoSigningAddress | undefined {
  if (!isCardanoMainnetAddress(text) || text.trim() !== text) return undefined;
  const bytes = bech32.decodeToBytes(text.toLowerCase(), MAX_ADDRESS_CHARACTERS).bytes;
  const header = bytes[0] ?? 0;
  const type = header >> 4;
  const prefix = type === ADDRESS_TYPE.reward ? ADDRESS_PREFIX.reward : ADDRESS_PREFIX.payment;
  if (ADDRESS_BYTES[type] !== bytes.length || !text.toLowerCase().startsWith(`${prefix}1`))
    return undefined;
  return { bytes, signer: bytes.slice(1, 1 + KEY_HASH_BYTES) };
}

/** The CIP-5 bech32 text of a key, such as acct_xvk1…, from its bytes. */
export function cardanoKeyText(prefix: CardanoKeyPrefix, bytes: Uint8Array): string {
  return bech32Text(prefix, bytes);
}

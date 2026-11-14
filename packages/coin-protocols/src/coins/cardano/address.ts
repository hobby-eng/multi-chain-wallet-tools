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

/** A CIP-19 mainnet address as read: its prefix, its header's type and its bytes, header first. */
interface MainnetAddress {
  readonly prefix: string;
  readonly type: number;
  readonly bytes: Uint8Array;
}

/**
 * `text` read as a Cardano mainnet address: bech32 with a valid checksum under the prefix addr or
 * stake, whose header names mainnet; undefined for any other text. The text is decoded as given, so
 * that a text of mixed case is refused, as BIP-173 says and @scure/base does; all upper case is
 * valid bech32 and is read.
 */
function mainnetAddress(text: string): MainnetAddress | undefined {
  // Only a text of Cardano's prefixes is decoded: the Wallet Matcher asks every coin of each line.
  const lower = text.toLowerCase();
  if (
    text.length > MAX_ADDRESS_CHARACTERS ||
    !Object.values<string>(ADDRESS_PREFIX).some((prefix) => lower.startsWith(`${prefix}1`))
  )
    return undefined;
  let decoded: { readonly prefix: string; readonly bytes: Uint8Array };
  try {
    decoded = bech32.decodeToBytes(text, MAX_ADDRESS_CHARACTERS);
  } catch {
    return undefined;
  }
  const { prefix, bytes } = decoded;
  const header = bytes[0];
  if (!Object.values<string>(ADDRESS_PREFIX).includes(prefix) || header === undefined)
    return undefined;
  if ((header & 0b1111) !== MAINNET) return undefined;
  return { prefix, type: header >> 4, bytes };
}

/** CIP-5's prefix of each header type: stake for the reward addresses (14, 15), addr below. */
function prefixOf(type: number): string {
  return type >= ADDRESS_TYPE.reward ? ADDRESS_PREFIX.reward : ADDRESS_PREFIX.payment;
}

/**
 * Whether `text` is a Cardano mainnet address of CIP-19: bech32 with a valid checksum under the
 * prefix addr or stake, whose header names mainnet. Any type is admitted (key or script hashes,
 * pointers); only addresses, never key texts.
 */
export function isCardanoMainnetAddress(text: string): boolean {
  return mainnetAddress(text.trim()) !== undefined;
}

/** A mainnet address of a key hash, as CIP-8 signs for it: its bytes and the key hash that signs. */
export interface CardanoSigningAddress {
  /** Its type: a payment key's base or enterprise address, or a stake key's reward address. */
  readonly kind: keyof typeof ADDRESS_TYPE;
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
  if (text.trim() !== text) return undefined;
  const address = mainnetAddress(text);
  if (
    address === undefined ||
    ADDRESS_BYTES[address.type] !== address.bytes.length ||
    address.prefix !== prefixOf(address.type)
  )
    return undefined;
  const { type, bytes } = address;
  const kind =
    type === ADDRESS_TYPE.reward ? "reward" : type === ADDRESS_TYPE.base ? "base" : "enterprise";
  return { kind, bytes, signer: bytes.slice(1, 1 + KEY_HASH_BYTES) };
}

/**
 * CIP-19's bytes of each header type of a script address: a base address with a script hash for
 * either credential or both (1, 2, 3), and a script's enterprise (7) and reward (15) addresses. A
 * hash of a script is 28 bytes, as a key's is.
 */
const SCRIPT_ADDRESS_BYTES: Readonly<Record<number, number>> = Object.freeze({
  [0b0001]: 1 + 2 * KEY_HASH_BYTES,
  [0b0010]: 1 + 2 * KEY_HASH_BYTES,
  [0b0011]: 1 + 2 * KEY_HASH_BYTES,
  [0b0111]: 1 + KEY_HASH_BYTES,
  [0b1111]: 1 + KEY_HASH_BYTES,
});
/** CIP-19's header types of pointer addresses: a key's (4) and a script's (5) payment hash. */
const POINTER_TYPES: readonly number[] = Object.freeze([0b0100, 0b0101]);

/**
 * Whether `bytes` are exactly CIP-19's pointer: three variable-length naturals, seven bits in each
 * byte, whose high bit is set on every byte of a natural but its last.
 */
function isPointer(bytes: Uint8Array): boolean {
  const ends = bytes.filter((byte) => byte < 0x80).length;
  return ends === 3 && (bytes.at(-1) ?? 0x80) < 0x80;
}

/**
 * Whether `text` is a well-formed Cardano mainnet address of a script or a pointer (CIP-19): its
 * header's type, its prefix and its length fit one, which no key's row shows.
 */
export function isCardanoScriptOrPointerAddress(text: string): boolean {
  const address = mainnetAddress(text.trim());
  if (address === undefined || address.prefix !== prefixOf(address.type)) return false;
  const { type, bytes } = address;
  return POINTER_TYPES.includes(type)
    ? isPointer(bytes.subarray(1 + KEY_HASH_BYTES))
    : SCRIPT_ADDRESS_BYTES[type] === bytes.length;
}

/** The CIP-5 bech32 text of a key, such as acct_xvk1…, from its bytes. */
export function cardanoKeyText(prefix: CardanoKeyPrefix, bytes: Uint8Array): string {
  return bech32Text(prefix, bytes);
}

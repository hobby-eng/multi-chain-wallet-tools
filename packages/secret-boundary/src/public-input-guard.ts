import { nonEmptyLines } from "@ckd/core/text-lines.js";
import { BIP39_WORD_COUNTS, isBip39WordCount } from "@ckd/core/bip39-parameters.js";
import { PrivateMaterialError } from "./private-material-error.js";
import { base58, createBase58check } from "@scure/base";
import { wordlist as czechWordlist } from "@scure/bip39/wordlists/czech.js";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";
import { wordlist as frenchWordlist } from "@scure/bip39/wordlists/french.js";
import { wordlist as italianWordlist } from "@scure/bip39/wordlists/italian.js";
import { wordlist as japaneseWordlist } from "@scure/bip39/wordlists/japanese.js";
import { wordlist as koreanWordlist } from "@scure/bip39/wordlists/korean.js";
import { wordlist as portugueseWordlist } from "@scure/bip39/wordlists/portuguese.js";
import { wordlist as simplifiedChineseWordlist } from "@scure/bip39/wordlists/simplified-chinese.js";
import { wordlist as spanishWordlist } from "@scure/bip39/wordlists/spanish.js";
import { wordlist as traditionalChineseWordlist } from "@scure/bip39/wordlists/traditional-chinese.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { equalBytes } from "@noble/curves/utils.js";
import { hexToBytes, sha256, wipe } from "@ckd/core/crypto.js";
import { decodeRippleBase58Check } from "@ckd/core/ripple-base58check.js";
import { STRKEY_SECRET_SEED, strKeyVersion } from "@ckd/core/strkey.js";

const base58check = createBase58check(sha256);
const RAW_SECRET_PATTERN = /^(?:0x)?[0-9a-f]{64}$/iu;
/**
 * An extended private key, alone or inside text: a private prefix of BIP32 and SLIP-132 in its exact
 * letter case (xprv, yprv, zprv, tprv, uprv, vprv and the multisig Yprv, Zprv, Uprv, Vprv), then at
 * least 41 more base58 characters. Addresses may start with the same letters in another case
 * ("TPRV…", "XprV…"), and a base58 address of the coins the tools look up has at most 44 characters
 * (Solana's), so 45 or more is never one; a full key has 111. The shorter start of a key holds no
 * byte of its private key, only the version, depth, fingerprint, child number and chain code.
 */
const EXTENDED_PRIVATE_PATTERN =
  /(?:^|[^A-Za-z0-9])(?:[xyztuv]prv|[YZUV]prv)[1-9A-HJ-NP-Za-km-z]{41,}/u;
const PRIVATE_LABEL_PATTERN =
  /(?:^|[{"'\s])(?:private[\s_-]*key|spending[\s_-]*key|mnemonic|seed[\s_-]*phrase|recovery[\s_-]*phrase|xprv)["']?\s*[:=]/iu;
const WIF_VERSIONS = new Set([0x80, 0xcc, 0xef]);
/**
 * An Ed25519 secret key as wallets write it in base58: the 32-byte private key and the 32-byte
 * public key, 64 bytes, bare (a Solana keypair) or after "ed25519:" (a NEAR secret key), spaces
 * allowed after the colon. Base58 of 64 bytes is 86 to 88 characters; no public input of the tools
 * is 64 bytes of base58.
 */
const ED25519_KEYPAIR_BYTES = 64;
const ED25519_KEYPAIR_PATTERN = /^(?:ed25519:\s*)?([1-9A-HJ-NP-Za-km-z]{80,90})$/u;
/** The same keypair as a JSON array of its 64 byte values, as the Solana CLI saves a keypair file. */
const KEYPAIR_ARRAY_PATTERN = new RegExp(
  `^\\[\\s*\\d{1,3}(?:\\s*,\\s*\\d{1,3}){${ED25519_KEYPAIR_BYTES - 1}}\\s*\\]$`,
  "u",
);
const BYTE_MAX = 0xff;
/**
 * The same 64-byte keypair in hex, the 32-byte seed then its public key, as wallets write a "64-byte
 * secret key" (TON's tools among them). Other values of 64 bytes in hex are public input (Dash's
 * Orchard incoming viewing key), so the value is refused only when its second half is the Ed25519
 * public key of its first half.
 */
const KEYPAIR_HEX_PATTERN = /^(?:0x)?([0-9a-f]{128})$/iu;
const ED25519_SEED_BYTES = 32;
/**
 * A private key in DER, written in hex as wallets and SDKs export one (Hedera's): a PKCS#8
 * PrivateKeyInfo or a SEC1 ECPrivateKey, a SEQUENCE whose first element is the one-byte INTEGER
 * version 0 or 1, its length matching the text. A public key's DER (SubjectPublicKeyInfo) opens its
 * SEQUENCE with another SEQUENCE, so it passes. The SEQUENCE holds at least a 32-byte key.
 */
const DER_PRIVATE_KEY_PATTERN =
  /^(?:0x)?30(?:([0-7][0-9a-f])|81([0-9a-f]{2})|82([0-9a-f]{4}))(02010[01](?:[0-9a-f]{2})*)$/iu;
const DER_PRIVATE_KEY_SMALLEST_BODY = 3 + 32;
/**
 * The XRP Ledger's family seed ("s…"): Base58Check in Ripple's alphabet of a version and 16 seed
 * bytes. The version is 0x21 for a secp256k1 seed and 01 E1 4B for an Ed25519 seed ("sEd…"). Its
 * checksum is required, since short base58 words that start with "s" may be names.
 */
const FAMILY_SEED_VERSIONS = [[0x21], [0x01, 0xe1, 0x4b]] as const;
const FAMILY_SEED_BYTES = 16;
const FAMILY_SEED_PATTERN = /^s[1-9A-HJ-NP-Za-km-z]{24,34}$/u;
const SHORTEST_PHRASE_WORDS = BIP39_WORD_COUNTS[0];
const LONGEST_PHRASE_WORDS = BIP39_WORD_COUNTS.at(-1)!;
/** Every word has at least one letter (the Chinese lists use single characters). */
const SHORTEST_PHRASE_LETTERS = SHORTEST_PHRASE_WORDS;
/**
 * Characters a person may put between the words of a phrase instead of spaces. Joined with one of
 * them, or with nothing at all, a phrase can pass as a DPNS name, which an Identity lookup sends to
 * the provider (AUD-019-SEC001).
 */
const WORD_SEPARATORS = /[\s,;:._\-/\\|+]+/gu;
const BIP39_WORDLISTS = [
  czechWordlist,
  englishWordlist,
  frenchWordlist,
  italianWordlist,
  japaneseWordlist,
  koreanWordlist,
  portugueseWordlist,
  simplifiedChineseWordlist,
  spanishWordlist,
  traditionalChineseWordlist,
] as const;

export { PrivateMaterialError };

function looksLikeMnemonic(value: string): boolean {
  const words = value.normalize("NFKD").trim().split(/\s+/u);
  return isBip39WordCount(words.length) && words.every((word) => /^[\p{L}]+$/u.test(word));
}

/** Each wordlist as a set, with the length of its longest word, for the joined-phrase checks. */
const BIP39_WORD_SETS = BIP39_WORDLISTS.map((wordlist) => {
  const words = wordlist.map((word) => word.normalize("NFKD"));
  return {
    words: new Set(words),
    longestWord: Math.max(...words.map((word) => word.length)),
  };
});

function isPhraseLength(count: number): boolean {
  return isBip39WordCount(count);
}

/**
 * A phrase whose words are joined by punctuation instead of spaces, such as
 * "zoo-zoo-…-wrong": the separated parts are a phrase's number of words from one BIP39 list.
 */
function looksLikeSeparatedPhrase(value: string): boolean {
  const parts = value.normalize("NFKD").toLowerCase().split(WORD_SEPARATORS).filter(Boolean);
  if (!isPhraseLength(parts.length)) return false;
  return BIP39_WORD_SETS.some(({ words }) => parts.every((part) => words.has(part)));
}

/**
 * Whether `text` can be cut into a phrase's number of words from one list, from `start` on.
 * `failed` remembers the positions and word counts already known to lead nowhere, so that the
 * search stays small even where words are prefixes of other words ("act", "action").
 */
function splitsIntoPhrase(
  text: string,
  { words, longestWord }: (typeof BIP39_WORD_SETS)[number],
  start = 0,
  count = 0,
  failed = new Set<string>(),
): boolean {
  if (start === text.length) return isPhraseLength(count);
  if (count === LONGEST_PHRASE_WORDS || failed.has(`${start}:${count}`)) return false;
  for (let end = start + 1; end <= Math.min(text.length, start + longestWord); end += 1) {
    if (
      words.has(text.slice(start, end)) &&
      splitsIntoPhrase(text, { words, longestWord }, end, count + 1, failed)
    )
      return true;
  }
  failed.add(`${start}:${count}`);
  return false;
}

/**
 * Twelve or more words of one BIP39 list in a row, across lines and separators: a phrase pasted
 * into a batch, one word per line or several per line. No checksum is required, because a phrase
 * with a typo is just as secret, and a single word on its own line would pass as a DPNS name.
 */
function containsPhraseRun(value: string): boolean {
  const tokens = value.normalize("NFKD").toLowerCase().split(WORD_SEPARATORS).filter(Boolean);
  return BIP39_WORD_SETS.some(({ words }) => {
    let run = 0;
    for (const token of tokens) {
      run = words.has(token) ? run + 1 : 0;
      if (run >= SHORTEST_PHRASE_WORDS) return true;
    }
    return false;
  });
}

/** A phrase written without any separator, such as "zoozoo…wrong". */
function looksLikeUnseparatedPhrase(value: string): boolean {
  const text = value.normalize("NFKD").toLowerCase();
  if (!/^\p{L}+$/u.test(text)) return false;
  return BIP39_WORD_SETS.some(
    (list) =>
      text.length >= SHORTEST_PHRASE_LETTERS &&
      text.length <= LONGEST_PHRASE_WORDS * list.longestWord &&
      splitsIntoPhrase(text, list),
  );
}

function looksLikeEd25519Keypair(value: string): boolean {
  const body = ED25519_KEYPAIR_PATTERN.exec(value)?.[1];
  if (body === undefined) return false;
  let decoded: Uint8Array | undefined;
  try {
    decoded = base58.decode(body);
    return decoded.length === ED25519_KEYPAIR_BYTES;
  } catch {
    return false;
  } finally {
    wipe(decoded);
  }
}

function looksLikeKeypairArray(value: string): boolean {
  return (
    KEYPAIR_ARRAY_PATTERN.test(value) &&
    (value.match(/\d+/gu) ?? []).every((byte) => Number(byte) <= BYTE_MAX)
  );
}

function looksLikeKeypairHex(value: string): boolean {
  const body = KEYPAIR_HEX_PATTERN.exec(value)?.[1];
  if (body === undefined) return false;
  let bytes: Uint8Array | undefined;
  let publicKey: Uint8Array | undefined;
  try {
    bytes = hexToBytes(body.toLowerCase());
    publicKey = ed25519.getPublicKey(bytes.subarray(0, ED25519_SEED_BYTES));
    return equalBytes(publicKey, bytes.subarray(ED25519_SEED_BYTES));
  } catch {
    return false;
  } finally {
    wipe(bytes);
    wipe(publicKey);
  }
}

function looksLikeDerPrivateKey(value: string): boolean {
  const match = DER_PRIVATE_KEY_PATTERN.exec(value);
  if (match === null) return false;
  const [, short, oneByte, twoBytes, body = ""] = match;
  const length = Number.parseInt(short ?? oneByte ?? twoBytes ?? "", 16);
  return length >= DER_PRIVATE_KEY_SMALLEST_BODY && body.length === length * 2;
}

function looksLikeFamilySeed(value: string): boolean {
  if (!FAMILY_SEED_PATTERN.test(value)) return false;
  const payload = decodeRippleBase58Check(value);
  if (payload === null) return false;
  try {
    return FAMILY_SEED_VERSIONS.some(
      (version) =>
        payload.length === version.length + FAMILY_SEED_BYTES &&
        version.every((byte, at) => payload[at] === byte),
    );
  } finally {
    wipe(payload);
  }
}

function looksLikeWif(value: string): boolean {
  let payload: Uint8Array | undefined;
  try {
    payload = base58check.decode(value);
    return (
      (payload.length === 33 || payload.length === 34) &&
      WIF_VERSIONS.has(payload[0] ?? -1) &&
      (payload.length === 33 || payload[33] === 0x01)
    );
  } catch {
    return false;
  } finally {
    wipe(payload);
  }
}

export function assertPublicLookupInput(value: string): void {
  const input = value.trim();
  if (input.length === 0)
    throw new Error("Enter a public address, Identity identifier, or public key.");
  if (
    RAW_SECRET_PATTERN.test(input) ||
    EXTENDED_PRIVATE_PATTERN.test(input) ||
    PRIVATE_LABEL_PATTERN.test(input) ||
    /-----BEGIN [^-]*PRIVATE KEY-----/iu.test(input) ||
    looksLikeMnemonic(input) ||
    looksLikeSeparatedPhrase(input) ||
    looksLikeUnseparatedPhrase(input) ||
    looksLikeWif(input) ||
    looksLikeEd25519Keypair(input) ||
    looksLikeKeypairArray(input) ||
    looksLikeKeypairHex(input) ||
    looksLikeDerPrivateKey(input) ||
    looksLikeFamilySeed(input) ||
    // A StrKey secret seed (S…), as Stellar wallets show it; checked without its checksum, since a
    // seed with a typo is just as secret.
    strKeyVersion(input) === STRKEY_SECRET_SEED
  )
    throw new PrivateMaterialError();
}

export function assertPublicBatchLookupInput(value: string): void {
  const lines = nonEmptyLines(value);
  for (const line of lines) assertPublicLookupInput(line);
  if (containsPhraseRun(value)) throw new PrivateMaterialError();
}

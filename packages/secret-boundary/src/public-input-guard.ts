import { createBase58check } from "@scure/base";
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
import { sha256 } from "@ckd/core/crypto.js";

const base58check = createBase58check(sha256);
const RAW_SECRET_PATTERN = /^(?:0x)?[0-9a-f]{64}$/iu;
const EXTENDED_PRIVATE_PATTERN =
  /(?:^|[^a-z0-9])(?:xprv|tprv|yprv|zprv|uprv|vprv)[1-9A-HJ-NP-Za-km-z]+/iu;
const PRIVATE_LABEL_PATTERN =
  /(?:^|[{"'\s])(?:private[\s_-]*key|spending[\s_-]*key|mnemonic|seed[\s_-]*phrase|recovery[\s_-]*phrase|xprv)["']?\s*[:=]/iu;
const WIF_VERSIONS = new Set([0x80, 0xcc, 0xef]);
const MNEMONIC_WORD_COUNTS = [12, 15, 18, 21, 24] as const;
const SHORTEST_PHRASE_WORDS = 12;
const LONGEST_PHRASE_WORDS = 24;
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

export class PrivateMaterialError extends Error {
  constructor(
    message = "Private key-like material was detected and erased. No network request was made.",
  ) {
    super(message);
    this.name = "PrivateMaterialError";
  }
}

function looksLikeMnemonic(value: string): boolean {
  const words = value.normalize("NFKD").trim().split(/\s+/u);
  return (
    MNEMONIC_WORD_COUNTS.includes(words.length as (typeof MNEMONIC_WORD_COUNTS)[number]) &&
    words.every((word) => /^[\p{L}]+$/u.test(word))
  );
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
  return MNEMONIC_WORD_COUNTS.includes(count as (typeof MNEMONIC_WORD_COUNTS)[number]);
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

function looksLikeWif(value: string): boolean {
  try {
    const payload = base58check.decode(value);
    return (
      (payload.length === 33 || payload.length === 34) &&
      WIF_VERSIONS.has(payload[0] ?? -1) &&
      (payload.length === 33 || payload[33] === 0x01)
    );
  } catch {
    return false;
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
    looksLikeWif(input)
  )
    throw new PrivateMaterialError();
}

export function assertPublicBatchLookupInput(value: string): void {
  const lines = value
    .replaceAll("\r", "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) assertPublicLookupInput(line);
  if (containsPhraseRun(value)) throw new PrivateMaterialError();
}

// MHFE's optional wallet check, MHFE-WALLET-CHECK-SEED-1 (mhfe_spec README, "Optional source
// profile: a recovery check for new 24-word phrases"): a 24-word phrase passes with a passphrase Q
// when the first 16 bits of T = SHA-256("MHFE-WALLET-CHECK-SEED-1" || BE32(256) || seed) are zero,
// the seed being BIP39's from the phrase and Q. From MHFE 0.8.0 the Deriver alone draws such
// phrases: fresh, uniformly random phrases, the person's wishes met as bip39-chosen-words meets
// them, until one passes. The first passing draw is taken, by the order of the draws only, which
// keeps every passing phrase equally likely, as the specification's generation requires.
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  chosenWordsRemainingBits,
  generateMnemonicWithChosenWords,
  type ChosenWordsRequest,
} from "./bip39-chosen-words.js";
import { ErrorCatalog } from "./error-catalog.js";
import type { RandomBytes } from "./random-byte-source.js";
import { secureRandomBytes } from "./secure-random.js";
import { nfkd } from "./unicode-nfkd.js";

const ERRORS = new ErrorCatalog("wallet.wallet-check", {
  words: () => "The MHFE wallet check draws 24-word phrases only.",
  limit: () => "No phrase passed the wallet check in time. Generate again.",
  "self-test": () => "The wallet check's digest differs from its published vector.",
  random: () =>
    "The browser's random generator gave the same bytes twice: no phrase is drawn from it.",
});

/** The profile's domain tag, 24 ASCII characters, hashed before the seed. */
const TAG = utf8ToBytes("MHFE-WALLET-CHECK-SEED-1");
/** BE32(256): the seed's length in bits, hashed between the tag and the seed. */
const SEED_BITS = Uint8Array.of(0, 0, 1, 0);
/** The bits of T that must be zero. */
export const WALLET_CHECK_BITS = 16;
/** The profile takes 24-word phrases only. */
export const WALLET_CHECK_WORDS = 24;
/** The draws a passing phrase takes on average: one in 2^16 passes. */
export const WALLET_CHECK_EXPECTED_DRAWS = 2 ** WALLET_CHECK_BITS;
/**
 * The random bits the check alone leaves of a 24-word phrase, 240, from which a phrase's randomness
 * is ample and below which wishes make it not recommended, as MHFE rated them before 0.8.0.
 */
export const RECOMMENDED_RANDOM_BITS = 240;
/** A draw gives up after this many times the expected draws, as MHFE's own draw did. */
const DRAW_LIMIT_FACTOR = 64;
/** How often a draw reports how many phrases it tried. */
const REPORT_EVERY = 64;
const BIP39_ITERATIONS = 2048;

/** T for a 64-byte BIP39 seed. */
export function walletCheckDigest(seed: Uint8Array): Uint8Array {
  const input = new Uint8Array(TAG.length + SEED_BITS.length + seed.length);
  try {
    input.set(TAG, 0);
    input.set(SEED_BITS, TAG.length);
    input.set(seed, TAG.length + SEED_BITS.length);
    return sha256(input);
  } finally {
    input.fill(0);
  }
}

/**
 * The profile's published vector (mhfe_spec vectors/profiles/wallet-check.json, counter-76562-trezor):
 * the BIP39 seed of "abandon … above proof fatigue" with "TREZOR", and its digest T.
 */
const KNOWN_SEED =
  "da2688682dcc5dd3b4f7133a2b7c121b3e6cba178aecd6365d2af032813279e0" +
  "722c2a155ea11de0590d7344f081e7cd189c4b75c75bd816fa21f350b395443e";
const KNOWN_DIGEST = "0000e86481bdfe6dbf45e6e41fba4f309fcf09d3f0af2fe3f46736c663840853";

/** The page's check of its own digest against the published vector; throws when it differs. */
export function runWalletCheckSelfTest(): void {
  const seed = hexToBytes(KNOWN_SEED);
  const digest = walletCheckDigest(seed);
  if (bytesToHex(digest) !== KNOWN_DIGEST || !passesWalletCheck(seed))
    throw ERRORS.create("self-test", []);
}

/** Whether a 64-byte BIP39 seed passes: the first 16 bits of its T are zero. */
export function passesWalletCheck(seed: Uint8Array): boolean {
  const digest = walletCheckDigest(seed);
  const passes = digest[0] === 0 && digest[1] === 0;
  digest.fill(0);
  return passes;
}

/**
 * BIP39's seed of `phrase` and `passphrase`, both normalized by the Deriver's own NFKD of Unicode
 * 18.0.0: PBKDF2-HMAC-SHA512 with 2048 iterations, by WebCrypto where the browser has it (many times
 * faster than JavaScript), else by @noble/hashes.
 */
export async function bip39Seed(phrase: string, passphrase: string): Promise<Uint8Array> {
  const password = utf8ToBytes(nfkd(phrase));
  const salt = utf8ToBytes(`mnemonic${nfkd(passphrase)}`);
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle === undefined)
      return await pbkdf2Async(sha512, password, salt, { c: BIP39_ITERATIONS, dkLen: 64 });
    const key = await subtle.importKey("raw", password, "PBKDF2", false, ["deriveBits"]);
    const bits = await subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-512", salt, iterations: BIP39_ITERATIONS },
      key,
      512,
    );
    return new Uint8Array(bits);
  } finally {
    password.fill(0);
    salt.fill(0);
  }
}

/** What a draw keeps of a phrase's randomness, as MHFE rated it for the person before 0.8.0. */
export interface WalletCheckOdds {
  /** About; for someone who knows the chosen word. */
  readonly randomBits: number;
  readonly randomness: "ample" | "notRecommended";
  /** A word asked for at a fixed position, where one anywhere would keep more. */
  readonly fixedPosition: boolean;
}

/** The odds of a draw with the check and `wishes`, for a 24-word phrase. */
export function walletCheckOdds(wishes: ChosenWordsRequest): WalletCheckOdds {
  const randomBits = chosenWordsRemainingBits(wishes) - WALLET_CHECK_BITS;
  return {
    randomBits,
    randomness: randomBits >= RECOMMENDED_RANDOM_BITS - 1e-9 ? "ample" : "notRecommended",
    fixedPosition: wishes.chosen.some((word) => word.position !== "anywhere"),
  };
}

/** Bytes a probe of the random source draws, twice. */
const PROBE_BYTES = 32;

/**
 * Refuses a random source that gives the same bytes twice, as a broken or stubbed one does, before
 * the minutes a draw takes: MHFE probed its source the same way before it drew.
 */
function assertRandomSourceWorks(randomBytes: RandomBytes): void {
  const first = randomBytes(PROBE_BYTES);
  const second = randomBytes(PROBE_BYTES);
  try {
    if (first.every((byte, index) => byte === second[index])) throw ERRORS.create("random", []);
  } finally {
    first.fill(0);
    second.fill(0);
  }
}

export interface WalletCheckDrawOptions {
  /** Stops the draw between phrases; the promise then rejects with the signal's reason. */
  readonly signal?: AbortSignal;
  /** Told the phrases tried so far, every few dozen. */
  readonly onDraws?: (draws: number) => void;
  /** Only tests pass another source; a real phrase always uses crypto.getRandomValues(). */
  readonly randomBytes?: RandomBytes;
}

/**
 * A 24-word phrase that meets `wishes` and passes the wallet check with `passphrase`: phrases are
 * drawn one after another, each fresh and uniformly random among those that meet the wishes, and
 * the first that passes is the answer. Throws when none passed in 64 times the expected draws,
 * which a working generator reaches with odds of about e^-64.
 */
export async function drawWalletCheckPhrase(
  wishes: ChosenWordsRequest,
  passphrase: string,
  { signal, onDraws, randomBytes }: WalletCheckDrawOptions = {},
): Promise<string> {
  if (wishes.wordCount !== WALLET_CHECK_WORDS) throw ERRORS.create("words", []);
  assertRandomSourceWorks(randomBytes ?? secureRandomBytes);
  const limit = WALLET_CHECK_EXPECTED_DRAWS * DRAW_LIMIT_FACTOR;
  for (let draws = 1; draws <= limit; draws += 1) {
    signal?.throwIfAborted();
    const phrase = await generateMnemonicWithChosenWords(wishes, {
      ...(randomBytes === undefined ? {} : { randomBytes }),
    });
    const seed = await bip39Seed(phrase, passphrase);
    const passes = passesWalletCheck(seed);
    seed.fill(0);
    if (passes) {
      onDraws?.(draws);
      return phrase;
    }
    if (draws % REPORT_EVERY === 0) onDraws?.(draws);
  }
  throw ERRORS.create("limit", []);
}

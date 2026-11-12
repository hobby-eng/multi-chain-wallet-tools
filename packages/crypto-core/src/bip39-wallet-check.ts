// MHFE's optional wallet check, MHFE-WALLET-CHECK-SEED-1 (mhfe_spec README, "Optional source
// profile: a recovery check for new 24-word phrases"): a 24-word phrase passes with a passphrase Q
// when the first 16 bits of T = SHA-256("MHFE-WALLET-CHECK-SEED-1" || BE32(256) || seed) are zero,
// the seed being BIP39's from the phrase and Q. From MHFE 0.8.0 the Deriver alone draws such
// phrases: fresh, uniformly random phrases, the person's wishes met as bip39-chosen-words meets
// them, until one passes. The first passing draw is taken, by the order of the draws only, which
// keeps every passing phrase equally likely, as the specification's generation requires.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { generateMnemonicWithChosenWords, type ChosenWordsRequest } from "./bip39-chosen-words.js";
import { ErrorCatalog } from "./error-catalog.js";
import { webCryptoPbkdf2Sha512, type Pbkdf2Sha512 } from "./pbkdf2-sha512.js";
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
/** A draw gives up after this many times the expected draws, as MHFE's own draw did. */
const DRAW_LIMIT_FACTOR = 64;
const BIP39_ITERATIONS = 2048;
/** BIP39's seed: 512 bits. */
const SEED_BYTES = 64;

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
 * 18.0.0: PBKDF2-HMAC-SHA512 with 2048 iterations, by `derive`: WebCrypto unless a draw's worker
 * computes in JavaScript (pbkdf2-sha512.ts).
 */
export async function bip39Seed(
  phrase: string,
  passphrase: string,
  derive: Pbkdf2Sha512 = webCryptoPbkdf2Sha512,
): Promise<Uint8Array> {
  const password = utf8ToBytes(nfkd(phrase));
  const salt = utf8ToBytes(`mnemonic${nfkd(passphrase)}`);
  try {
    return await derive(password, salt, BIP39_ITERATIONS, SEED_BYTES);
  } finally {
    password.fill(0);
    salt.fill(0);
  }
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

/**
 * A cheaper condition that a phrase must also pass, tried before its seed is stretched for the
 * wallet check: TON's check (ton-mnemonic.ts) in the Deriver. It must not depend on the
 * passphrase, so that the two conditions stay independent.
 */
export interface DrawPrecheck {
  /** Whether `phrase` passes. */
  readonly passes: (phrase: string) => Promise<boolean>;
  /** One phrase in this many passes, on average. */
  readonly expectedDraws: number;
}

export interface WalletCheckDrawOptions {
  /** Stops the draw between phrases; the promise then rejects with the signal's reason. */
  readonly signal?: AbortSignal;
  /** Told the phrases tried so far after every phrase; the host decides how often to show it. */
  readonly onDraws?: (draws: number) => void;
  /** Only tests pass another source; a real phrase always uses crypto.getRandomValues(). */
  readonly randomBytes?: RandomBytes;
  /** A condition tried first on every phrase; only a phrase that passes it is checked. */
  readonly precheck?: DrawPrecheck;
  /** The engine of the seed's PBKDF2; WebCrypto unless given (pbkdf2-sha512.ts). */
  readonly derive?: Pbkdf2Sha512;
}

/**
 * A 24-word phrase that meets `wishes`, passes `precheck` if one is given and passes the wallet
 * check with `passphrase`: phrases are drawn one after another, each fresh and uniformly random
 * among those that meet the wishes, and the first that passes every condition is the answer. The
 * conditions only reject, so every phrase that passes them all stays equally likely. Throws when
 * none passed in 64 times the expected draws, which a working generator reaches with odds of about
 * e^-64.
 */
export async function drawWalletCheckPhrase(
  wishes: ChosenWordsRequest,
  passphrase: string,
  { signal, onDraws, randomBytes, precheck, derive }: WalletCheckDrawOptions = {},
): Promise<string> {
  if (wishes.wordCount !== WALLET_CHECK_WORDS) throw ERRORS.create("words", []);
  assertRandomSourceWorks(randomBytes ?? secureRandomBytes);
  const limit = WALLET_CHECK_EXPECTED_DRAWS * (precheck?.expectedDraws ?? 1) * DRAW_LIMIT_FACTOR;
  for (let draws = 1; draws <= limit; draws += 1) {
    signal?.throwIfAborted();
    const phrase = await generateMnemonicWithChosenWords(
      wishes,
      randomBytes === undefined ? {} : { randomBytes },
    );
    // The precheck first: it is the cheaper condition, and most phrases fail it.
    const passes =
      (precheck === undefined || (await precheck.passes(phrase))) &&
      (await passesWithPassphrase(phrase, passphrase, derive));
    onDraws?.(draws);
    if (passes) return phrase;
  }
  throw ERRORS.create("limit", []);
}

/** Whether `phrase` passes the wallet check with `passphrase`; its seed is cleared afterwards. */
async function passesWithPassphrase(
  phrase: string,
  passphrase: string,
  derive: Pbkdf2Sha512 | undefined,
): Promise<boolean> {
  const seed = await bip39Seed(phrase, passphrase, derive);
  try {
    return passesWalletCheck(seed);
  } finally {
    seed.fill(0);
  }
}

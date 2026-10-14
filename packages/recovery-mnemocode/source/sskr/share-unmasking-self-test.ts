// The self-test of shares masked with dates (sskr/share-unmasking.ts): the phrase that a restored
// set holds, the masked phrase of the published Seedshift vector, unmasked with its whole date,
// searched where a digit of it is forgotten with the wallet deciding, and refused with more dates
// than it takes; and, with the host's SSKR library, shares of that masked phrase with unread
// colors repaired together and then unmasked with the forgotten digit. It answers later, so
// core/self-test.ts runs it only in the full self-test.
//
// From the host it needs the master fingerprint of a phrase, for the wallet check, and optionally
// its SharePlatform (sskr/share-platform.ts). It holds public test data, no secret.
//
// Host-neutral: it imports only core modules, @scure/bip39 and other host-neutral sskr modules.

import { mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { DatesAnswer } from "../core/date-search.js";
import { expectSame } from "../core/self-test-check.js";
import { JointRepair, searchOnce } from "./joint-repair.js";
import { type RepairedSet } from "./joint-results.js";
import { SEED_BYTES, type SharePlatform } from "./share-platform.js";
import { ShareUnmasking } from "./share-unmasking.js";
import { writeShare } from "./transport.js";
import { fingerprintWalletCheck, type PhraseFingerprint } from "../core/wallet-check.js";

const PUBLIC_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
/** Its master fingerprint (vectors/mnemocode-v1.json, direct-12, sourceFingerprint). */
const PUBLIC_FINGERPRINT = "73c5da0a";
/**
 * A set of shares as restored, holding the public phrase masked with MnemoCode Seedshift and
 * 23-09-2026 (vectors/mnemocode-v1.json, checksum-valid-seedshift-12): the phrase is all that the
 * unmasking reads of it.
 */
const MASKED_SET: RepairedSet = Object.freeze({
  mnemonic: "wool abuse actual wool abuse actual wool abuse actual wool abuse congress",
  shares: [],
  unsettled: [],
});
const MASKED_DATE = "23-09-2026";
/** Five dates: a phrase of twelve words takes four, one for every three words. */
const FIVE_DATES = "01-01-2001 02-01-2001 03-01-2001 04-01-2001 05-01-2001";

/**
 * The seed of the SSKR library's random numbers for the shares made here: fixed, as in the
 * deterministic vectors of vectors/sskr-v1.json, so that the check is the same at every run. Only
 * public test data is split with it; a real split takes fresh randomness (sskr/split.ts).
 */
const TEST_SPLIT_SEED = 0x5a;
/** Two of three shares, of one group, as MnemoCode splits. */
const THRESHOLD = 2;
const SHARE_COUNT = 3;

/**
 * The phrases that `unmasking` gives of `sets`, the masked set by default, joined, or the line
 * that refused them.
 */
async function unmasked(
  unmasking: ShareUnmasking,
  sets: readonly RepairedSet[] = [MASKED_SET],
): Promise<string> {
  // Unmasked without a signal: nothing stops it.
  const result = await unmasking.unmask(sets);
  if (result.kind === "dates") return result.message;
  if (result.kind === "stopped") return "stopped";
  return result.phrases
    .map((phrase) => [phrase.mnemonic, phrase.dates].filter(Boolean).join(" at "))
    .join("; ");
}

/**
 * Every check: the set's own phrase without Seedshift, the public phrase from the masked one with
 * the whole date, the search of a forgotten digit that the host's master fingerprint decides, and
 * five dates refused for a phrase of twelve words; with the host's SSKR library, marked shares of
 * the masked phrase repaired together and unmasked with the forgotten digit.
 */
export async function checkShareUnmasking(
  fingerprint: PhraseFingerprint,
  platform?: SharePlatform,
): Promise<void> {
  expectSame(
    await unmasked(new ShareUnmasking({ mode: "direct" })),
    MASKED_SET.mnemonic,
    "Shares without Seedshift",
  );
  const wholeDate = DatesAnswer.parse(MASKED_DATE, { patterns: false });
  expectSame(
    await unmasked(new ShareUnmasking({ mode: "seedshift", dates: wholeDate })),
    PUBLIC_MNEMONIC,
    "Shares unmasked with their date",
  );
  // The masked phrase's date with its last digit forgotten, which the wallet tells.
  const forgottenDigit = new ShareUnmasking({
    mode: "seedshift",
    dates: DatesAnswer.parse("23-09-202?", { patterns: true }),
    walletCheck: fingerprintWalletCheck(fingerprint, PUBLIC_FINGERPRINT),
  });
  expectSame(
    await unmasked(forgottenDigit),
    `${PUBLIC_MNEMONIC} at ${MASKED_DATE}`,
    "Shares unmasked with a forgotten digit",
  );
  const fiveDates = DatesAnswer.parse(FIVE_DATES, { patterns: false });
  expectSame(
    await unmasked(new ShareUnmasking({ mode: "seedshift", dates: fiveDates })),
    "12-word phrases support at most 4 dates.",
    "Shares unmasked with five dates",
  );
  if (platform === undefined) return;
  const sets = await repairedMaskedShares(platform);
  expectSame(sets.length, 1, "Marked shares of the masked phrase: phrases");
  expectSame(
    await unmasked(forgottenDigit, sets),
    `${PUBLIC_MNEMONIC} at ${MASKED_DATE}`,
    "Marked shares unmasked with a forgotten digit",
  );
}

/**
 * Shares of the masked phrase, made here by the host's SSKR library, two of them in colors with
 * one color unread on each, and repaired together: the sets they restore.
 */
async function repairedMaskedShares(platform: SharePlatform): Promise<RepairedSet[]> {
  const entropy = mnemonicToEntropy(MASKED_SET.mnemonic, wordlist);
  const seed = new Uint8Array(SEED_BYTES).fill(TEST_SPLIT_SEED);
  const shares = await platform.createShares(entropy, THRESHOLD, SHARE_COUNT, seed);
  // The second color of the first share, the fifth of the second: no color twice.
  const marked = shares.slice(0, THRESHOLD).map((share, place) => {
    const colors = writeShare(share, "colors").split(" ");
    colors[place === 0 ? 1 : 4] = "?";
    return colors.join(" ");
  });
  const plan = await new JointRepair(platform).plan(marked);
  // Searched without a signal: nothing stops it.
  return (await searchOnce(plan)).sets;
}

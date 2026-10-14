// The self-test of how a typed backup is read before its dates (core/backup-reading.ts,
// core/missing-codes.ts): codes marked with ? where they cannot be read, a whole code or one digit
// of it, and the candidates that the BIP39 checksum leaves; a Shamir share told from the codes of a
// phrase, also with marks; and, with the host's master fingerprint, the encoded fingerprint and the
// search that it decides. core/self-test.ts runs the quick part before every command of the command
// line and all of it in the full self-test.
//
// From the host it needs, for the full check only, the master fingerprint of a phrase. It holds
// public test data, no secret.
//
// Host-neutral: it imports only other core modules, and through them the share forms.

import { sskrVector } from "../sskr/known-answers.js";
import { BackupReading } from "./backup-reading.js";
import { EncodedBackup } from "./encoded-backup.js";
import { MissingCodes } from "./missing-codes.js";
import { expectRefused, expectSame } from "./self-test-check.js";
import type { PhraseFingerprint } from "./wallet-check.js";
import { REPRESENTATION_ANSWERS } from "./representations-self-test.js";
import { textPieces } from "./pieces.js";
import { UNICODE_CODE_DIGITS } from "./code-text.js";
import { assertWordCount } from "./bip39-sizes.js";
import { defined } from "./defined.js";

/**
 * The public phrase masked with MnemoCode Seedshift and 23-09-2026 (vectors/mnemocode-v1.json,
 * checksum-valid-seedshift-12), in English words, word numbers and colors.
 */
const MASKED_ENGLISH = "wool abuse actual wool abuse actual wool abuse actual wool abuse congress";
const MASKED_NUMBERS = "2027 10 24 2027 10 24 2027 10 24 2027 10 377";
const MASKED_COLORS = "#0317CC #200B38 #4020CC #5D1438 #7D29CC #9A1D38 #BA32CC #D72799";
/**
 * The master fingerprint of the masked phrase, the encoded fingerprint that Encode shows: computed
 * independently with Python's hashlib and a plain secp256k1, which first reproduce the published
 * keys of BIP84 and BIP86.
 */
const ENCODED_FINGERPRINT = "0d05289e";

/** A marked backup, and what its marks leave, counted independently with Python's hashlib. */
interface MarkedCase {
  readonly text: string;
  readonly format: "indexes" | "unicode" | "colors";
  /** The combinations of codes that the marks allow. */
  readonly combinations: number;
  /** The combinations that keep the BIP39 checksum. */
  readonly candidates: number;
  /** Where the right codes come among them, counted from 1. */
  readonly right: number;
}

/** A ? for one digit of a word number at place 2 and one at place 12: 10 numbers each. */
const MARKED_DIGITS: MarkedCase = {
  text: "2027 1? 24 2027 10 24 2027 10 24 2027 10 3?7",
  format: "indexes",
  combinations: 100,
  candidates: 4,
  right: 2,
};
/** A ? for one digit of a Unicode code at place 5, which two codes fit, and a whole code at 12. */
const MARKED_UNICODE: MarkedCase = {
  text: "8F44 9019 5011 8F44 9?19 5011 8F44 9019 5011 8F44 9019 ?",
  format: "unicode",
  combinations: 4_096,
  candidates: 256,
  right: 24,
};
/** The first color unread: any word fits place 1, and 21 word numbers place 2. */
const MARKED_COLOR: MarkedCase = {
  text: MASKED_COLORS.replace("#0317CC", "?"),
  format: "colors",
  combinations: 43_008,
  candidates: 2_655,
  right: 2_627,
};
/** The first share of the official BCR-2020-011 grouped vector (sskr/known-answers.ts). */
const SHARE_COLORS = sskrVector.firstShareColors.join(" ");
const SHARE_NUMBERS = sskrVector.firstShareNumbers;
const SHARE_READER = "the share reader";

/** The masked phrase's word numbers, counted from 1, as BIP39 indexes from 0. */
const MASKED_INDEXES = MASKED_NUMBERS.split(" ").map((number) => Number(number) - 1);

/** `text`, codes separated by spaces, with those at `places` (counted from 1) marked with ?. */
function withMarks(text: string, places: readonly number[]): string {
  return text
    .split(" ")
    .map((code, index) => (places.includes(index + 1) ? "?" : code))
    .join(" ");
}

/**
 * The candidates of `marked` with Seedshift's checksum: their count, and where the right codes
 * come among them.
 */
function checkMarked(marked: MarkedCase): void {
  const codes = MissingCodes.read(marked.text, marked.format, "seedshift");
  expectSame(codes.combinations, marked.combinations, `Marked ${marked.format} combinations`);
  let count = 0;
  let right = 0;
  for (const candidate of codes.candidates()) {
    count += 1;
    if (right === 0 && candidate.join(" ") === MASKED_INDEXES.join(" ")) right = count;
  }
  expectSame(count, marked.candidates, `Marked ${marked.format} candidates`);
  expectSame(right, marked.right, `Marked ${marked.format} right codes`);
}

/**
 * The quick known answers: marked word numbers and Unicode codes with their candidates, which
 * codes without Seedshift keep as well and the Original Seedshift, without a checksum of its own,
 * does not narrow; the marks refused; and a share told from the codes of a phrase.
 */
export function checkBackupReadingStartup(): void {
  const answer = defined(REPRESENTATION_ANSWERS[0]);
  const words = answer.words;
  assertWordCount(words);
  const codes = textPieces(answer.forms["colors-unicode"], UNICODE_CODE_DIGITS);
  codes[codes.length - 1] = "?";
  for (const text of [
    codes.join(" "),
    codes.map((code) => (code === "?" ? code : String.fromCodePoint(parseInt(code, 16)))).join(""),
  ])
    expectSame(
      BackupReading.of(`MNC1:direct:colors-unicode:${text}`, {
        words,
        seedshiftOnly: false,
        shareReader: SHARE_READER,
      }).marked,
      true,
      "Color Unicode mark with a declared word count",
    );
  checkMarked(MARKED_DIGITS);
  checkMarked(MARKED_UNICODE);
  expectSame(
    MissingCodes.formats(MARKED_DIGITS.text).join(" "),
    "indexes",
    "Forms of marked word numbers",
  );
  const unchecked = MissingCodes.read(MARKED_DIGITS.text, "indexes", "seedshift-legacy");
  expectSame(unchecked.expected, MARKED_DIGITS.combinations, "Original Seedshift candidates");
  // Codes without Seedshift are the phrase itself, whose checksum holds them as Seedshift's does.
  expectSame(
    [...MissingCodes.read(MARKED_DIGITS.text, "indexes", "direct").candidates()].length,
    MARKED_DIGITS.candidates,
    "Candidates without Seedshift",
  );
  expectRefused(
    () => MissingCodes.read(MASKED_COLORS.replace("#200B38", "#200B3?"), "colors", "seedshift"),
    /one \? in place of the whole color/u,
    "A color with a digit marked",
  );
  expectRefused(
    () => MissingCodes.read(MASKED_NUMBERS, "indexes", "seedshift"),
    /No code is marked/u,
    "Codes without a mark",
  );
  expectRefused(
    () => MissingCodes.read(MASKED_NUMBERS.replace("377", "2049"), "indexes", "seedshift"),
    /no number from 1 through 2048/u,
    "A word number of 2049",
  );
  expectSame(BackupReading.shareKind(SHARE_COLORS), "share", "A share in place of the codes");
  expectSame(
    BackupReading.shareKind(SHARE_COLORS.replace("#7C4D62", "?")),
    "share",
    "A marked share in place of the codes",
  );
  // 21 word numbers are a share or the codes of a 21-word phrase. Two numbers unread are 22 bits,
  // which the share's checksum settles; three are 33, more than its 32 bits, so either may fit.
  expectSame(
    BackupReading.shareKind(withMarks(SHARE_NUMBERS, [2, 6])),
    "share",
    "A share in word numbers with two marks",
  );
  expectSame(
    BackupReading.shareKind(withMarks(SHARE_NUMBERS, [2, 6, 10])),
    "either",
    "A share in word numbers with three marks",
  );
  expectSame(BackupReading.shareKind(MASKED_ENGLISH), undefined, "The codes of a phrase");
  expectSame(BackupReading.shareKind(MARKED_DIGITS.text), undefined, "Marked codes of a phrase");
  expectRefused(
    () => BackupReading.of(SHARE_COLORS, { seedshiftOnly: false, shareReader: SHARE_READER }),
    /This is a Shamir share/u,
    "A share given as an encoded phrase",
  );
}

/**
 * Every check: the quick ones; the candidates of an unread color; and, with the host's master
 * fingerprint, the encoded fingerprint of the masked phrase and the search of marked codes that it
 * decides, which keeps exactly the codes written.
 */
export async function checkBackupReading(fingerprint: PhraseFingerprint): Promise<void> {
  checkBackupReadingStartup();
  checkMarked(MARKED_COLOR);
  expectSame(
    await EncodedBackup.read(MASKED_ENGLISH, "english", "seedshift").fingerprint(fingerprint),
    ENCODED_FINGERPRINT,
    "Encoded fingerprint",
  );
  const result = await MissingCodes.read(MARKED_DIGITS.text, "indexes", "seedshift").run({
    check: async (codes) =>
      (await EncodedBackup.of(codes, "indexes", "seedshift").fingerprint(fingerprint)) ===
      ENCODED_FINGERPRINT,
  });
  expectSame(result.count, MARKED_DIGITS.candidates, "Marked codes checked");
  expectSame(result.passed, 1, "Marked codes with the encoded fingerprint");
  expectSame(result.found[0]?.text(), MASKED_NUMBERS, "Marked codes found");
}

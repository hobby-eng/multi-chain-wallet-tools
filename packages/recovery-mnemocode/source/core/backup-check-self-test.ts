// The self-test of the check of a backup written down (core/backup-check.ts): the published
// Seedshift vector typed again, found right, and with a wrong date or a wrong word found wrong at
// its place; and, with the host's SSKR library, shares of a published set found right, also with a
// color unread, and shares of another set or with a wrong color found wrong. The codes need
// nothing that answers later, so core/self-test.ts runs their check before every command too; the
// shares, which the SSKR library restores, in the full self-test.
//
// From the host it needs, for the shares only, its SharePlatform (sskr/share-platform.ts). It
// holds public test data, no secret.
//
// Host-neutral: it imports only core modules, the share modules and their known answers.

import type { SharePlatform } from "../sskr/share-platform.js";
import { sskrSetVector } from "../sskr/known-answers.js";
import { EncodedBackupCheck, ShareBackupCheck, type BackupResult } from "./backup-check.js";
import { parseDate } from "./dates.js";
import { expectSame } from "./self-test-check.js";

const PUBLIC_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
/**
 * The public phrase masked with MnemoCode Seedshift and 23-09-2026 (vectors/mnemocode-v1.json,
 * checksum-valid-seedshift-12), in English words and word numbers counted from 1.
 */
const MASKED_ENGLISH = "wool abuse actual wool abuse actual wool abuse actual wool abuse congress";
const MASKED_NUMBERS = [2027, 10, 24, 2027, 10, 24, 2027, 10, 24, 2027, 10, 377] as const;
const MASKED_DATE = "23-09-2026";
/**
 * Two shares of another set of vectors/sskr-v1.json, "bip39-160-2-of-3": they restore the phrase
 * of the entropy 000102…13, not that of the set checked.
 */
const OTHER_SET =
  "ur:sskr/hdcfemjzaeadaentleykkitkwlptsskispvwbkbwjnamsttssnpmhpgwmoetcm; ur:sskr/hdcfemjzaeadadfdsfbbvospcheycndschfhcmkelyvavefzfewezsinfdtbfz";
/** How a host names its reader of an encoded seed phrase, for a phrase typed among shares. */
const DECODE_ENTRY = "Decode";

/** A result as one line: its verdict, and the part and places of its finding. */
function verdictOf(result: BackupResult): string {
  const finding = result.finding;
  return finding === undefined
    ? result.verdict
    : `${result.verdict} ${finding.part} ${finding.places.join(",")}`.trim();
}

/**
 * The published Seedshift vector typed again: right, with a wrong date, and with a wrong word. The
 * quick known answer that runs before every command.
 */
export function checkBackupCheckStartup(): void {
  const check = new EncodedBackupCheck({
    mnemonic: PUBLIC_MNEMONIC,
    format: "english",
    mode: "seedshift",
    codes: MASKED_NUMBERS.map((number) => number - 1),
    dates: [parseDate(MASKED_DATE)],
  });
  const right = check.checkNow({ backup: MASKED_ENGLISH, dates: MASKED_DATE });
  expectSame(verdictOf(right), "restores", "Backup check of the Seedshift vector");
  const wrongDate = check.checkNow({ backup: MASKED_ENGLISH, dates: "24-09-2026" });
  expectSame(verdictOf(wrongDate), "differs dates 1", "Backup check with a wrong date");
  const wrongWord = check.checkNow({
    backup: MASKED_ENGLISH.replace("actual", "wool"),
    dates: MASKED_DATE,
  });
  expectSame(verdictOf(wrongWord), "differs codes 3", "Backup check with a wrong word");
}

/**
 * Shares of the published set typed again: two of them right, one with a color unread right too,
 * two of another set wrong, and one with a wrong color unreadable at its place.
 */
async function checkShareBackup(platform: SharePlatform): Promise<void> {
  const check = new ShareBackupCheck(
    { mnemonic: sskrSetVector.phrase, mode: "direct", threshold: 2 },
    platform,
    { decodeEntry: DECODE_ENTRY },
  );
  const [first, , third] = sskrSetVector.shares;
  const [firstColors, secondColors] = sskrSetVector.colors;
  const cases: readonly (readonly [string, string, string])[] = [
    [`${first}; ${third}`, "restores", "Share check of the set"],
    [`${firstColors.replace("#0CF800", "?")}; ${secondColors}`, "restores", "Marked share check"],
    [OTHER_SET, "differs shares", "Share check of another set"],
    [
      `${firstColors.replace("#0CF800", "#0CF801")}; ${secondColors}`,
      "unreadable shares 1",
      "Share check with a wrong color",
    ],
  ];
  for (const [backup, verdict, name] of cases)
    expectSame(verdictOf(await check.check({ backup })), verdict, name);
}

/** Every check: the encoded backup, and with the host's SSKR library the shares. */
export async function checkBackupCheck(platform?: SharePlatform): Promise<void> {
  checkBackupCheckStartup();
  if (platform !== undefined) await checkShareBackup(platform);
}

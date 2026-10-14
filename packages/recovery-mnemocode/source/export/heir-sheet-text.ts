// The words of the optional sheet for heirs (README "Instructions for heirs"): what the backup is,
// what is needed to restore it, the steps, and the basics for someone who has never used a wallet,
// with room for a hint written by hand. It never names anything that would help whoever finds it:
// no codes, no dates, no fingerprint (it would let a finder test guessed dates) and no places where
// shares are kept (listing them all on one sheet would undo the point of splitting the backup). It
// prints at most one address, the route's, whose page leads to the guide for heirs (docs/HEIRS.md).
// Nothing else is linked: the sheet may be kept for decades, and a page elsewhere can change,
// vanish, or pass to someone who abuses its address.
//
// Needs from the host: a HeirRoute, the way through its own program to the seed phrase, with the
// line that names that program under the title: the command line leads through its start menu
// (src/cli/heir-sheet.ts), a page through its tabs.
// Does not: lay out the sheet (export/heir-sheet.ts renders these words in A5 or A6) or save it.

import { assertWordCount, WORD_NUMBERS, type Bip39WordCount } from "../core/bip39-sizes.js";
import { EncodedForm } from "../core/encoded-form.js";
import { Masking, type HeirSheetMode, type SplitMode } from "../core/masking.js";
import {
  isRecordedQuorum,
  MAX_GROUP_MEMBERS,
  MIN_RECORDED_THRESHOLD,
} from "../sskr/share-layout.js";
import { parseShareFormat, shareFormatHasCards, type ShareFormat } from "../sskr/transport.js";
import type { HeirSheetSection, HeirSheetText } from "./heir-sheet.js";
import type { EncodedFormat } from "../core/types.js";
import { defined } from "../core/defined.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.heir-sheet-text", {
  "sheet-heirs-threshold-from-number-shares-at-most": (value0: string, value1: string) =>
    `A sheet for heirs needs a threshold from ${value0} to the number of shares, and at most ${value1} shares.`,
  "sheet-heirs-whole-number-codes-each-share": () =>
    "A sheet for heirs needs a whole number of codes for each share.",
  "sheet-heirs-made-encoded-backup-shamir-shares": () =>
    "A sheet for heirs is made for an encoded backup or for Shamir shares.",
  "sheet-heirs-whole-number-dates": () => "A sheet for heirs needs a whole number of dates.",
  "sheet-heirs-may-print-route-s-address-once": () =>
    "The sheet for heirs may print the route's address once and no other.",
});

/** How the seed phrase was masked: a mode for which a sheet can be made (Masking). */
export type HeirMode = HeirSheetMode;

/** How shares may have been masked before the split: a heir-sheet mode in which shares are made. */
export type HeirShareMode = Extract<HeirSheetMode, SplitMode>;

/**
 * What was made: the seed phrase of `words` words in one encoded form, or Shamir shares of it, each
 * of `codes` codes on its cards where its form has cards. The sheet says how many codes are the
 * backup, as printed cards end with decoys that belong to nothing (owner, 2026-10-13).
 */
export type HeirBackup =
  | { readonly kind: "encoded"; readonly format: EncodedFormat; readonly words: Bip39WordCount }
  | {
      readonly kind: "shares";
      readonly format: ShareFormat;
      readonly threshold: number;
      readonly count: number;
      /** The codes of one share on its cards, before the decoys; where its form has cards. */
      readonly codes?: number;
    };

/**
 * What the sheet for heirs says of a backup: its form, its mode and how many dates mask the phrase.
 */
export interface HeirSheetFacts {
  readonly backup: HeirBackup;
  readonly mode: HeirMode;
  /** How many dates mask the seed phrase; none in direct mode. */
  readonly dates: number;
}

/**
 * The way through one program from a computer one trusts to the seed phrase on its screen. The
 * sheet adds what every program shares: what is needed, the last step into a wallet program, the
 * advice when a step fails, and the basics.
 */
export interface HeirRoute {
  /** The line under the title: which program made the sheet, such as its name and version. */
  readonly subtitle: string;
  /** The one web address that the sheet prints, once, in the `start` steps (if it has steps). */
  readonly address: string;
  /** The steps that get the program and start it offline. */
  readonly start: readonly string[];
  /**
   * The steps that open the restore of an encoded backup of `words` words made in `mode` and type
   * it, then `dates` (such as "the secret date as day-month-year (23-09-2026)") unless it was not
   * masked.
   */
  decode(mode: HeirMode, words: Bip39WordCount, dates: string | undefined): readonly string[];
  /** The steps that open the restore from shares and type `threshold` of them, then `dates`. */
  restore(mode: HeirShareMode, threshold: number, dates: string | undefined): readonly string[];
  /** What to do when a digit of a date cannot be read, or undefined where nothing searches it. */
  readonly dateDigitHelp: string | undefined;
}

/** How the color forms look, the same for codes and for shares. */
const COLORS_LOOK = "color codes such as #1EAB91, on paper or on printed cards";
const COLOR_CODES_LOOK = "codes of digits and letters A to F that stand for colors";

/** How each encoded form looks, so that an heir recognises the backup. */
const ENCODED_LOOKS: Readonly<Record<EncodedFormat, string>> = {
  english: "English words that look like a seed phrase but are masked",
  indexes: `numbers from ${WORD_NUMBERS}, one per word`,
  unicode: "codes of four digits and letters A to F, one per word",
  colors: COLORS_LOOK,
  "colors-unicode": COLOR_CODES_LOOK,
};

/** How each share format looks. */
const SHARE_LOOKS: Readonly<Record<ShareFormat, string>> = {
  words: "words such as tuna next keep gyro",
  // UR shares have no MnemoCode cards; do not promise the older Bytewords card conversion.
  ur: "codes that start with ur:sskr/",
  indexes: `numbers from ${WORD_NUMBERS}`,
  unicode: "codes of four digits and letters A to F",
  colors: COLORS_LOOK,
  "colors-unicode": COLOR_CODES_LOOK,
};

/** The last step, whatever the program. */
const OPEN_WALLET = "Open the wallet with this seed phrase in a wallet program (see below).";

/**
 * Web addresses, to find any that a route would print besides its own: with http:// or https://,
 * with www., or a host name with a domain ending, such as example.org/heirs, with or without a
 * path. An address of another form, such as a project name, is told only by being the route's.
 */
const WEB_ADDRESS =
  /\b(?:https?:\/\/|www\.)[^\s,"]+|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}\b(?:\/[^\s,"]*)?/u;

/**
 * `address` where it stands whole: followed by the end, white space, a comma, a quote, or a
 * punctuation mark that ends a sentence; undefined for a route without an address.
 */
function wholeAddress(address: string): RegExp | undefined {
  if (address === "") return undefined;
  const escaped = address.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`${escaped}(?=$|[\\s,"]|[.;:!?)](?:\\s|$))`, "gu");
}

/** What printed cards end with: decoys, which the sheet tells apart by their count. */
const DECOYS_AFTER = "the cards after them belong to nothing";

/** The line that says how many codes of printed cards are the backup, or none without cards. */
function printedCodesLine(backup: HeirBackup): string[] {
  if (backup.kind === "shares")
    return backup.codes !== undefined && shareFormatHasCards(backup.format)
      ? [`On printed cards each share is the first ${backup.codes} codes; ${DECOYS_AFTER}.`]
      : [];
  const form = EncodedForm.of(backup.format);
  const words = `The seed phrase has ${backup.words} words.`;
  if (form.cardKind === undefined) return [words];
  const codes = form.elementCount(backup.words);
  return [`${words} On printed cards its backup is the first ${codes} codes; ${DECOYS_AFTER}.`];
}

function needs({ backup, mode, dates }: HeirSheetFacts): string[] {
  const lines =
    backup.kind === "shares"
      ? [
          `Any ${backup.threshold} of the ${backup.count} Shamir shares, written as ${SHARE_LOOKS[backup.format]}.`,
        ]
      : !Masking.of(mode).masked && backup.format === "english"
        ? [`The seed phrase itself: ${backup.words} English words, not masked.`]
        : [`The backup: ${ENCODED_LOOKS[backup.format]}.`, ...printedCodesLine(backup)];
  if (backup.kind === "shares") lines.push(...printedCodesLine(backup));
  lines.push(
    !Masking.of(mode).masked
      ? "No secret dates are needed."
      : dates === 1
        ? "The owner's secret date (see the back). It is written nowhere; the hint may lead to it."
        : `The owner's ${dates} secret dates (see the back). They are written nowhere; the hint may lead to them.`,
  );
  return lines;
}

function hintNote({ mode, dates }: HeirSheetFacts): string {
  if (!Masking.of(mode).masked)
    return "Write by hand what only your heirs will understand, such as a clue to a BIP39 passphrase if you used one.";
  const what = dates === 1 ? "the date" : "the dates";
  const example = dates === 1 ? '"the day we met"' : '"the day we met and our son\'s birthday"';
  const never = dates === 1 ? "Never the date itself." : "Never the dates themselves.";
  return `Write by hand a clue to ${what} that only your heirs will understand, such as ${example}. ${never}`;
}

/** The back: what someone who has never used a wallet needs to know first. */
function basics({ mode }: HeirSheetFacts): HeirSheetSection[] {
  const masking = Masking.of(mode);
  const sections: HeirSheetSection[] = [
    {
      heading: "Seed phrase",
      paragraphs: [
        "Cryptocurrency is recorded on a public ledger, not at a bank. Whoever knows the seed phrase of a wallet, 12 to 24 English words from the BIP39 list, can spend what it holds; any BIP39 wallet program opens it.",
      ],
    },
  ];
  if (masking.masked)
    sections.push({
      heading: "Secret dates",
      paragraphs: [
        // The example is the one of the README (How checksum-valid Seedshift works).
        `The owner masked the words with secret dates, such as birthdays: their year, month and day shift the words along the BIP39 list (with 23-09-2026, "abandon" becomes "wool"). Use the owner's dates to undo the shift. ${defined(masking.wrongDateWarning)} The dates have nothing to do with today's date.`,
      ],
    });
  sections.push(
    {
      heading: "Opening the wallet",
      paragraphs: [
        'Install a well-known wallet program from its own website, choose "Restore" (not "Create") and type the seed phrase. Wallet empty? Check the dates, try the program the owner used, or look for a BIP39 passphrase, an extra word that MnemoCode does not keep. Then move everything to a new wallet of your own.',
      ],
    },
    {
      heading: "Scams",
      paragraphs: [
        "Nobody honest asks for a seed phrase; whoever has it can take everything for good. For help, ask someone you trust to sit beside you, and keep the words in your own hands.",
      ],
    },
  );
  return sections;
}

/** Refuses shares of which `threshold` of `count` could not restore anything (isRecordedQuorum). */
function assertQuorum(threshold: number, count: number): void {
  if (!isRecordedQuorum(threshold, count))
    throw ERRORS.create("sheet-heirs-threshold-from-number-shares-at-most", [
      `${MIN_RECORDED_THRESHOLD}`,
      `${MAX_GROUP_MEMBERS}`,
    ]);
}

/**
 * Refuses a backup that the sheet cannot name truthfully: another kind, a form that the encoded
 * forms (EncodedForm.of) or the share forms (parseShareFormat) refuse, or an impossible quorum. A
 * host may pass anything at run time (AUD-014-API012).
 */
function assertBackup(backup: HeirBackup): void {
  switch (backup?.kind) {
    case "encoded":
      EncodedForm.of(backup.format);
      assertWordCount(backup.words);
      return;
    case "shares":
      parseShareFormat(backup.format);
      assertQuorum(backup.threshold, backup.count);
      if (backup.codes !== undefined && (!Number.isSafeInteger(backup.codes) || backup.codes < 1))
        throw ERRORS.create("sheet-heirs-whole-number-codes-each-share", []);
      return;
    default:
      throw ERRORS.create("sheet-heirs-made-encoded-backup-shamir-shares", []);
  }
}

/**
 * Refuses facts that would print a wrong sheet: a mode without one, a backup it cannot name
 * (assertBackup), or a count of dates that does not fit the mode.
 */
function assertFacts({ backup, mode, dates }: HeirSheetFacts): void {
  Masking.assertHeirSheetMode(mode);
  assertBackup(backup);
  if (backup.kind === "shares") Masking.assertSplitMode(mode);
  if (!Number.isSafeInteger(dates) || dates < 0)
    throw ERRORS.create("sheet-heirs-whole-number-dates", []);
  Masking.of(mode).assertDateCount(dates);
}

/** Every line of `text`, in the order it is printed. */
function linesOf(text: HeirSheetText): string[] {
  return [
    text.title,
    text.subtitle,
    text.footer,
    text.newcomer,
    text.needsHeading,
    ...text.needs,
    text.hintHeading,
    text.hintNote,
    text.stepsTitle,
    ...text.steps,
    text.troubleHeading,
    text.trouble,
    text.warning,
    text.basicsTitle,
    ...text.basics.flatMap((section) => [section.heading, ...section.paragraphs]),
  ];
}

/** The title of the back of the sheet, which the front points to. */
const STEPS_TITLE = "Steps";
/** The title of the part for newcomers, which the front points to. */
const BASICS_TITLE = "The basics";

/**
 * The words of the sheet for heirs, for the program that `route` leads through. A class, so that a
 * host binds its route once and every sheet keeps the promise of the header: the route's address
 * is printed at most once, and no other.
 */
export class HeirInstructions {
  readonly #route: HeirRoute;

  constructor(route: HeirRoute) {
    this.#route = route;
  }

  /** The words of the sheet for `facts`, ready for renderHeirSheet (export/heir-sheet.ts). */
  text(facts: HeirSheetFacts): HeirSheetText {
    assertFacts(facts);
    const text: HeirSheetText = {
      title: "How to restore this wallet backup",
      subtitle: this.#route.subtitle,
      newcomer: `The ${STEPS_TITLE.toLowerCase()} are on the back. New to wallets? Read "${BASICS_TITLE}" there first.`,
      needsHeading: "What you need",
      needs: needs(facts),
      hintHeading: "Hint from the owner",
      hintNote: hintNote(facts),
      stepsTitle: STEPS_TITLE,
      steps: this.#steps(facts),
      troubleHeading: "If something goes wrong",
      trouble: this.#trouble(facts),
      warning: `Never type the backup${!Masking.of(facts.mode).masked ? "" : ", the dates"} or the seed phrase into a website or send them to anyone.`,
      footer: "This sheet holds no secret. Keep it apart from the backup.",
      basicsTitle: BASICS_TITLE,
      basics: basics(facts),
    };
    // The seed phrase itself in English words needs no program, and so no address.
    // The route's own address, counted where it stands whole, then any other left beside it: a
    // longer address that starts with it, such as its releases page, is another address.
    const sheet = linesOf(text).join("\n");
    const own = wholeAddress(this.#route.address);
    const printed = own === undefined ? 0 : [...sheet.matchAll(own)].length;
    const rest = own === undefined ? sheet : sheet.replace(own, " ");
    if (printed > 1 || WEB_ADDRESS.test(rest))
      throw ERRORS.create("sheet-heirs-may-print-route-s-address-once", []);
    return text;
  }

  #steps({ backup, mode, dates }: HeirSheetFacts): string[] {
    // The seed phrase itself needs no program at all.
    if (backup.kind === "encoded" && backup.format === "english" && !Masking.of(mode).masked)
      return [OPEN_WALLET];
    // As the programs ask for them: day-month-year, as datesPrompt and the share prompt do.
    const typedDates = !Masking.of(mode).masked
      ? undefined
      : `the secret ${dates === 1 ? "date" : "dates"} as day-month-year (23-09-2026)`;
    const route = this.#route;
    // assertFacts refused shares of the Original Seedshift.
    const open =
      backup.kind === "shares"
        ? route.restore(mode as HeirShareMode, backup.threshold, typedDates)
        : route.decode(mode, backup.words, typedDates);
    return [...route.start, ...open, OPEN_WALLET];
  }

  #trouble({ backup, mode }: HeirSheetFacts): string {
    const advice = [
      "An error usually means a mistyped code or word: check each one against the paper.",
    ];
    // Unreadable elements of a share are filled in from its checksum (src/sskr/repair.ts).
    if (backup.kind === "shares") advice.push("Type ? for each code you cannot read.");
    const help = this.#route.dateDigitHelp;
    if (Masking.of(mode).masked && help !== undefined) advice.push(help);
    return advice.join(" ");
  }
}

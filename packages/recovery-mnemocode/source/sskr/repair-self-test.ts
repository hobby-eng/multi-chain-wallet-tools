// The self-test of the repair of damaged Shamir shares (sskr/repair.ts, sskr/joint-repair.ts,
// sskr/share-set.ts): elements marked with ?, a whole color or code, or one digit of it (also of a
// Color Unicode code), filled in
// from the checksum of one share; the marks that are refused; and, with the host's SSKR library,
// shares repaired together, also one of which nothing could be read. core/self-test.ts runs the
// quick part before every command of the command line and all of it in the full self-test.
//
// From the host it needs, for the full check only, its SharePlatform (sskr/share-platform.ts). It
// holds public test data, no secret.
//
// Host-neutral: it imports only other host-neutral sskr modules and core/self-test-check.ts.

import { expectRefused, expectRefusedLater, expectSame } from "../core/self-test-check.js";
import { JointRepair, searchOnce } from "./joint-repair.js";
import { sskrSetVector, sskrVector } from "./known-answers.js";
import { MAX_MARKED_ELEMENTS, readRepairableShare } from "./repair.js";
import { colorsToUnicode } from "../core/colors.js";
import { UNICODE_CODE_DIGITS } from "../core/code-text.js";
import { textPieces } from "../core/pieces.js";
import { ShareSet } from "./share-set.js";
import type { SharePlatform } from "./share-platform.js";
import { defined } from "../core/defined.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("sskr.repair-self-test", {
  "share-self-test-marks-element-lacks": () => "A share self-test marks an element it lacks.",
});

/** The first share of the official vector in colors, Unicode codes and word numbers. */
const OFFICIAL_COLORS = sskrVector.firstShareColors.join(" ");
/** The same share's colors as Color Unicode codes, four digits each (core/colors.ts). */
const OFFICIAL_COLOR_CODES = textPieces(
  colorsToUnicode(sskrVector.firstShareColors),
  UNICODE_CODE_DIGITS,
);
const OFFICIAL_UNICODE = sskrVector.firstShareUnicode;
const OFFICIAL_NUMBERS = sskrVector.firstShareNumbers;
const { shares: SET_SHARES, colors: SET_COLORS, phrase: SET_PHRASE } = sskrSetVector;

/** `text` with the element written `element` marked as `mark`. */
function marked(text: string, element: string, mark = "?"): string {
  if (!text.includes(element)) throw ERRORS.create("share-self-test-marks-element-lacks", []);
  return text.replace(element, mark);
}

/** Checks that `text` is repaired into `ur`, its marked elements filled in as `filled` says. */
function checkRepair(text: string, ur: string, filled: string, name: string): void {
  const repaired = readRepairableShare(text);
  expectSame(repaired.ur, ur, `${name} share`);
  expectSame(
    repaired.filled.map((element) => `${element.position}:${element.value}`).join(" "),
    filled,
    `${name} filled elements`,
  );
}

/**
 * The quick known answers: the first share of the set vector repaired from a whole color unread
 * before a trailing decoy card; the official first share repaired from a whole color and two
 * digits of another unread, from a whole Unicode code and one digit of another, and from a digit
 * in each of two Color Unicode codes; and the shares refused, with an unmarked error, too many
 * marks, or a ? for a digit of a word number.
 */
export function checkShareRepairStartup(): void {
  checkRepair(
    `${marked(defined(SET_COLORS[0]), "#1F9121")} #000000`,
    defined(SET_SHARES[0]),
    "6:#1F9121",
    "Marked share before a trailing decoy",
  );
  const official = sskrVector.shares[0];
  checkRepair(
    marked(marked(OFFICIAL_COLORS, "#EE44D3"), "#E75FF8", "#E7?FF?"),
    official,
    "4:#EE44D3 6:#E75FF8",
    "Colors with a whole color and two digits marked",
  );
  checkRepair(
    marked(marked(OFFICIAL_UNICODE, "7642", "7?42"), "77FD"),
    official,
    "6:7642 12:77FD",
    "Unicode codes with a digit and a whole code marked",
  );
  // A digit of the low code of the second color and the first digit of the high code of the
  // sixth, written apart: each color is filled in as its two codes.
  const codes = OFFICIAL_COLOR_CODES;
  const digits = codes.map((code, place) =>
    place === 3
      ? `${code.slice(0, 2)}?${code.slice(3)}`
      : place === 10
        ? `?${code.slice(1)}`
        : code,
  );
  checkRepair(
    digits.join(" "),
    official,
    `2:${codes[2]}${codes[3]} 6:${codes[10]}${codes[11]}`,
    "Color Unicode codes with two digits marked",
  );
  expectRefused(
    () => readRepairableShare(marked(marked(OFFICIAL_COLORS, "#42D1F0"), "#0981D6", "#0981D7")),
    /No valid share fits/u,
    "A marked share with an unmarked error",
  );
  const sevenUnread = sskrVector.firstShareColors.map((color, place) =>
    place < MAX_MARKED_ELEMENTS + 1 ? "?" : color,
  );
  expectRefused(
    () => readRepairableShare(sevenUnread.join(" ")),
    /at most 6 unreadable elements/u,
    "A share with seven marks",
  );
  expectRefused(
    () => readRepairableShare(marked(OFFICIAL_NUMBERS, "288", "2?8")),
    /lone \? for a whole word number/u,
    "A ? for a digit of a word number",
  );
}

/**
 * Every check: the quick ones, and with the host's SSKR library a set repaired together, two
 * colors unread on one share and a digit on the other, which restores the phrase of the vector;
 * then the third share, of which nothing was read, found from the other two.
 */
export async function checkShareRepair(platform: SharePlatform): Promise<void> {
  checkShareRepairStartup();
  const repair = new JointRepair(platform);
  const records = [
    marked(marked(SET_COLORS[0], "#0CF800"), "#4FD8A1"),
    marked(SET_COLORS[1], "#E8135A", "#E81?5A"),
  ];
  const plan = await repair.plan(records);
  // Searched without a signal: nothing stops it.
  const { sets: found } = await searchOnce(plan);
  expectSame(found.length, 1, "Shares repaired together: phrases");
  expectSame(defined(found[0]).mnemonic, SET_PHRASE, "Shares repaired together: phrase");
  expectSame(
    defined(found[0])
      .shares.map((share) => share.ur)
      .join(" "),
    `${SET_SHARES[0]} ${SET_SHARES[1]}`,
    "Shares repaired together: shares",
  );
  const unread = SET_COLORS[0]
    .split(" ")
    .map(() => "?")
    .join(" ");
  const set = await ShareSet.combine([SET_SHARES[1], SET_SHARES[2], unread], platform);
  expectSame(set.mnemonic, SET_PHRASE, "A share of which nothing was read: phrase");
  expectSame(set.shares[2]?.ur, SET_SHARES[0], "A share of which nothing was read: share");
  // A marked share with an unmarked error too is refused, not repaired into another share.
  await expectRefusedLater(
    () =>
      ShareSet.combine(
        [marked(marked(SET_COLORS[0], "#0CF800"), "#1F9121", "#1F9122"), SET_COLORS[1]],
        platform,
      ),
    /Share 1 cannot be read as a share/u,
    "Shares with an unmarked error",
  );
}

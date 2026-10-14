// The way through the Deriver that MnemoCode's sheet for heirs prints: where to get the page, and
// its tabs, fields and buttons by their names. It is made from the build's facts, so that each
// edition names its own release repository. No DOM: the heirs section passes BUILD_INFO.
import type { BUILD_INFO } from "@ckd/build-info";
import type { HeirRoute } from "@ckd/recovery-backup/mnemocode-heirs.js";
import { MNEMOCODE_MODE_HELP } from "./recovery-mnemocode-help.js";

/** The facts of the build that the route names. */
export type HeirRouteBuild = Pick<typeof BUILD_INFO, "version" | "edition" | "releaseRepository">;

/**
 * The Decode tab's modes as its selector names them, without the "·" between the two parts, which
 * the sheet's font does not hold.
 */
function decodeModeLabel(mode: Parameters<HeirRoute["decode"]>[0]): string {
  return `"${MNEMOCODE_MODE_HELP[mode].title.replaceAll(" · ", ", ")}"`;
}

/** The Decode tab's question for the words of the phrase, as its label reads (index.html). */
export const DECODE_WORDS_QUESTION = "How many words does the seed phrase have?";

/** ", then `dates`" after what is typed, or nothing when no dates are asked. */
function thenDates(dates: string | undefined): string {
  return dates === undefined ? "" : `, then ${dates}`;
}

/**
 * The way through this page, as an heir finds it. The repository is named as owner/name, without
 * a web address, which an offline page does not hold.
 */
export function deriverHeirRoute(build: HeirRouteBuild): HeirRoute {
  return {
    subtitle: `Made with the Wallet Key Derivation Tool ${build.version}, ${build.edition}, free and offline.`,
    address: build.releaseRepository,
    start: [
      `On a computer you trust, find ${build.releaseRepository} on GitHub, download the Wallet Key Derivation Tool of the ${build.edition} from its Releases, and check it as its README says.`,
      "Go offline, then open the downloaded file in a web browser.",
    ],
    decode(mode, words, dates) {
      return [
        `Open "Recover & Back Up", then "MnemoCode" and its "Decode" tab. As the transformation mode choose ${decodeModeLabel(mode)}, and to "${DECODE_WORDS_QUESTION}" choose "${words} words".`,
        `Type the backup${thenDates(dates)}, and press "Restore phrase". The page shows the seed phrase.`,
      ];
    },
    restore(mode, threshold, dates) {
      return [
        `Open "Recover & Back Up", then "MnemoCode" and its "Restore" tab. To "Was Seedshift used before it was split?" answer "${mode === "direct" ? "No" : "Yes"}".`,
        `Type any ${threshold} shares, one per line${thenDates(dates)}, and press "Restore phrase". The page shows the seed phrase.`,
      ];
    },
    dateDigitHelp:
      'If a digit of a date is unclear, MnemoCode\'s "Forgotten" tab tries every possibility.',
  };
}

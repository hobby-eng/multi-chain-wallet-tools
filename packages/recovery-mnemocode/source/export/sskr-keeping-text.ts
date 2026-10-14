// What saved share cards are kept with: how many of the shares restore what, and where each share
// is in what was saved. The command line and a page say it alike, each adding its own words about
// the file it saved.
//
// Host-neutral and without PDF: it imports only the words of the core (masking.ts) and the share
// forms (transport.ts), which read the set's own threshold from the shares.

import { PHRASE_WORDS } from "../core/masking.js";
import { Share } from "../sskr/transport.js";
import { counted } from "../core/search-plan.js";

/** How the cards or records of the shares were saved. */
export type ShareCardPackaging =
  /** One file that holds every share, such as a collection PDF or a file of records. */
  | "file"
  /** One folder that holds every share, such as the page images of a collection. */
  | "folder"
  /** One file for each share. */
  | "files"
  /** One folder of separate cards for each share. */
  | "folders"
  /** Numbered page images for each share. */
  | "pages";

/** Where each share is in what was saved, by how it was saved. */
const LAYOUTS: Readonly<Record<ShareCardPackaging, string>> = Object.freeze({
  file: "the file holds every share",
  folder: "the folder holds every share",
  files: "each file is one share",
  folders: "each folder is one share and needs all its cards",
  pages: "the numbered pages of each share belong together",
});

/**
 * What the shares of a Seedshift split restore, in MnemoCode's words (PHRASE_WORDS): only the
 * decoy, so such shares are never called enough for recovery without the dates.
 */
const MASKED_GOAL = `to restore ${PHRASE_WORDS.masked}, which the owner's dates turn back into ${PHRASE_WORDS.original}`;

/**
 * How many of `records`, UR records of one set, restore the phrase: read from the shares, whose
 * threshold and groups they carry. Cards may print fewer shares than restore, such as one share
 * printed again, and a set may have several groups.
 */
function quorum(records: readonly string[], masked: boolean): string {
  const goal = masked ? MASKED_GOAL : "for recovery";
  const { info } = Share.read(records[0]!);
  if (info.groupCount > 1)
    return `These shares belong to ${info.groupCount} groups, each needing enough of its own ${goal}`;
  const threshold = info.memberThreshold;
  const count = records.length;
  if (count < threshold) return `These shares are fewer than the ${threshold} needed ${goal}`;
  if (threshold === 1) return `Any single share is enough ${goal}`;
  if (threshold === count) return `All ${counted(count, "share")} are needed ${goal}`;
  return `Any ${threshold} of the ${counted(count, "share")} are enough ${goal}`;
}

/**
 * How the shares saved as `packaging` are kept: how many restore what (Seedshift `masked` the
 * phrase before the split, or not), and where each share is; one sentence or two.
 */
export function shareKeepingNote(
  records: readonly string[],
  packaging: ShareCardPackaging,
  masked: boolean,
): string {
  if (records.length === 0) throw new Error("There are no shares to keep.");
  return `${quorum(records, masked)}; ${LAYOUTS[packaging]}. Store the shares apart.`;
}

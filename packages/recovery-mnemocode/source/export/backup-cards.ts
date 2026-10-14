// The content of the cards of an encoded backup: its colours, or its Unicode codes in colours that
// decorate them. Every way of saving the cards (a PDF, page images, separate card files, the dry
// run of Encode, the sample cards, a page) builds it here, so that each draws the same backup.
//
// Host-neutral: it imports only the core, card-settings.ts and card-palette.ts. A backup is
// taken by its shape (CardBackup), which EncodedBackup has, so that this module needs no backup
// class and the renderers do not reach it.

import { indexesToColors } from "../core/colors.js";
import { EncodedForm } from "../core/encoded-form.js";
import { codeColors } from "./card-palette.js";
import type { EncodedFormat } from "../core/types.js";
import type { CardSettings } from "./card-settings.js";

/** What cards are drawn from: codes in their form, such as an EncodedBackup. */
export interface CardBackup {
  readonly format: EncodedFormat;
  /** The codes as BIP39 indexes from 0 to 2047. */
  readonly indexes: readonly number[];
  /** The codes written in their form, which a QR code on the cards holds. */
  text(): string;
}

/** What the cards print besides the codes. */
export interface CardDetails {
  /** The page, the profile and the texts of the cards. */
  readonly settings?: CardSettings | undefined;
  /** The title of the sheet, where a design shows one. */
  readonly title?: string | undefined;
}

/**
 * The content of the cards of a seed phrase: the colour of each card, the codes printed in place
 * of the colours where those only decorate the cards (Unicode codes), the codes that its QR code
 * holds, and how many of the last cards are decoys (card-decoys.ts). Every card template draws
 * it (templates.ts); defined here, beside the one function that builds it, so that this module
 * needs no renderer.
 */
export type CardContent = CardSettings & {
  readonly kind: "colors";
  readonly colors: readonly string[];
  readonly labels?: readonly string[];
  readonly payload: string;
  readonly title?: string;
  /** How many of the last cards are decoys; undefined until a plan adds them (card-plan.ts). */
  readonly decoys?: number;
};

/**
 * The content of the cards of `backup` with `details.settings`: its colours, or its Unicode codes
 * in the colours that decorate them (codeColors), without decoys yet (card-plan.ts). Refuses a
 * form that no card prints (EncodedForm cardKind).
 */
export function backupCardContent(backup: CardBackup, details: CardDetails = {}): CardContent {
  const form = EncodedForm.of(backup.format);
  const kind = form.cardKind;
  if (kind === undefined) throw new Error(`No card prints codes written as ${backup.format}.`);
  const codes = form.cardCodes(backup.indexes);
  return Object.freeze({
    ...details.settings,
    kind,
    colors: Object.freeze(
      codes === undefined ? indexesToColors(backup.indexes) : codeColors(codes),
    ),
    ...(codes === undefined ? {} : { labels: Object.freeze(codes) }),
    payload: backup.text(),
    ...(details.title === undefined ? {} : { title: details.title }),
  });
}

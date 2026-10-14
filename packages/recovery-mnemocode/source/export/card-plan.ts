// The decoys of a set of cards and the way its sheet is turned, planned once for the design that
// draws them (owner, 2026-10-13): a sheet holds the backup's codes and at least one decoy in full
// rows, with the largest cards that its page allows (planCollectionSheet); separate cards take as
// many decoys as the design's sheet of the usual size. Every export of cards plans through it, so
// that a PDF, its page images and its separate card files of one export show the same cards.
//
// Needs from the host: its CardRenderer, for the font and the photographs that a sheet is laid out
// with, the QR matrix of a sheet's code and the random decoys.

import { ownCards, withDecoyPool, keptCards, type WithDecoys } from "./card-decoys.js";
import { collectionPayload, planCollectionSheet, type SheetShape } from "./collection-sheet.js";
import { SHEET_PAGE_SIZE, type CardPageSize, type CardSettings } from "./card-settings.js";
import type { ColorCards } from "./card-content.js";
import type { UniformChoice } from "./platform.js";
import type { CardDrawing } from "./templates.js";

/** The shape of a design's sheet of `pageSize` for some cards (CardTemplate sheetShape). */
export type SheetShaper = (
  drawing: CardDrawing,
  cards: ColorCards,
  pageSize: CardPageSize,
) => Promise<SheetShape>;

/**
 * `cards` with their decoys, drawn with `random`, and for a sheet the orientation of its plan
 * where none was given: planned on the sheet that `shaper`'s design draws them on, or for
 * `separate` cards on that design's sheet of the usual size, without a QR code, which separate
 * cards never carry. Cards that have their decoys already are returned as they are.
 */
export async function withPlannedDecoys<T extends ColorCards>(
  shaper: SheetShaper,
  drawing: CardDrawing,
  cards: T,
  separate: boolean,
  random: UniformChoice = drawing.randomInt,
): Promise<WithDecoys<T>> {
  // Checked as every count of decoys is (assertDecoys), before the cards are used as they are.
  if (cards.decoys !== undefined) {
    ownCards(cards);
    return cards as WithDecoys<T>;
  }
  const pool = withDecoyPool(cards, random);
  const pageSize = separate ? SHEET_PAGE_SIZE : (cards.pageSize ?? SHEET_PAGE_SIZE);
  // The key is left out where no orientation is given: a host compiled with
  // exactOptionalPropertyTypes refuses an optional property given as undefined.
  const sheet: Pick<CardSettings, "pageSize" | "orientation"> =
    separate || cards.orientation === undefined
      ? { pageSize }
      : { pageSize, orientation: cards.orientation };
  const shape = await shaper(drawing, pool, pageSize);
  const payload = separate ? undefined : collectionPayload(pool);
  const plan = planCollectionSheet(
    sheet,
    ownCards(cards),
    pool.colors.length,
    shape,
    payload === undefined ? undefined : drawing.qrModules(payload),
  );
  const kept = keptCards(pool, plan.count);
  // A spread of a generic loses its type in TypeScript; the cards are kept's, turned.
  return separate ? kept : ({ ...kept, orientation: plan.orientation } as WithDecoys<T>);
}

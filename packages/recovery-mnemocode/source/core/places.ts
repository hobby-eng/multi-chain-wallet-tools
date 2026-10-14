// How the messages of the library name places: the dates, codes or shares at places counted from
// 1 among those typed, so that a message points to what is wrong without repeating it. A small
// helper that the parts share; it needs nothing from the host.

/** Items in words, the last joined with `last`: "2", "1 and 2", "12, 15 or 18"; none for none. */
export function listInWords(items: readonly (string | number)[], last = "and"): string {
  return items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} ${last} ${items.at(-1)!}`;
}

/** The places with what is at them, as the subject of a message: "Date 2", "Dates 1 and 2". */
export function placesNamed(noun: string, places: readonly number[]): string {
  return `${noun}${places.length === 1 ? "" : "s"} ${placesInWords(places)}`;
}

/** Places in words: "2", "1 and 2", "1, 2 and 3"; none for no place. */
export function placesInWords(places: readonly number[]): string {
  return listInWords(places);
}

/**
 * The place among those typed of the share counted `share` from 1, by `places`; the share's own
 * number where no place is given. Every refusal, report and export of shares names them through
 * it, so that a share is named where it was typed however many were left out before it.
 */
export function placeOf(places: readonly number[] | undefined, share: number): number {
  return places?.[share - 1] ?? share;
}

// The carrier files of the Photo or MP3 tab, read only after MnemoCode has admitted their sizes
// (checkStegoFileSizes), so that no file too large for the page's memory is read at all.
import { mnemocode } from "@ckd/recovery-backup/mnemocode-engine.js";
import type { StegoCarrier } from "@ckd/recovery-backup/mnemocode-stego.js";

/** A set holds at most this many files, as MnemoCode's threshold sets do. */
export const MOST_STEGO_FILES = 16;

/**
 * The bytes of `files`, read one after the other, `status` saying so; undefined where `current`
 * stops holding meanwhile.
 */
export async function readStegoCarriers(
  files: readonly File[],
  status: HTMLElement,
  current: () => boolean,
): Promise<StegoCarrier[] | undefined> {
  if (files.length > MOST_STEGO_FILES)
    throw new Error(`Choose at most ${MOST_STEGO_FILES} files here.`);
  mnemocode().checkStegoFileSizes(Float64Array.from(files, (file) => file.size));
  status.textContent = "Reading the files…";
  const carriers: StegoCarrier[] = [];
  for (const file of files) {
    carriers.push({
      bytes: new Uint8Array(await file.arrayBuffer()),
      name: file.name,
      type: file.type === "" ? "application/octet-stream" : file.type,
    });
    if (!current()) return undefined;
  }
  return carriers;
}

import { zipSync } from "fflate";

/** Fixed ZIP metadata avoids retaining an export's wall-clock time. */
const ARCHIVE_TIME = new Date(1980, 0, 1, 0, 0, 0);

/** Packs admitted entry names into owned archive bytes and always clears owned input buffers. */
export class ZipArchive {
  /** Callers admit names and transfer entry ownership; returned bytes belong to the caller. */
  static pack(this: void, entries: Record<string, Uint8Array>): Uint8Array {
    try {
      return zipSync(entries, { level: 0, mtime: ARCHIVE_TIME });
    } finally {
      for (const entry of Object.values(entries)) entry.fill(0);
    }
  }
}

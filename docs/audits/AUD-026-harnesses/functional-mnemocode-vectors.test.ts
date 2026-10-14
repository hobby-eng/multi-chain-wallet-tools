// AUD-026 functional: every published MnemoCode vector (the MnemoCode repository's
// vectors/mnemocode-v1.json, read from the sibling checkout, not the vendored copy) through the
// Deriver's own glue (packages/recovery-backup/src/mnemocode.ts): encode in every representation,
// decode the raw payload with the vector's mode and dates, and decode its MNC1 record. The
// fingerprints are checked with the page's masterFingerprintFromSeed.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { masterFingerprintFromSeed, mnemonicToSeed } from "@ckd/core/bip39.js";
import {
  decodeMnemoCode,
  encodeMnemoCode,
  parseMnemoCodeDates,
  type MnemoCodeFormat,
  type MnemoCodeMode,
} from "@ckd/recovery-backup/mnemocode.js";

const VECTORS = JSON.parse(
  readFileSync(new URL("../../../../mnemocode/vectors/mnemocode-v1.json", import.meta.url), "utf8"),
) as {
  vectors: (Record<string, string> & { name: string; mode: MnemoCodeMode; dates: string[] })[];
};
const FIELDS: [string, MnemoCodeFormat][] = [
  ["english", "english"],
  ["indexes", "indexes"],
  ["unicode", "unicode"],
  ["colors", "colors"],
  ["colorsUnicode", "colors-unicode"],
];

describe("AUD-026 MnemoCode published vectors through the Deriver glue", () => {
  it("has the seven published vectors", () => expect(VECTORS.vectors.length).toBe(7));
  for (const vector of VECTORS.vectors)
    it(vector.name, () => {
      const dates = parseMnemoCodeDates(vector.dates.join(" "));
      for (const [field, format] of FIELDS) {
        const encoded = encodeMnemoCode(vector.sourceMnemonic!, vector.mode, format, dates);
        expect(encoded.payload, `${field} payload`).toBe(vector[field]);
        const raw = decodeMnemoCode(vector[field]!, { mode: vector.mode, format, dates });
        expect(raw.mnemonic, `${field} raw decode`).toBe(vector.sourceMnemonic);
        const fromRecord = decodeMnemoCode(encoded.record, {
          mode: "direct",
          format: "auto",
          dates,
        });
        expect(fromRecord.mnemonic, `${field} record decode`).toBe(vector.sourceMnemonic);
      }
      if (vector.sourceFingerprint !== undefined) {
        expect(masterFingerprintFromSeed(mnemonicToSeed(vector.sourceMnemonic!))).toBe(
          vector.sourceFingerprint,
        );
        expect(masterFingerprintFromSeed(mnemonicToSeed(vector.english!))).toBe(
          vector.encodedFingerprint,
        );
      }
      // A wrong date must not give the source phrase back (dates are the masking secret).
      if (vector.dates.length > 0) {
        const wrong = parseMnemoCodeDates(
          vector.dates.map((date, i) => (i === 0 ? date.replace(/^\d\d/u, "01") : date)).join(" "),
        );
        if (wrong[0] !== undefined && vector.dates[0]!.slice(0, 2) !== "01") {
          const decoded = decodeMnemoCode(vector.english!, {
            mode: vector.mode,
            format: "english",
            dates: wrong,
          });
          expect(decoded.mnemonic ?? decoded.candidates?.join("|")).not.toBe(vector.sourceMnemonic);
        }
      }
    });
});

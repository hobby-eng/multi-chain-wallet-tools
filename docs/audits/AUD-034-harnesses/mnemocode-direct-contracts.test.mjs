// Actual imported helper/public host wrapper, fixed public vector; no PDF, KDF or WASM work.
import { expect, it } from "vitest";
import { WordTable } from "../../../packages/recovery-mnemocode/source/core/word-table.ts";
import { sskrSetVector } from "../../../packages/recovery-mnemocode/source/sskr/known-answers.ts";
import { mnemoCodeCardSavedNote } from "../../../packages/recovery-backup/src/mnemocode-cards.ts";

it.each(["\uD800", "\uDC00"])("refuses a lone surrogate in the reexported scalar helper (%j)", (text) => {
  expect(WordTable.unicodeHex("的")).toBe("7684");
  expect(WordTable.unicodeHex("😀")).toBe("1F600");
  // The host reexports this exact class; its UI uses only fixed dictionary characters.
  expect(() => WordTable.unicodeHex(text)).toThrow();
});

it("counts distinct members in the public saved-card note", () => {
  const file = { fileName: "public.pdf", mimeType: "application/pdf", bytes: new Uint8Array(), cards: 2, printed: { name: "Public", company: "Synthetic", studio: "Audit" }, shares: { records: sskrSetVector.shares.slice(0, 2), fragmented: false, masked: false } };
  expect(mnemoCodeCardSavedNote(file)).toContain("All 2 shares are needed");
  file.shares.records = [sskrSetVector.shares[0], sskrSetVector.shares[0]];
  // Normal validated card creation rejects duplicates; this is the directly exported note API.
  expect(mnemoCodeCardSavedNote(file)).not.toContain("All 2 shares are needed");
});

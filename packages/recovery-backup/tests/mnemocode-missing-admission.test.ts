import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupReading } from "../../recovery-mnemocode/source/core/backup-reading.js";
import { EncodedForm } from "../../recovery-mnemocode/source/core/encoded-form.js";
import type { MissingCodes } from "../../recovery-mnemocode/source/core/missing-codes.js";
import { MissingCodesSearch } from "../../recovery-mnemocode/source/core/missing-codes-search.js";
import {
  ENCODED_FORMATS,
  MNEMOCODE_PHRASE_WORD_COUNTS,
  type MnemoCodeFormat,
  type MnemoCodePhraseWords,
} from "../src/mnemocode.js";
import { MnemoCodeSearches } from "../src/mnemocode-search.js";

const DECLARED_WORDS = MNEMOCODE_PHRASE_WORD_COUNTS[0]!;
// Synthetic all-zero word indexes test admission, not checksum validity or wallet derivation.
const SYNTHETIC_INDEXES = Array<number>(DECLARED_WORDS).fill(0);
const ADMITTED = new Error("Synthetic stop after missing-code admission.");
const signal = new AbortController().signal;
let admittedCodes: MissingCodes | undefined;

/** Mark one code without duplicating a representation's splitting or decoy-trimming rules. */
function markedText(format: MnemoCodeFormat): string {
  const form = EncodedForm.of(format);
  const text = form.codes(SYNTHETIC_INDEXES);
  const units = form.apartCodes(text) ?? text.split(" ");
  units[units.length - 1] = "?";
  return units.join(" ");
}

function admit(text: string, format: MnemoCodeFormat, words?: MnemoCodePhraseWords) {
  const searches = new MnemoCodeSearches(
    {
      checkFor: () => {
        throw new Error("Admission must not start a wallet comparison.");
      },
    },
    () => {
      throw new Error("Admission must not compute a fingerprint.");
    },
  );
  return searches.missingCodes(
    {
      text,
      format,
      mode: "direct",
      way: "wallet",
      ...(words === undefined ? {} : { words }),
    },
    () => undefined,
    signal,
  );
}

describe("MnemoCode missing-code phrase-length admission", () => {
  beforeEach(() => {
    admittedCodes = undefined;
    // Exercise the real wrapper and reader; stop before planning or enumerating candidates.
    vi.spyOn(MissingCodesSearch.prototype, "fits").mockImplementation(function (
      this: MissingCodesSearch,
    ) {
      admittedCodes = this.codes;
      throw ADMITTED;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(ENCODED_FORMATS)("keeps the declared length and ? before %s decoys", async (format) => {
    const reader = vi.spyOn(BackupReading, "of");
    const decoys = EncodedForm.of(format).codes(SYNTHETIC_INDEXES);
    const text = `${markedText(format)} ${decoys}`;

    await expect(admit(text, format, DECLARED_WORDS)).rejects.toBe(ADMITTED);

    expect(reader).toHaveBeenCalledWith(text, expect.objectContaining({ words: DECLARED_WORDS }));
    expect(admittedCodes?.wordCount).toBe(DECLARED_WORDS);
    expect(admittedCodes?.missingPlaces).toContain(DECLARED_WORDS);
    expect(admittedCodes?.format).toBe(format);
    expect(admittedCodes?.mode).toBe("direct");
  });

  it.each(ENCODED_FORMATS)("still admits %s controls without a declared length", async (format) => {
    await expect(admit(markedText(format), format)).rejects.toBe(ADMITTED);
    expect(admittedCodes?.wordCount).toBe(DECLARED_WORDS);
    expect(admittedCodes?.missingPlaces).toContain(DECLARED_WORDS);
  });

  it("reads every typed code when the count is omitted", async () => {
    const reader = vi.spyOn(BackupReading, "of");
    const nextLength = MNEMOCODE_PHRASE_WORD_COUNTS[1]!;
    const decoys = Array<string>(nextLength - DECLARED_WORDS)
      .fill("abandon")
      .join(" ");
    const text = `${markedText("english")} ${decoys}`;

    await expect(admit(text, "english")).rejects.toBe(ADMITTED);

    expect(reader.mock.calls[0]![1]).not.toHaveProperty("words");
    expect(admittedCodes?.wordCount).toBe(nextLength);
    expect(admittedCodes?.missingPlaces).toEqual([DECLARED_WORDS]);
  });

  it("leaves an invalid declared length to the existing reader", async () => {
    const invalidLength = (DECLARED_WORDS + 1) as MnemoCodePhraseWords;
    await expect(admit(markedText("indexes"), "indexes", invalidLength)).rejects.toThrow(
      "word indexes",
    );
    expect(admittedCodes).toBeUndefined();
  });

  it("does not invent a length for an invalid unbounded input", async () => {
    await expect(admit(`${markedText("indexes")} 1`, "indexes")).rejects.toThrow("a seed phrase");
    expect(admittedCodes).toBeUndefined();
  });

  it("does not pad input that is shorter than its declared phrase length", async () => {
    const text = `${"1 ".repeat(DECLARED_WORDS - 2)}?`;
    await expect(admit(text, "indexes", DECLARED_WORDS)).rejects.toThrow("a seed phrase");
    expect(admittedCodes).toBeUndefined();
  });
});

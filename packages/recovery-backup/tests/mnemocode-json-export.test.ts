import { describe, expect, it } from "vitest";
import { encodeMnemoCode, parseMnemoCodeDates } from "../src/mnemocode.js";
import publicVectors from "../../recovery-mnemocode/source/vectors/mnemocode-v1.json";

// Public BIP39 all-zero entropy and MnemoCode's published 23-09-2026 date-shift example.
const PHRASE = `${"abandon ".repeat(11)}about`;

describe("the host's shared JSON representation export", () => {
  it("keeps the library's exact direct word numbers and exposes no source-phrase field", () => {
    const value = JSON.parse(encodeMnemoCode(PHRASE, "direct", "unicode").json);
    expect(value.indexes).toEqual([...Array<number>(11).fill(1), 4]);
    expect(value.english).toEqual(PHRASE.split(" "));
    expect(value.dates).toEqual([]);
    expect(value).not.toHaveProperty("sourceMnemonic");
  });

  it("exports the published masked codes with explicitly included dates and shifts", () => {
    const value = JSON.parse(
      encodeMnemoCode(PHRASE, "seedshift", "colors", parseMnemoCodeDates("23-09-2026")).json,
    );
    expect(value.indexes).toEqual([2027, 10, 24, 2027, 10, 24, 2027, 10, 24, 2027, 10, 377]);
    expect(value.dates).toEqual(["23-09-2026"]);
    expect(value.shifts).toBeDefined();
    const published = publicVectors.vectors.find(
      (vector) => vector.name === "checksum-valid-seedshift-12",
    )!;
    expect(published).toBeDefined();
    expect(value.unicodeCodePoints).toBe(published.unicode);
    expect(value.english.join(" ")).not.toBe(PHRASE);
  });
});

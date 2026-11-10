import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { nfkd, NFKD_UNICODE_VERSION } from "../src/unicode-nfkd.js";

// Unicode 18.0.0's own test data (test/fixtures/unicode18), the same that MHFE's core checks.
const ROOT = resolve(import.meta.dirname, "../../..");
const TEST_SHA256 = "25a50d816764b04abfb4a646d3eb2b2a803284c3873d9a06757b94fe4513dde3";

/** The lines of NormalizationTest.txt as five strings each, with their part. */
function normalizationTests(): { part: string; columns: string[] }[] {
  const bytes = gunzipSync(
    readFileSync(resolve(ROOT, "test/fixtures/unicode18/NormalizationTest.txt.gz")),
  );
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(TEST_SHA256);
  const rows: { part: string; columns: string[] }[] = [];
  let part = "";
  for (const line of bytes.toString("utf8").split("\n")) {
    if (line.startsWith("@")) part = line.split(" ")[0] ?? "";
    if (line === "" || line.startsWith("#") || line.startsWith("@")) continue;
    const columns = line
      .split(";")
      .slice(0, 5)
      .map((column) =>
        String.fromCodePoint(
          ...column
            .trim()
            .split(" ")
            .map((code) => Number.parseInt(code, 16)),
        ),
      );
    rows.push({ part, columns });
  }
  return rows;
}

describe("the Deriver's NFKD of Unicode 18.0.0", () => {
  const rows = normalizationTests();

  it("passes every line of NormalizationTest.txt: c5 is the NFKD of c1 to c5", () => {
    expect(NFKD_UNICODE_VERSION).toBe("18.0.0");
    expect(rows.length).toBeGreaterThan(20_000);
    const failed = rows.filter(({ columns }) =>
      columns.some((column) => nfkd(column) !== columns[4]),
    );
    expect(failed.slice(0, 5)).toEqual([]);
  });

  it("leaves every code point that Part 1 does not list as it is", () => {
    const listed = new Set(
      rows.filter(({ part }) => part === "@Part1").map(({ columns }) => columns[0]!.codePointAt(0)),
    );
    const changed: number[] = [];
    for (let point = 0; point <= 0x10ffff; point += 1) {
      if (point >= 0xd800 && point <= 0xdfff) continue;
      if (listed.has(point)) continue;
      const character = String.fromCodePoint(point);
      if (nfkd(character) !== character) changed.push(point);
    }
    expect(changed).toEqual([]);
  });

  it("normalizes what Unicode 18.0.0 newly assigned, whatever the runtime knows", () => {
    // MHFE's specification names U+209D, which Unicode 18.0.0 normalizes to ASCII w.
    expect(nfkd("₝")).toBe("w");
    expect(nfkd("ＴＲＥＺＯＲ")).toBe("TREZOR");
    expect(nfkd("한")).toBe("한");
    // Combining marks in canonical order, stably.
    expect(nfkd("ą́")).toBe("ą́");
    // A lone surrogate and an unassigned code point stay.
    expect(nfkd("\ud800x\u{10fffe}")).toBe("\ud800x\u{10fffe}");
  });
});

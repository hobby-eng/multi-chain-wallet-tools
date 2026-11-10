import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NFKD_MODULE, nfkdModule, nfkdTables, UNICODE_VERSION } from "./generate-unicode-nfkd.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

describe("the Deriver's NFKD tables", () => {
  it("are what the generator writes from UnicodeData.txt of Unicode 18.0.0", () => {
    expect(UNICODE_VERSION).toBe("18.0.0");
    expect(readFileSync(resolve(ROOT, NFKD_MODULE), "utf8")).toBe(nfkdModule(ROOT));
  });

  it("drop the compatibility tag and join one class's neighbours into a range", () => {
    const tables = nfkdTables(
      [
        "00A0;NO-BREAK SPACE;Zs;0;CS;<noBreak> 0020;;;;N;NON-BREAKING SPACE;;;;",
        "00C0;LATIN CAPITAL LETTER A WITH GRAVE;Lu;0;L;0041 0300;;;;N;;;;00E0;",
        "0300;COMBINING GRAVE ACCENT;Mn;230;NSM;;;;;N;;;;;",
        "0301;COMBINING ACUTE ACCENT;Mn;230;NSM;;;;;N;;;;;",
        "0316;COMBINING GRAVE ACCENT BELOW;Mn;220;NSM;;;;;N;;;;;",
        "",
      ].join("\n"),
    );
    expect(tables.decompositions).toEqual(["00A0>0020", "00C0>0041 0300"]);
    expect(tables.classes).toEqual(["0300-0301:230", "0316:220"]);
  });
});

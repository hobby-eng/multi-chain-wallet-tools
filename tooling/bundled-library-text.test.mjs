import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLED_LIBRARY_TEXT, rewriteBundledLibraryText } from "./bundled-library-text.mjs";

const require = createRequire(import.meta.url);
const packageFile = (name, path) => resolve(dirname(require.resolve(`${name}/package.json`)), path);

describe("bundled library text", () => {
  it("rewrites the reviewed strings of the pinned PDF libraries exactly once", () => {
    const files = [
      packageFile("pdf-lib", "es/api/PDFDocument.js"),
      packageFile("@pdf-lib/fontkit", "dist/fontkit.es.js"),
    ];
    expect(
      files.map((path) => BUNDLED_LIBRARY_TEXT.filter(({ file }) => file.test(path)).length),
    ).toEqual([1, 1]);
    for (const path of files) {
      const rule = BUNDLED_LIBRARY_TEXT.find(({ file }) => file.test(path));
      const rewritten = rewriteBundledLibraryText(path, readFileSync(path, "utf8"));
      for (const [from, to] of rule.replacements) {
        expect(rewritten.includes(from), from).toBe(false);
        expect(rewritten.includes(to), to).toBe(true);
        expect(/https?:/u.test(to), to).toBe(false);
      }
    }
  });

  it("stops when the reviewed text changed and leaves other files alone", () => {
    expect(() =>
      rewriteBundledLibraryText("/x/node_modules/pdf-lib/es/api/PDFDocument.js", "var a = 1;"),
    ).toThrow(/exactly one occurrence/u);
    expect(
      rewriteBundledLibraryText(
        "/x/node_modules/other/index.js",
        'var a = "https://example.invalid";',
      ),
    ).toBe('var a = "https://example.invalid";');
  });
});

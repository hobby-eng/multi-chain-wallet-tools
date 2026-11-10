// Each single-key coin's own modules, with everything they import, pass the Deriver's composition
// gate in a build of that coin alone: no other coin's module, and no shared module that only other
// coins need, is reached. This walks static imports as esbuild's metafile lists them for a build.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertKeyDerivationComposition } from "./key-derivation-composition.mjs";
import { SINGLE_KEY_COIN_IDS, singleKeyCoinModules } from "./single-key-coins.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { compilerOptions } = JSON.parse(readFileSync(resolve(ROOT, "tsconfig.json"), "utf8"));
/** The tsconfig path aliases with a trailing "/*", as prefixes. */
const ALIASES = Object.entries(compilerOptions.paths)
  .filter(([alias]) => alias.endsWith("/*"))
  .map(([alias, [target]]) => [alias.slice(0, -1), target.slice(0, -1)]);

/** Every repository module that `entries` reach through static imports. */
function importClosure(entries) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/\bfrom\s+"([^"]+)"/gu)) {
      const alias = ALIASES.find(([prefix]) => specifier.startsWith(prefix));
      const target = specifier.startsWith(".")
        ? resolve(dirname(file), specifier)
        : alias === undefined
          ? null
          : resolve(ROOT, alias[1] + specifier.slice(alias[0].length));
      const source = target?.replace(/\.js$/u, ".ts");
      if (source !== undefined && existsSync(source)) visit(source);
    }
  };
  for (const entry of entries) visit(resolve(ROOT, entry));
  return [...seen].map((path) => path.slice(ROOT.length));
}

describe("single-key coins in selective builds", () => {
  it.each(SINGLE_KEY_COIN_IDS)("%s alone reaches no other coin's module", (coin) => {
    const inputs = importClosure(Object.values(singleKeyCoinModules(coin)));
    const features = { coins: [coin], hasCoin: (selected) => selected === coin, has: () => false };
    expect(() => assertKeyDerivationComposition(features, inputs)).not.toThrow();
  });

  it("refuses a coin module that leaks into a build without its coin", () => {
    const inputs = importClosure([singleKeyCoinModules("tron").derivation]);
    const features = {
      coins: ["litecoin"],
      hasCoin: (coin) => coin === "litecoin",
      has: () => false,
    };
    expect(() => assertKeyDerivationComposition(features, inputs)).toThrow(/tron|keccak/u);
  });
});

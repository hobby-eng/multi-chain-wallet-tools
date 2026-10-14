// AUD-026 architecture harness: the @ckd module aliases are defined twice, in tsconfig.json
// (compilerOptions.paths, read by tsc and by esbuild for every HTML build) and in vitest.config.ts
// (resolve.alias, written out by hand for the unit tests). It lists the aliases each defines and
// those only one of them has, and which aliases any source file uses. Exits 1 when the two maps do
// not name the same @ckd aliases (the one-owner contract of AGENTS.md rule 6). Reads files only.
//
//   node docs/audits/AUD-026-harnesses/architecture-alias-maps.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8"));
const vitest = readFileSync(join(root, "vitest.config.ts"), "utf8");

// "@ckd/core/*" and "@ckd/editions" both become their alias name: "core", "editions".
const tsAliases = Object.keys(tsconfig.compilerOptions.paths)
  .map((alias) => /^@ckd\/([^/*]+)/u.exec(alias)?.[1])
  .filter(Boolean);
const vitestAliases = [
  ...[...vitest.matchAll(/find: \/\^@ckd\\\/([a-z0-9-]+)\\\//gu)].map((match) => match[1]),
  ...[...vitest.matchAll(/find: "@ckd\/([a-z0-9-]+)"/gu)].map((match) => match[1]),
];

function sources(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory())
      return ["node_modules", "dist", "generated", "test-results"].includes(entry.name)
        ? []
        : sources(path);
    return /\.(?:ts|mjs)$/u.test(entry.name) ? [path] : [];
  });
}
const used = new Set();
for (const path of ["apps", "packages", "tooling", "test"].flatMap(sources))
  for (const match of readFileSync(join(root, path), "utf8").matchAll(/["']@ckd\/([a-z0-9-]+)/gu))
    used.add(match[1]);

const onlyTsconfig = tsAliases.filter((alias) => !vitestAliases.includes(alias));
const onlyVitest = vitestAliases.filter((alias) => !tsAliases.includes(alias));
const report = {
  tsconfigAliases: tsAliases.length,
  vitestAliases: vitestAliases.length,
  onlyTsconfig,
  onlyVitest,
  definedButUnused: tsAliases.filter((alias) => !used.has(alias)),
  contractPassed: onlyTsconfig.length === 0 && onlyVitest.length === 0,
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.contractPassed ? 0 : 1;

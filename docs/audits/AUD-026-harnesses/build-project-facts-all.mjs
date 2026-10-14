// AUD-026 build reviewer: tooling/verify-project-facts.mjs stops at its first broken Markdown link,
// so a known broken link (AUD-024's report links to the removed mhfe-wallet-check.ts) hides every
// later check: other broken links, passport versions, loose lists, password fields and the release
// notes heading. This harness runs an in-memory copy of the unmodified gate in which only the link
// check collects instead of throwing, then reports every broken link and lets every later check
// run. The copy is written to the scratch folder given as the first argument; nothing in the
// repository changes. Exit 1 when any link is broken or any later check throws.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const scratch = resolve(process.argv[2] ?? resolve(root, "../tmp/wallet-tools/aud026/build"));
mkdirSync(scratch, { recursive: true });
const toolingUrl = pathToFileURL(resolve(root, "tooling")).href;
let source = readFileSync(resolve(root, "tooling/verify-project-facts.mjs"), "utf8");
const replace = (from, to) => {
  if (!source.includes(from)) throw new Error(`Gate text changed; cannot find: ${from}`);
  source = source.replace(from, to);
};
source = source.replaceAll('from "./', `from "${toolingUrl}/`);
replace(
  'const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");',
  `const root = ${JSON.stringify(root)};\nglobalThis.__brokenLinks = [];`,
);
replace(
  "throw new Error(`Broken relative Markdown link in ${path}: ${target}`);",
  "globalThis.__brokenLinks.push(`${path.slice(root.length + 1)} -> ${target}`);",
);
const copy = resolve(scratch, "build-verify-project-facts-collecting.mjs");
writeFileSync(copy, source);
let failure;
try {
  await import(pathToFileURL(copy).href);
} catch (error) {
  failure = error;
}
const broken = globalThis.__brokenLinks ?? [];
console.log(`Broken relative Markdown links: ${broken.length}`);
for (const line of broken) console.log(`  ${line}`);
if (failure !== undefined) console.log(`Later check failed: ${failure.message}`);
else console.log("Every check after the link check passed.");
if (broken.length > 0 || failure !== undefined) process.exitCode = 1;

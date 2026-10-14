// AUD-026 architecture harness: bounded probes of single-owner contracts (AGENTS.md, "Object-oriented
// design and no repetition") and of one front-end/library agreement. Each probe prints its result
// with `contractPassed`; the harness exits 1 when any contract fails, which here means a candidate
// finding was reproduced, not that the harness broke. Public test data only (BIP39 English words
// "zoo" and "abandon"); no secret, network, build output or product file is written. Source is
// bundled in memory with esbuild, as AUD-024's probes did.
//
//   node docs/audits/AUD-026-harnesses/architecture-contract-probes.mjs [output.json]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const output = process.argv[2];
const read = (path) => readFileSync(join(root, path), "utf8");
const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const results = [];

async function bundle(contents) {
  const bundled = await build({
    absWorkingDir: root,
    stdin: { contents, resolveDir: root, loader: "ts" },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "silent",
    tsconfig: join(root, "tsconfig.json"),
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
  );
}

function walk(directory, keep) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory())
      return ["node_modules", "generated", "tests", "dist"].includes(entry.name)
        ? []
        : walk(path, keep);
    return keep(path) ? [path] : [];
  });
}

// 1. The chosen-word field's own validity mark agrees with the generator that takes its value.
{
  const api = await bundle(`
    export { hasUnknownWords, wordsOf } from "./apps/key-derivation/src/ui/chosen-word-fields.ts";
    export { generateMnemonicWithChosenWords } from "./packages/crypto-core/src/bip39-chosen-words.ts";
  `);
  const cases = [];
  for (const typed of ["zoo", " Zoo ", "zoo,", "zoo;", "zoo zoo", "notaword"]) {
    const markedInvalid = api.hasUnknownWords(typed, true);
    let generatorRefuses = false;
    let refusal = null;
    try {
      // The chosen-word panel hands the raw field value to the generator (ChosenWordFields.chosen).
      await api.generateMnemonicWithChosenWords({
        wordCount: 12,
        chosen: [{ word: typed, position: "anywhere" }],
        neverUse: [],
      });
    } catch (cause) {
      generatorRefuses = true;
      refusal = String(cause.message);
    }
    cases.push({ typed, markedInvalid, generatorRefuses, refusal, agree: markedInvalid === generatorRefuses });
  }
  results.push({
    probe: "chosen-word-field-validity",
    owner: "packages/crypto-core/src/bip39-chosen-words.ts (wordIndex); page copy apps/key-derivation/src/ui/chosen-word-fields.ts (hasUnknownWords, wordsOf)",
    cases,
    contractPassed: cases.every((item) => item.agree),
  });
}

// 2. English lists of values are joined by one owner.
{
  const api = await bundle(`
    export { orList } from "./packages/crypto-core/src/listing.ts";
    export { listed } from "./apps/key-derivation/src/ui/recovery-mhfe-status.ts";
  `);
  const { formatEnglishList } = await import(join(root, "tooling/project-metadata.mjs"));
  const values = ["12", "15", "24"];
  const outputs = {
    "packages/crypto-core/src/listing.ts orList": api.orList(values),
    "apps/key-derivation/src/ui/recovery-mhfe-status.ts listed": api.listed(values),
    "tooling/project-metadata.mjs formatEnglishList": formatEnglishList(values),
  };
  const definitions = [];
  for (const path of [
    "packages/crypto-core/src/listing.ts",
    "apps/key-derivation/src/ui/recovery-mhfe-status.ts",
    "tooling/project-metadata.mjs",
  ]) {
    const text = read(path);
    for (const match of text.matchAll(/slice\(0, -1\)\.join\(", "\)/gu))
      definitions.push(`${path}:${lineOf(text, match.index)}`);
  }
  results.push({
    probe: "english-list-joining",
    outputs,
    definitions,
    contractPassed: definitions.length <= 1,
  });
}

// 3. Every production module that binds the vendored MHFE package is in its provenance record.
{
  const { LOCAL_IMPLEMENTATIONS } = await import(join(root, "tooling/verify-dependency-provenance.mjs"));
  const listed = new Set(
    LOCAL_IMPLEMENTATIONS.find(({ id }) => id === "mhfe-browser-module")?.files ?? [],
  );
  const binders = walk("apps", (path) => /\/src\/.*\.ts$/u.test(path)).filter((path) =>
    /from "@ckd\/recovery-mhfe-wasm\//u.test(read(path)),
  );
  const missing = binders.filter((path) => !listed.has(path));
  results.push({
    probe: "mhfe-provenance-coverage",
    rule: "tooling/verify-dependency-provenance.mjs mhfePanelFiles(): names starting with recovery-mhfe",
    binders: binders.length,
    missing,
    contractPassed: missing.length === 0,
  });
}

// 4. A deliberate copy has a test that keeps it in step with its source (AGENTS.md, rule 6).
{
  const guard = "packages/secret-boundary/src/public-input-guard.ts";
  const text = read(guard);
  const copy = /const MNEMONIC_WORD_COUNTS = \[([^\]]+)\]/u.exec(text);
  const typedAgain = [...text.matchAll(/const (SHORTEST|LONGEST)_PHRASE_WORDS = (\d+);/gu)].map(
    (match) => `${guard}:${lineOf(text, match.index)} ${match[1]}_PHRASE_WORDS = ${match[2]}`,
  );
  const coreImports = [...text.matchAll(/from "(@ckd\/core\/[^"]+)"/gu)].map((match) => match[1]);
  const testFiles = (directory) =>
    readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory())
        return ["node_modules", "generated", "dist", "source"].includes(entry.name)
          ? []
          : testFiles(path);
      return /\.test\.(?:ts|mjs)$/u.test(entry.name) ? [path] : [];
    });
  const tests = ["apps", "packages", "tooling", "test"].flatMap(testFiles);
  const stepTests = tests.filter((path) => {
    const body = read(path);
    return (
      /MNEMONIC_WORD_COUNTS|public-input-guard/u.test(body) && /BIP39_WORD_COUNTS|bip39-parameters/u.test(body)
    );
  });
  results.push({
    probe: "public-input-guard-word-count-copy",
    copy: copy === null ? null : `${guard}:${lineOf(text, copy.index)} [${copy[1]}]`,
    typedAgain,
    guardAlreadyImportsCore: coreImports,
    stepTests,
    contractPassed: copy === null || stepTests.length > 0,
  });
}

// 5. The canonical wasm-bindgen version has one JavaScript owner in tooling.
{
  const sites = [];
  for (const path of walk("tooling", (item) => /\.mjs$/u.test(item) && !/\.test\.mjs$/u.test(item))) {
    // verify-reproducible-container.mjs holds the independent expected container text (AUD-024
    // family 21 excluded it as an oracle).
    if (path.endsWith("verify-reproducible-container.mjs")) continue;
    const text = read(path);
    for (const match of text.matchAll(/["'`](?:wasm-bindgen )?0\.2\.\d+["'`]/gu))
      sites.push(`${relative(".", path)}:${lineOf(text, match.index)} ${match[0]}`);
  }
  results.push({ probe: "wasm-bindgen-pin-owner", sites, contractPassed: sites.length <= 1 });
}

// 6. Every export surface uses the shared download helper whose comment claims that role.
{
  const helper = "packages/export-core/src/download.ts";
  const claims = /Every export surface goes through this helper/u.test(read(helper));
  const surfaces = walk("apps", (path) => /\/src\/.*\.ts$/u.test(path)).filter((path) => {
    const text = read(path);
    return /URL\.createObjectURL\(/u.test(text) && /\.download = /u.test(text);
  });
  results.push({
    probe: "download-lifetime-owner",
    helper,
    helperClaimsSoleOwnership: claims,
    ownCopies: surfaces,
    contractPassed: surfaces.length === 0,
  });
}

// 7. Dash address facts are read from their owners, not typed again.
{
  const owners = {
    "Dash Core P2PKH 76/140": "packages/crypto-core/src/networks.ts (DASH_NETWORKS p2pkh)",
    "Platform HRP dash/tdash": "packages/crypto-core/src/networks.ts (platformHrp)",
    "DIP18 P2PKH type 0xb0": "packages/coin-protocols/src/coins/dash/platform.ts (PLATFORM_P2PKH_TYPE)",
    "Orchard type 0x10": "packages/coin-protocols/src/coins/dash/shielded-address.ts (ORCHARD_ADDRESS_TYPE)",
  };
  const patterns = [
    ["Dash Core P2PKH 76/140", /\? 76 : 140|\? 0x4c : 0x8c/gu],
    ["Platform HRP dash/tdash", /\? "dash" : "tdash"/gu],
    ["DIP18 P2PKH type 0xb0", /=== 0xb0|!== 0xb0/gu],
    ["Orchard type 0x10", /=== 0x10\b/gu],
  ];
  const retyped = [];
  for (const path of walk("packages", (item) => /\/src\/.*\.ts$/u.test(item))) {
    if (path.includes("recovery-mnemocode/source")) continue;
    const text = read(path);
    for (const [fact, pattern] of patterns)
      for (const match of text.matchAll(pattern))
        retyped.push({ fact, site: `${relative(".", path)}:${lineOf(text, match.index)}`, text: match[0] });
  }
  results.push({
    probe: "dash-address-facts-owner",
    owners,
    retyped,
    contractPassed: retyped.length === 0,
  });
}

const failed = results.filter((result) => !result.contractPassed).map((result) => result.probe);
const report = { results, failed };
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
process.exitCode = failed.length > 0 ? 1 : 0;

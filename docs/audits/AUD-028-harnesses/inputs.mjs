// Diagnose existing build records without changing the source or canonical manifest.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { createWasmIntegrityManifest } from "../../../tooling/verify-wasm-integrity.mjs";

const expected = JSON.parse(readFileSync("tooling/wasm-canonical-manifest.json", "utf8"));
const actual = createWasmIntegrityManifest();
const modules = Object.entries(actual.modules).map(([name, value]) => ({
  name,
  expectedSource: expected.modules[name].sourceSha256,
  actualSource: value.sourceSha256,
  generatedChanges: [
    ...new Set([...Object.keys(value.generated), ...Object.keys(expected.modules[name].generated)]),
  ].filter((file) => value.generated[file] !== expected.modules[name].generated[file]),
}));
const root = resolve(process.argv[2] ?? "../dash-wallet-tools");
const origin = JSON.parse(readFileSync(`${root}/documentation-source.json`, "utf8"));
const docs = Object.entries(origin.files).map(([name, hash]) => {
  const actual = createHash("sha256")
    .update(readFileSync(`${root}/${name}`))
    .digest("hex");
  return { name, expected: hash, actual, matches: hash === actual };
});
console.log(JSON.stringify({ modules, dashDocumentation: docs }, null, 2));

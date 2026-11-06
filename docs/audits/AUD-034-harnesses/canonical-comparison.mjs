// Read-only source/output comparison and export metadata; no WASM instance or canonical rebuild.
import { readFileSync } from "node:fs";
import { createWasmIntegrityManifest } from "../../../tooling/verify-wasm-integrity.mjs";

const expected = JSON.parse(readFileSync("tooling/wasm-canonical-manifest.json", "utf8"));
const actual = createWasmIntegrityManifest();
const modules = Object.entries(actual.modules).map(([name, record]) => ({
  name,
  sourceMatches: record.sourceSha256 === expected.modules[name].sourceSha256,
  expectedSource: expected.modules[name].sourceSha256,
  actualSource: record.sourceSha256,
  generated: Object.entries(record.generated).map(([path, sha256]) => ({ path, sha256, expected: expected.modules[name].generated[path], matches: sha256 === expected.modules[name].generated[path] })),
}));
const wasm = new WebAssembly.Module(readFileSync("packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm"));
const orchardExports = WebAssembly.Module.exports(wasm);
console.log(JSON.stringify({ modules, orchardExports, limitation: "Export metadata compiled from public committed bytes; no instance, secret derivation, ABI call, timing/zeroization analysis or source rebuild." }, null, 2));
if (modules.some((record) => !record.sourceMatches || record.generated.some((file) => !file.matches))) process.exitCode = 1;

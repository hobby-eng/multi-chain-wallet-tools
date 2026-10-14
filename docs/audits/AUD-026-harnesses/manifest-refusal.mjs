// Actual CLI refusal must leave the record unchanged. Source drift must remain visible too.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { verifyWasmIntegrityManifest } from "../../../tooling/verify-wasm-integrity.mjs";
const path = "tooling/wasm-canonical-manifest.json";
const digest = () => createHash("sha256").update(readFileSync(path)).digest("hex");
const before = digest();
const result = spawnSync(process.execPath, ["tooling/verify-wasm-integrity.mjs", "--write"], {
  env: { ...process.env, WALLET_TOOLS_CANONICAL_WASM: "0" },
  encoding: "utf8",
});
assert.equal(result.status, 1);
assert.match(result.stderr, /Refusing to write the WASM record outside/u);
assert.equal(digest(), before);
assert.throws(() => verifyWasmIntegrityManifest(), /differ from the canonical container record/u);
console.log(
  JSON.stringify({
    refusedHostWrite: true,
    manifestUnchanged: true,
    sourceDriftRejected: true,
    canonicalRegeneration: "deferred-until-release",
  }),
);

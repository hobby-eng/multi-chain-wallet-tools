// Checks the embedded MHFE 0.5.0 browser package with Node: suite MHFE-BIP39-256-EXPERIMENTAL-3 for
// 24-word containers and MHFE-BIP39-LP-EXPERIMENTAL-4 for containers of the phrase's own length.
//
//   node tooling/verify-mhfe-vector.mjs          a few seconds, reduced Argon2 cost
//   node tooling/verify-mhfe-vector.mjs --full   also the full-size public vector (2 GiB, minutes)
//
// It runs the vendored Rust core and the vendored single-threaded Argon2 build exactly as the
// page's worker does. The fast check lowers the Argon2 cost in a wrapper; each container must then
// equal the one the mhfe repository's own tests give at that cost (REDUCED_COST_CONTAINER and
// REDUCED_COST_SAME_LENGTH_CONTAINER in mhfe/src/mhfe.rs). The full check reproduces the published
// zero-12 vectors of suites 3 and 4.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (name) => readFileSync(resolve(root, "packages/recovery-mhfe-wasm/generated", name));

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const PASSWORD = new TextEncoder().encode("public test password");
/** Four Argon2 lanes need at least 32 KiB; 256 KiB and one pass match the mhfe unit tests. */
const REDUCED_MEMORY_KIB = 256;
const REDUCED_PASSES = 1;
const REDUCED_COST_CONTAINER =
  "slush crime nose carry menu cabbage already cart lock intact focus siren filter crouch buyer toward topple cup holiday avoid mango envelope dream sweet";
const REDUCED_COST_SAME_LENGTH_CONTAINER =
  "program adjust rain raven flip eternal spider bulb under soup enrich ensure";
/** The published zero-12 vectors: the same phrase and password at the suite defaults. */
const FULL_SIZE_CONTAINER =
  "donate stove tower picnic iron rescue trick shrimp roof rib home cigar bag pledge also nerve cycle famous provide heart ahead chunk caution peace";
const FULL_SIZE_SAME_LENGTH_CONTAINER =
  "renew alert there knife dose allow fashion casino kiwi lens sister bless";
const FULL_SUITE = "MHFE-BIP39-256-EXPERIMENTAL-3";
const SAME_LENGTH_SUITE = "MHFE-BIP39-LP-EXPERIMENTAL-4";

// The worker script expects a worker global; its message handler is not used here. Under Node the
// Emscripten build takes the Node path, which reads `require` and `__dirname` as a CommonJS
// script would find them; it reads no file, because its WebAssembly is embedded.
globalThis.self = {};
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = resolve(root, "packages/recovery-mhfe-wasm/generated");
vm.runInThisContext(read("mhfe-worker.js").toString(), { filename: "mhfe-worker.js" });
vm.runInThisContext(read("argon2-st.js").toString(), { filename: "argon2-st.js" });
const core = vm.runInThisContext("wasm_bindgen");
const argon2Engine = vm.runInThisContext("argon2Engine");
const createArgon2St = vm.runInThisContext("createArgon2St");
core.initSync({ module: read("mhfe_core_bg.wasm") });

const parameters = JSON.parse(core.suiteParameters());
assert.equal(parameters.suiteId, FULL_SUITE);
assert.equal(parameters.sameLengthSuiteId, SAME_LENGTH_SUITE);
assert.equal(parameters.apiVersion, 7);
assert.equal(parameters.highestBrowserMemoryLevel, 0);

const engine = argon2Engine(await createArgon2St());
const reduced = {
  derive: (password, salt, memoryKib, passes, key) => {
    // Both suites share the Argon2 settings of suite 3.
    assert.deepEqual([memoryKib, passes], [2097152, 12], "the core asks for the suite defaults");
    engine.derive(password, salt, REDUCED_MEMORY_KIB, REDUCED_PASSES, key);
  },
};
/** Encrypts the test phrase; the core answers with the container and the suite it chose. */
function encrypt(argon2, sameLength) {
  return JSON.parse(
    core.encrypt(
      PHRASE,
      PASSWORD,
      0,
      0,
      sameLength,
      argon2,
      () => {},
      () => {},
    ),
  );
}

for (const [sameLength, expected, suiteId, verified] of [
  [false, REDUCED_COST_CONTAINER, FULL_SUITE, true],
  // A same-length container has no built-in check, so its recovery is never verified.
  [true, REDUCED_COST_SAME_LENGTH_CONTAINER, SAME_LENGTH_SUITE, false],
]) {
  const made = encrypt(reduced, sameLength);
  assert.deepEqual(
    made,
    { container: expected, suiteId },
    "the embedded package gives the reference container",
  );
  const recovery = JSON.parse(core.decrypt(made.container, PASSWORD, 0, 0, 0, reduced, () => {}));
  assert.deepEqual(recovery, {
    kind: "phrase",
    candidates: [{ words: 12, verified, phrase: PHRASE, suiteId }],
  });
}
console.log(
  "Verified the embedded MHFE 0.5.0 package: suites 3 and 4, encryption and recovery at reduced cost.",
);

if (process.argv.includes("--full")) {
  assert.equal(encrypt(engine, false).container, FULL_SIZE_CONTAINER);
  assert.equal(encrypt(engine, true).container, FULL_SIZE_SAME_LENGTH_CONTAINER);
  console.log(
    "Verified the embedded MHFE 0.5.0 package against the published full-size zero-12 vectors of suites 3 and 4.",
  );
}
PASSWORD.fill(0);

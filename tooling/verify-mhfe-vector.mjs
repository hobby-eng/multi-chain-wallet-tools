// Checks the embedded MHFE 0.4.0 browser package (suite MHFE-BIP39-256-EXPERIMENTAL-3) with Node.
//
//   node tooling/verify-mhfe-vector.mjs          a few seconds, reduced Argon2 cost
//   node tooling/verify-mhfe-vector.mjs --full   also the full-size public vector (2 GiB, minutes)
//
// It runs the vendored Rust core and the vendored single-threaded Argon2 build exactly as the
// page's worker does. The fast check lowers the Argon2 cost in a wrapper; the container must then
// equal the one the mhfe repository's own tests give at that cost (REDUCED_COST_CONTAINER in
// mhfe/src/mhfe.rs). The full check reproduces the published zero-12 vector of suite 3.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (name) => readFileSync(resolve(root, 'packages/recovery-mhfe-wasm/generated', name));

const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PASSWORD = new TextEncoder().encode('public test password');
/** Four Argon2 lanes need at least 32 KiB; 256 KiB and one pass match the mhfe unit tests. */
const REDUCED_MEMORY_KIB = 256;
const REDUCED_PASSES = 1;
const REDUCED_COST_CONTAINER =
  'slush crime nose carry menu cabbage already cart lock intact focus siren filter crouch buyer toward topple cup holiday avoid mango envelope dream sweet';
/** The published zero-12 vector: the same phrase and password at the suite 3 defaults. */
const FULL_SIZE_CONTAINER =
  'donate stove tower picnic iron rescue trick shrimp roof rib home cigar bag pledge also nerve cycle famous provide heart ahead chunk caution peace';

// The worker script expects a worker global; its message handler is not used here. Under Node the
// Emscripten build takes the Node path, which reads `require` and `__dirname` as a CommonJS
// script would find them; it reads no file, because its WebAssembly is embedded.
globalThis.self = {};
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = resolve(root, 'packages/recovery-mhfe-wasm/generated');
vm.runInThisContext(read('mhfe-worker.js').toString(), { filename: 'mhfe-worker.js' });
vm.runInThisContext(read('argon2-st.js').toString(), { filename: 'argon2-st.js' });
const core = vm.runInThisContext('wasm_bindgen');
const argon2Engine = vm.runInThisContext('argon2Engine');
const createArgon2St = vm.runInThisContext('createArgon2St');
core.initSync({ module: read('mhfe_core_bg.wasm') });

const parameters = JSON.parse(core.suiteParameters());
assert.equal(parameters.suiteId, 'MHFE-BIP39-256-EXPERIMENTAL-3');
assert.equal(parameters.apiVersion, 6);
assert.equal(parameters.highestBrowserMemoryLevel, 0);

const engine = argon2Engine(await createArgon2St());
const reduced = {
  derive: (password, salt, memoryKib, passes, key) => {
    assert.deepEqual([memoryKib, passes], [2097152, 12], 'the core asks for the suite 3 defaults');
    engine.derive(password, salt, REDUCED_MEMORY_KIB, REDUCED_PASSES, key);
  },
};
const container = core.encrypt(
  PHRASE,
  PASSWORD,
  0,
  0,
  reduced,
  () => {},
  () => {},
);
assert.equal(container, REDUCED_COST_CONTAINER, 'the embedded package gives the reference container');
const recovery = JSON.parse(core.decrypt(container, PASSWORD, 0, 0, 0, reduced, () => {}));
assert.deepEqual(recovery, { kind: 'phrase', candidates: [{ words: 12, verified: true, phrase: PHRASE }] });
console.log('Verified the embedded MHFE 0.4.0 package: suite 3 encryption and recovery at reduced cost.');

if (process.argv.includes('--full')) {
  const full = core.encrypt(
    PHRASE,
    PASSWORD,
    0,
    0,
    engine,
    () => {},
    () => {},
  );
  assert.equal(full, FULL_SIZE_CONTAINER);
  console.log('Verified the embedded MHFE 0.4.0 package against the published full-size zero-12 vector.');
}
PASSWORD.fill(0);

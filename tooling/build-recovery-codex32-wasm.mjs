import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertExactToolVersion, resolveRustToolchain } from './rust-toolchain.mjs';
import { assertCanonicalWasmBindgenProducer } from './verify-wasm-producers.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { cargo, wasmBindgen, environment } = resolveRustToolchain(root);
const manifest = resolve(root, 'packages/recovery-codex32-wasm/rust/Cargo.toml');
const compiled = resolve(
  root,
  'packages/recovery-codex32-wasm/rust/target/wasm32-unknown-unknown/release/recovery_codex32_wasm.wasm',
);
const generated = resolve(root, 'packages/recovery-codex32-wasm/generated');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env: environment, stdio: 'inherit' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

assertExactToolVersion(wasmBindgen, 'wasm-bindgen 0.2.128', { cwd: root, env: environment });
run(cargo, ['build', '--manifest-path', manifest, '--target', 'wasm32-unknown-unknown', '--release', '--locked']);
mkdirSync(generated, { recursive: true });
run(wasmBindgen, [compiled, '--target', 'web', '--out-dir', generated]);
assertCanonicalWasmBindgenProducer(readFileSync(resolve(generated, 'recovery_codex32_wasm_bg.wasm')), 'Codex32 WASM');
const gluePath = resolve(generated, 'recovery_codex32_wasm.js');
const fullGlue = readFileSync(gluePath, 'utf8');
function removeSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Generated Codex32 glue is missing ${startMarker.trim()}.`);
  return source.slice(0, start) + source.slice(end);
}
const asyncExport = '\nexport { initSync, __wbg_init as default };';
const withoutLoader = removeSection(fullGlue, '\nasync function __wbg_load', '\nfunction initSync');
const offlineGlue = removeSection(withoutLoader, '\nasync function __wbg_init', asyncExport).replace(
  asyncExport,
  '\nexport { initSync };',
);
const normalized = offlineGlue.replace(
  '__wbg_init.__wbindgen_wasm_module = module;',
  'initSync.__wbindgen_wasm_module = module;',
);
if (/\bfetch\s*\(|import\.meta|__wbg_load|\b__wbg_init\b/u.test(normalized)) {
  throw new Error('Failed to reduce Codex32 wasm-bindgen glue to its synchronous offline API.');
}
writeFileSync(gluePath, normalized);
console.log('Generated pinned rust-codex32 browser WASM.');

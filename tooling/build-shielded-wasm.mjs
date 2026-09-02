import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const localCargoHome = resolve(root, '.tools/cargo');
const localRustupHome = resolve(root, '.tools/rustup');
const fallbackHome = process.env.HOME;
const effectiveCargoHome = existsSync(localCargoHome)
  ? localCargoHome
  : process.env.CARGO_HOME ?? (fallbackHome === undefined ? undefined : resolve(fallbackHome, '.cargo'));
const effectiveRustupHome = existsSync(localRustupHome)
  ? localRustupHome
  : process.env.RUSTUP_HOME ?? (fallbackHome === undefined ? undefined : resolve(fallbackHome, '.rustup'));
const cargo = existsSync(resolve(localCargoHome, 'bin/cargo'))
  ? resolve(localCargoHome, 'bin/cargo')
  : 'cargo';
const wasmBindgen = existsSync(resolve(localCargoHome, 'bin/wasm-bindgen'))
  ? resolve(localCargoHome, 'bin/wasm-bindgen')
  : 'wasm-bindgen';
const manifest = resolve(root, 'packages/dash-shielded-wasm/rust/Cargo.toml');
const compiled = resolve(root, 'packages/dash-shielded-wasm/rust/target/wasm32-unknown-unknown/release/dash_shielded_wasm.wasm');
const generated = resolve(root, 'packages/dash-shielded-wasm/generated');
const environment = {
  ...process.env,
  ...(existsSync(localCargoHome) ? { CARGO_HOME: localCargoHome } : {}),
  ...(existsSync(localRustupHome) ? { RUSTUP_HOME: localRustupHome } : {}),
  CARGO_ENCODED_RUSTFLAGS: [
    ...(effectiveCargoHome === undefined ? [] : [`--remap-path-prefix=${effectiveCargoHome}=/cargo`]),
    ...(effectiveRustupHome === undefined ? [] : [`--remap-path-prefix=${effectiveRustupHome}=/rustup`]),
    `--remap-path-prefix=${root}=/workspace`,
  ].join('\u001f'),
};

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env: environment, stdio: 'inherit' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function version(command, expected) {
  const result = spawnSync(command, ['--version'], { cwd: root, env: environment, encoding: 'utf8' });
  if (result.error !== undefined) throw result.error;
  const actual = result.stdout.trim();
  if (result.status !== 0 || (actual !== expected && !actual.startsWith(`${expected} `))) {
    throw new Error(`Expected ${expected}; received ${actual || 'no version output'}.`);
  }
}

const lockfile = readFileSync(resolve(root, 'packages/dash-shielded-wasm/rust/Cargo.lock'), 'utf8');
const expectedOrchard = 'git+https://github.com/dashpay/orchard.git?tag=dashified-0.14.1#38ac9c19a2df7bf3eeadc22ab23053e8fd538828';
if (!lockfile.includes(expectedOrchard)) {
  throw new Error('Cargo.lock does not contain the audited Dash Orchard release and commit.');
}

version(cargo, 'cargo 1.85.1');
version(wasmBindgen, 'wasm-bindgen 0.2.100');
run(cargo, ['build', '--manifest-path', manifest, '--target', 'wasm32-unknown-unknown', '--release', '--locked']);
mkdirSync(generated, { recursive: true });
run(wasmBindgen, [compiled, '--target', 'web', '--out-dir', generated]);
const generatedWasmPath = resolve(generated, 'dash_shielded_wasm_bg.wasm');
const generatedWasm = readFileSync(generatedWasmPath);
for (const privatePrefix of [root, effectiveCargoHome, effectiveRustupHome].filter(Boolean)) {
  if (generatedWasm.includes(Buffer.from(privatePrefix))) {
    throw new Error(`Generated Orchard WASM still exposes a private build path: ${privatePrefix}`);
  }
}
const gluePath = resolve(generated, 'dash_shielded_wasm.js');
const fullGlue = readFileSync(gluePath, 'utf8');
const offlineGlue = fullGlue
  .replace(/async function __wbg_load[\s\S]*?\nfunction __wbg_get_imports/u, 'function __wbg_get_imports')
  .replace(/\nasync function __wbg_init[\s\S]*?\nexport \{ initSync \};\nexport default __wbg_init;\s*$/u, '\nexport { initSync };\n');
const normalizedGlue = offlineGlue.replace('__wbg_init.__wbindgen_wasm_module = module;', 'initSync.__wbindgen_wasm_module = module;');
if (normalizedGlue === fullGlue || /\bfetch\s*\(|import\.meta|__wbg_load|\b__wbg_init\b/u.test(normalizedGlue)) {
  throw new Error('Failed to reduce wasm-bindgen glue to its synchronous offline-only API.');
}
writeFileSync(gluePath, normalizedGlue);
const declarationsPath = resolve(generated, 'dash_shielded_wasm.d.ts');
writeFileSync(declarationsPath, `/* Generated offline-only wasm-bindgen declarations. */
export function derive_shielded_json(
  seed: Uint8Array,
  coin_type: number,
  account: number,
  start: number,
  count: number,
): string;

export function scan_shielded_batch_json(
  full_viewing_key: Uint8Array,
  start_position: bigint,
  cmx: Uint8Array,
  nullifiers: Uint8Array,
  cv_net: Uint8Array,
  encrypted_notes: Uint8Array,
): string;

export function scan_shielded_incoming_batch_json(
  incoming_viewing_key: Uint8Array,
  start_position: bigint,
  cmx: Uint8Array,
  nullifiers: Uint8Array,
  cv_net: Uint8Array,
  encrypted_notes: Uint8Array,
): string;

export function scan_shielded_outgoing_batch_json(
  outgoing_viewing_key: Uint8Array,
  start_position: bigint,
  cmx: Uint8Array,
  nullifiers: Uint8Array,
  cv_net: Uint8Array,
  encrypted_notes: Uint8Array,
): string;

export function validate_full_viewing_key(full_viewing_key: Uint8Array): void;
export function validate_incoming_viewing_key(incoming_viewing_key: Uint8Array): void;
export function validate_outgoing_viewing_key(outgoing_viewing_key: Uint8Array): void;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly derive_shielded_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly scan_shielded_batch_json: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
  readonly scan_shielded_incoming_batch_json: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
  readonly scan_shielded_outgoing_batch_json: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
  readonly validate_full_viewing_key: (a: number, b: number, c: number, d: number) => void;
  readonly validate_incoming_viewing_key: (a: number, b: number, c: number, d: number) => void;
  readonly validate_outgoing_viewing_key: (a: number, b: number, c: number, d: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export_0: (a: number, b: number) => number;
  readonly __wbindgen_export_1: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;
`);
console.log('Generated pinned Dash Orchard browser WASM.');

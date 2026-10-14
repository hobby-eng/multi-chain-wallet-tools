import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  bindgenStaged,
  compileWasmCrate,
  offlineGlue,
  root,
  wasmModule,
  wasmToolchain,
} from "./wasm-build.mjs";

const module = wasmModule("dash-shielded-wasm");
const toolchain = wasmToolchain();
const { cargoHome: effectiveCargoHome, rustupHome: effectiveRustupHome } = toolchain;
const generated = resolve(root, "packages/dash-shielded-wasm/generated");

const lockfile = readFileSync(resolve(root, "packages/dash-shielded-wasm/rust/Cargo.lock"), "utf8");
const expectedOrchard =
  "git+https://github.com/dashpay/orchard.git?tag=dashified-0.14.1#38ac9c19a2df7bf3eeadc22ab23053e8fd538828";
if (!lockfile.includes(expectedOrchard)) {
  throw new Error("Cargo.lock does not contain the audited Dash Orchard release and commit.");
}

const compiled = compileWasmCrate(module, toolchain);
await bindgenStaged(module, compiled, toolchain, async (staging, generatedWasm) => {
  for (const privatePrefix of [root, effectiveCargoHome, effectiveRustupHome].filter(Boolean)) {
    if (generatedWasm.includes(Buffer.from(privatePrefix))) {
      throw new Error(
        `Generated Orchard WASM still exposes a private build path: ${privatePrefix}`,
      );
    }
  }
  const gluePath = resolve(staging, "dash_shielded_wasm.js");
  writeFileSync(gluePath, offlineGlue(readFileSync(gluePath, "utf8"), module.label));
  const declarationsPath = resolve(staging, "dash_shielded_wasm.d.ts");
  writeFileSync(
    declarationsPath,
    `/* Generated offline-only wasm-bindgen declarations. */
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
`,
  );
  mkdirSync(generated, { recursive: true });
  for (const file of [
    "dash_shielded_wasm_bg.wasm",
    "dash_shielded_wasm.js",
    "dash_shielded_wasm.d.ts",
  ]) {
    copyFileSync(resolve(staging, file), resolve(generated, file));
  }
});
console.log("Generated pinned Dash Orchard browser WASM.");

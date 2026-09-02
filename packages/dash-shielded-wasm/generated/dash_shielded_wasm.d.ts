/* Generated offline-only wasm-bindgen declarations. */
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

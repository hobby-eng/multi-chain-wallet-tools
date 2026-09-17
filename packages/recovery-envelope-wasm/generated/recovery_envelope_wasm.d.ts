/* tslint:disable */
/* eslint-disable */

export function create_seed_envelope(entropy: Uint8Array, name: string, note: string, password: string): string;

export function create_seed_envelope_advanced(
  entropy: Uint8Array,
  name: string,
  note: string,
  password: string,
  bip39_passphrase: string,
  recipient_public_keys: string,
  group_threshold: number,
  group_specs: Uint8Array,
): string;

export function derive_seed_recipient_keys(bip39_seed: Uint8Array): string;

export function recover_seed_envelope(record: string, password: string): Uint8Array;

export function recover_seed_envelope_advanced(
  records: string,
  password: string,
  recipient_private_key: string,
): Uint8Array;

export function recover_seed_envelope_bundle_advanced(
  records: string,
  password: string,
  recipient_private_key: string,
): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly create_seed_envelope: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
  ) => void;
  readonly create_seed_envelope_advanced: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
  ) => void;
  readonly derive_seed_recipient_keys: (a: number, b: number, c: number) => void;
  readonly recover_seed_envelope: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly recover_seed_envelope_advanced: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
  ) => void;
  readonly recover_seed_envelope_bundle_advanced: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
  ) => void;
  readonly rustsecp256k1_v0_11_context_create: (a: number) => number;
  readonly rustsecp256k1_v0_11_context_destroy: (a: number) => void;
  readonly rustsecp256k1_v0_11_default_error_callback_fn: (a: number, b: number) => void;
  readonly rustsecp256k1_v0_11_default_illegal_callback_fn: (a: number, b: number) => void;
  readonly __wbindgen_export: (a: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export2: (a: number, b: number) => number;
  readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

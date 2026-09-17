/* tslint:disable */
/* eslint-disable */

export function create_sskr_shares(
  secret: Uint8Array,
  group_threshold: number,
  group_specs: Uint8Array,
  random_seed: Uint8Array,
): string;

export function create_sskr_shares_formatted(
  secret: Uint8Array,
  group_threshold: number,
  group_specs: Uint8Array,
  random_seed: Uint8Array,
  encoding: number,
): string;

export function recover_sskr_shares(records: string): Uint8Array;

export function recover_sskr_shares_formatted(records: string, encoding: number): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly create_sskr_shares: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
  ) => void;
  readonly create_sskr_shares_formatted: (
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
  readonly recover_sskr_shares: (a: number, b: number, c: number) => void;
  readonly recover_sskr_shares_formatted: (a: number, b: number, c: number, d: number) => void;
  readonly rustsecp256k1_v0_11_context_create: (a: number) => number;
  readonly rustsecp256k1_v0_11_context_destroy: (a: number) => void;
  readonly rustsecp256k1_v0_11_default_error_callback_fn: (a: number, b: number) => void;
  readonly rustsecp256k1_v0_11_default_illegal_callback_fn: (a: number, b: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export: (a: number, b: number) => number;
  readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
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

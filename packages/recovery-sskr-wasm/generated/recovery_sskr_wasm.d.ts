/* tslint:disable */
/* eslint-disable */

/**
 * The encodings of a share, which a host asks for by their number: the compact UR, or standard
 * Bytewords. JavaScript reads the numbers from this enum (`ShareEncoding.CompactUr`), so they are
 * written only here.
 *
 * The entries still take the number as a `u8`: wasm-bindgen refuses a number outside an enum by
 * throwing before any code here runs, which would leave the secret it has already copied in
 * unwiped. `ShareEncoding::try_from` refuses it inside the entry, which then wipes the secret
 * (AUD-012-SEC001).
 */
export enum ShareEncoding {
  /**
   * The compact UR of a share (ur:sskr/...), its minimal Bytewords.
   */
  CompactUr = 0,
  /**
   * The standard Bytewords of a share's tagged CBOR.
   */
  Bytewords = 1,
}

/**
 * The shares of `secret` as compact URs, one per line (create_sskr_shares_formatted).
 */
export function create_sskr_shares(
  secret: Uint8Array,
  group_threshold: number,
  group_specs: Uint8Array,
  random_seed: Uint8Array,
): string;

/**
 * The shares of `secret` in the encoding numbered `encoding` (ShareEncoding), one per line: of
 * the groups `group_specs`, a threshold and a count for each, of which `group_threshold` restore
 * it, made with a generator seeded with the host's fresh `random_seed`. The secret and the seed
 * are wiped, also when the split is refused.
 */
export function create_sskr_shares_formatted(
  secret: Uint8Array,
  group_threshold: number,
  group_specs: Uint8Array,
  random_seed: Uint8Array,
  encoding: number,
): string;

/**
 * The secret of the compact UR shares `records`, one per line (recover_sskr_shares_formatted).
 */
export function recover_sskr_shares(records: string): Uint8Array;

/**
 * The secret of the shares `records`, one per line, in the encoding numbered `encoding`
 * (ShareEncoding). The records are wiped, also when they are refused.
 */
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

/* tslint:disable */
/* eslint-disable */

export function codex32_parameters_json(): string;

export function decode_codex32_seed(value: string): Uint8Array;

export function encode_codex32_random_share(
  random: Uint8Array,
  threshold: number,
  identifier: string,
  share_index: string,
  padding: number,
): string;

export function encode_codex32_seed(
  seed: Uint8Array,
  threshold: number,
  identifier: string,
  share_index: string,
): string;

export function interpolate_codex32(shares_text: string, target_index: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly codex32_parameters_json: (a: number) => void;
  readonly decode_codex32_seed: (a: number, b: number, c: number) => void;
  readonly encode_codex32_random_share: (
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
  readonly encode_codex32_seed: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
  ) => void;
  readonly interpolate_codex32: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export2: (a: number, b: number) => number;
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

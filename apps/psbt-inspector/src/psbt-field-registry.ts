import type { PsbtChain } from './psbt-types.js';

export type PsbtMapScope = 'global' | 'input' | 'output';

const DASH_UNSUPPORTED_TYPES: Readonly<Record<PsbtMapScope, readonly bigint[]>> = {
  global: [2n, 3n, 4n, 5n, 6n],
  input: [1n, 5n, 8n, 9n, 14n, 15n, 16n, 17n, 18n, 19n, 20n, 21n, 22n, 23n, 24n, 26n, 27n, 28n],
  output: [1n, 3n, 4n, 5n, 6n, 7n, 8n],
};

export function isUnsupportedField(chain: PsbtChain, scope: PsbtMapScope, type: bigint): boolean {
  return chain === 'dash' && DASH_UNSUPPORTED_TYPES[scope].includes(type);
}

import { secureRandomBytes } from '@ckd/core/secure-random.js';
import {
  create_sskr_shares_formatted,
  initSync,
  recover_sskr_shares_formatted,
} from '@ckd/recovery-sskr-wasm/recovery_sskr_wasm.js';
import wasmBytes from '@ckd/recovery-sskr-wasm/recovery_sskr_wasm_bg.wasm';
import { validateSskrGroups, type SskrGroupSpec } from './sskr-groups.js';

let initialized = false;
function initializeSskrWasm(): void {
  if (initialized) return;
  initSync({ module: wasmBytes });
  initialized = true;
}
export type SskrShareEncoding = 'compact-ur' | 'bytewords';

const SSKR_ENCODING: Readonly<Record<SskrShareEncoding, number>> = {
  'compact-ur': 0,
  bytewords: 1,
};

export type { SskrGroupSpec } from './sskr-groups.js';
export function createSskrShares(
  secret: Uint8Array,
  groupThreshold: number,
  groups: readonly SskrGroupSpec[],
  encoding: SskrShareEncoding = 'compact-ur',
): string[] {
  initializeSskrWasm();
  const packedGroups = validateSskrGroups(groupThreshold, groups, { label: 'SSKR', allowEmpty: false });
  const random = secureRandomBytes(32);
  try {
    return create_sskr_shares_formatted(secret, groupThreshold, packedGroups, random, SSKR_ENCODING[encoding]).split(
      '\n',
    );
  } finally {
    random.fill(0);
  }
}
export function recoverSskrShares(shares: readonly string[], encoding: SskrShareEncoding = 'compact-ur'): Uint8Array {
  initializeSskrWasm();
  return recover_sskr_shares_formatted(shares.join('\n'), SSKR_ENCODING[encoding]);
}

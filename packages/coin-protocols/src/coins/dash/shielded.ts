import { assertIndex, MAX_BATCH_SIZE } from '@ckd/core/bip32.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import type { DerivationResult, ShieldedBatchOptions } from '@ckd/core/types.js';
import wasmBytes from '@ckd/dash-wasm/dash_shielded_wasm_bg.wasm';
import {
  derive_shielded_json as deriveOfficialOrchardJson,
  initSync as initializeOfficialOrchard,
} from '@ckd/dash-wasm/dash_shielded_wasm.js';
import { buildDashShieldedResult } from './shielded-result.js';
const MAX_DIVERSIFIER_INDEX = 0xffff_ffff;

let wasmInitialized = false;

function initWasm(): void {
  if (wasmInitialized) return;
  initializeOfficialOrchard({ module: wasmBytes });
  wasmInitialized = true;
}

/**
 * Calls the embedded official Dash Orchard WASM adapter. TS only validates and
 * presents its canonical raw encodings; it does not implement shielded math.
 */
export function deriveDashShielded(options: ShieldedBatchOptions): DerivationResult {
  const network = getDashNetwork(options.network);
  assertIndex(options.account, 'Account');
  assertIndex(options.start, 'Diversifier index', MAX_DIVERSIFIER_INDEX);
  if (!Number.isSafeInteger(options.count) || options.count < 1 || options.count > MAX_BATCH_SIZE) {
    throw new Error(`Number of results must be an integer from 1 to ${MAX_BATCH_SIZE}.`);
  }
  if (options.start + options.count - 1 > MAX_DIVERSIFIER_INDEX) {
    throw new Error('The requested diversifier index range exceeds uint32.');
  }
  initWasm();

  let json = deriveOfficialOrchardJson(
    options.seed,
    network.coinType,
    options.account,
    options.start,
    options.count,
  );
  try {
    return buildDashShieldedResult(json, options);
  } finally {
    json = '';
  }
}

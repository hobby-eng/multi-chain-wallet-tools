import type { CustomMiniscriptContext, CustomMiniscriptPolicy } from './custom-miniscript.js';
import type { PsbtNetwork } from './psbt.js';

export type { CustomMiniscriptContext, CustomMiniscriptPolicy };

export function buildCustomMiniscriptPolicy(
  _miniscript: string,
  _context: CustomMiniscriptContext,
  _network: PsbtNetwork,
): CustomMiniscriptPolicy {
  throw new Error('Custom Bitcoin P2WSH and Tapscript Miniscript construction is unavailable in the Dash Community build.');
}

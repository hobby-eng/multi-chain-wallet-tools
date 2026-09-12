import type { MusigDescriptorAnalysis } from './musig-descriptor.js';
import type { PsbtNetwork } from './psbt.js';

export function analyzeMusigDescriptor(input: string, _network: PsbtNetwork, _wildcardIndex: number): MusigDescriptorAnalysis | null {
  if (input.includes('musig(')) throw new Error('MuSig2 is not available in the Dash Community Edition.');
  return null;
}

export function compileTaprootDescriptor(..._args: unknown[]): never { throw new Error('Taproot is not available on Dash.'); }

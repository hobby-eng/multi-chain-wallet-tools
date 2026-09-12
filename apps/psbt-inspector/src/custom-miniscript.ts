import { NETWORK, TEST_NETWORK, p2tr, taprootNumsKey } from '@scure/btc-signer';
import { bech32 } from '@scure/base';
import { bytesToHex, sha256 } from '@ckd/core/crypto.js';
import { descriptorChecksum } from './descriptor.js';
import { compilePolicyMiniscript } from './miniscript-engine.js';
import type { PsbtNetwork } from './psbt.js';

export type CustomMiniscriptContext = 'p2wsh' | 'tapscript';

export interface CustomMiniscriptPolicy {
  readonly address: string;
  readonly descriptor: string;
  readonly miniscript: string;
  readonly asm: string;
  readonly analysis: string;
  readonly script: Uint8Array;
  readonly scriptPubKey: Uint8Array;
  readonly requirement: string;
  readonly compatibility: string;
}

function checksummedDescriptor(payload: string): string {
  return `${payload}#${descriptorChecksum(payload)}`;
}

export function buildCustomMiniscriptPolicy(
  miniscriptInput: string,
  context: CustomMiniscriptContext,
  network: PsbtNetwork,
): CustomMiniscriptPolicy {
  const miniscript = miniscriptInput.trim().replaceAll('\\_', '_').replaceAll(/\s+/gu, '');
  if (miniscript.length === 0) throw new Error('Enter a Miniscript fragment.');
  if (miniscript.length > 100_000) throw new Error('Miniscript is unreasonably large.');
  const tapscript = context === 'tapscript';
  const compiled = compilePolicyMiniscript(miniscript, { tapscript });
  if (context === 'p2wsh' && compiled.script.length > 10_000) {
    throw new Error('Compiled witnessScript exceeds the 10,000-byte P2WSH consensus limit.');
  }
  const safetyNotice = compiled.sane && compiled.needsSignature
    ? ''
    : ` Warning: the compiler reports ${compiled.sane ? 'a sane policy' : 'a policy that is not sane'} and ${compiled.needsSignature ? 'requires a signature' : 'does not require a signature'}; inspect the safety analysis before funding.`;

  if (context === 'p2wsh') {
    const digest = sha256(compiled.script);
    const scriptPubKey = Uint8Array.of(0x00, 0x20, ...digest);
    const address = bech32.encode(network === 'mainnet' ? 'bc' : network === 'regtest' ? 'bcrt' : 'tb', [0, ...bech32.toWords(digest)]);
    return {
      address,
      descriptor: checksummedDescriptor(`wsh(${miniscript})`),
      miniscript,
      asm: compiled.asm,
      analysis: compiled.analysis,
      script: compiled.script,
      scriptPubKey,
      requirement: 'Custom P2WSH Miniscript. The fragment and its satisfactions define the exact spending requirements.',
      compatibility: `Bitcoin SegWit v0 P2WSH. Confirm that every intended wallet and signer supports this exact Miniscript before funding.${safetyNotice}`,
    };
  }

  const internalKey = taprootNumsKey();
  const payment = p2tr(
    undefined,
    { script: compiled.script },
    network === 'mainnet' ? NETWORK : network === 'regtest' ? { ...TEST_NETWORK, bech32: 'bcrt' } : TEST_NETWORK,
    true,
  );
  return {
    address: payment.address,
    descriptor: checksummedDescriptor(`tr(${bytesToHex(internalKey)},${miniscript})`),
    miniscript,
    asm: compiled.asm,
    analysis: compiled.analysis,
    script: compiled.script,
    scriptPubKey: payment.script,
    requirement: 'Custom single-leaf Tapscript Miniscript. Spending uses the displayed script leaf; the internal key is the standard unspendable NUMS key.',
    compatibility: `Bitcoin Taproot script-path output. The internal key is chosen by Scure BTC Signer as its standard unspendable NUMS key; confirm descriptor and signer support before funding.${safetyNotice}`,
  };
}

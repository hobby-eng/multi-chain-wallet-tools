import { getBitcoinNetwork } from '@ckd/core/networks.js';
import { deriveLegacyAddress } from '@ckd/coins/bitcoin/legacy.js';
import { deriveNativeSegwitAddress } from '@ckd/coins/bitcoin/native-segwit.js';
import { deriveNestedSegwitAddress } from '@ckd/coins/bitcoin/nested-segwit.js';
import { deriveTaprootAddress } from '@ckd/coins/bitcoin/taproot.js';

export type BitcoinMode = 'legacy' | 'nested-segwit' | 'native-segwit' | 'taproot';

export const BITCOIN_MODES: ReadonlyArray<{ mode: BitcoinMode; label: string; purpose: number }> = [
  { mode: 'legacy', label: 'Legacy · BIP44', purpose: 44 },
  { mode: 'nested-segwit', label: 'Nested SegWit · BIP49', purpose: 49 },
  { mode: 'native-segwit', label: 'Native SegWit · BIP84', purpose: 84 },
  { mode: 'taproot', label: 'Taproot · BIP86', purpose: 86 },
];

export function formatBitcoin(satoshis: bigint): string {
  const whole = satoshis / 100_000_000n;
  const fraction = (satoshis % 100_000_000n).toString().padStart(8, '0').replace(/0+$/u, '');
  return `${whole.toLocaleString('en-US')}${fraction.length > 0 ? `.${fraction}` : ''} BTC`;
}

export function addressFor(mode: BitcoinMode, publicKey: Uint8Array, network: ReturnType<typeof getBitcoinNetwork>): string {
  if (mode === 'legacy') return deriveLegacyAddress(publicKey, network).address;
  if (mode === 'nested-segwit') return deriveNestedSegwitAddress(publicKey, network).address;
  if (mode === 'native-segwit') return deriveNativeSegwitAddress(publicKey, network).address;
  return deriveTaprootAddress(publicKey, network).address;
}

/** Taproot requires a compressed point; the other three families hash160 whatever point they are given. */
export function isCompressedSec1(publicKey: Uint8Array): boolean {
  return publicKey.length === 33 && (publicKey[0] === 0x02 || publicKey[0] === 0x03);
}

import { bech32, bech32m, createBase58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { RecoveryNetwork } from './types.js';

const base58check = createBase58check(sha256);

export function normalizeBitcoinAddress(value: unknown, network: RecoveryNetwork): string {
  const invalid = () => new Error(`Invalid Bitcoin ${network} address or checksum.`);
  if (typeof value !== 'string') throw invalid();
  try {
    if (/^(?:bc|tb)1/iu.test(value)) {
      // decode rejects mixed case, invalid padding, and the wrong checksum family.
      const lower = value.toLowerCase();
      let decoded: ReturnType<typeof bech32.decode>;
      try { decoded = bech32.decode(value as `${string}1${string}`); }
      catch { decoded = bech32m.decode(value as `${string}1${string}`); }
      const version = decoded.words[0];
      if (version === undefined || version > 16 || decoded.prefix !== (network === 'mainnet' ? 'bc' : 'tb')) throw invalid();
      const encoding = version === 0 ? bech32 : bech32m;
      const checked = encoding.decode(value as `${string}1${string}`);
      const program = encoding.fromWords(checked.words.slice(1));
      if (program.length < 2 || program.length > 40 || (version === 0 && program.length !== 20 && program.length !== 32)) throw invalid();
      return lower;
    }
    const payload = base58check.decode(value);
    const versions = network === 'mainnet' ? [0, 5] : [111, 196];
    if (payload.length !== 21 || !versions.includes(payload[0]!)) throw invalid();
    return value;
  } catch { throw invalid(); }
}

export function normalizeEthereumAddress(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/u.test(value)) throw new Error('Invalid Ethereum address.');
  const body = value.slice(2);
  const lower = body.toLowerCase();
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(lower)));
  const checksum = [...lower].map((character, index) => parseInt(hash[index]!, 16) >= 8 ? character.toUpperCase() : character).join('');
  if (body !== lower && body !== body.toUpperCase() && body !== checksum) throw new Error('Invalid Ethereum address checksum.');
  return `0x${checksum}`;
}

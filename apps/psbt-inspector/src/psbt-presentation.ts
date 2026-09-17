import { bech32, bech32m } from '@scure/base';
import { bytesToHex, encodeBase58Check, sha256 } from '@ckd/core/crypto.js';
import { reverseHex, type PsbtPair } from './psbt-binary.js';
import type { PsbtChain, PsbtNetwork } from './psbt-types.js';

export function pairName(scope: 'global' | 'input' | 'output', type: bigint, chain: PsbtChain = 'bitcoin'): string {
  const names: Record<string, Record<string, string>> = {
    global: {
      '0': 'Unsigned transaction',
      '1': 'Extended public key',
      '2': 'Transaction version (v2)',
      '3': 'Fallback locktime (v2)',
      '4': 'Input count (v2)',
      '5': 'Output count (v2)',
      '6': 'Transaction modifiable flags (v2)',
      '251': 'PSBT version',
      '252': 'Proprietary',
    },
    input: {
      '0': 'Non-witness UTXO',
      '1': 'Witness UTXO',
      '2': 'Partial signature',
      '3': 'Sighash type',
      '4': 'Redeem script',
      '5': 'Witness script',
      '6': 'BIP32 derivation',
      '7': 'Final scriptSig',
      '8': 'Final script witness',
      '10': 'RIPEMD160 preimage',
      '11': 'SHA256 preimage',
      '12': 'HASH160 preimage',
      '13': 'HASH256 preimage',
      '14': 'Previous txid (v2)',
      '15': 'Output index (v2)',
      '16': 'Sequence (v2)',
      '19': 'Taproot key signature',
      '20': 'Taproot script signature',
      '21': 'Taproot leaf script',
      '22': 'Taproot BIP32 derivation',
      '23': 'Taproot internal key',
      '24': 'Taproot Merkle root',
      '26': 'MuSig2 participant public keys',
      '27': 'MuSig2 public nonce',
      '28': 'MuSig2 partial signature',
      '252': 'Proprietary',
    },
    output: {
      '0': 'Redeem script',
      '1': 'Witness script',
      '2': 'BIP32 derivation',
      '3': 'Amount (v2)',
      '4': 'Script (v2)',
      '5': 'Taproot internal key',
      '6': 'Taproot tree',
      '7': 'Taproot BIP32 derivation',
      '8': 'MuSig2 participant public keys',
      '252': 'Proprietary',
    },
  };
  if (
    chain === 'dash' &&
    ((scope === 'global' && [2n, 3n, 4n, 5n, 6n].includes(type)) ||
      (scope === 'input' && [1n, 5n, 8n, 14n, 15n, 16n, 19n, 20n, 21n, 22n, 23n, 24n, 26n, 27n, 28n].includes(type)) ||
      (scope === 'output' && [1n, 3n, 4n, 5n, 6n, 7n, 8n].includes(type)))
  ) {
    return `Unknown/unsupported Dash field ${type}`;
  }
  return names[scope]?.[type.toString()] ?? `Unknown type ${type}`;
}

export function pairSummary(
  scope: 'global' | 'input' | 'output',
  pair: PsbtPair,
  chain: PsbtChain = 'bitcoin',
): string | null {
  const classicDerivation =
    (scope === 'global' && pair.type === 0x01n) ||
    (scope === 'input' && pair.type === 0x06n) ||
    (scope === 'output' && pair.type === 0x02n);
  if (classicDerivation) return derivationSummary(pair.value, 0);
  const taprootDerivation = (scope === 'input' && pair.type === 0x16n) || (scope === 'output' && pair.type === 0x07n);
  if (taprootDerivation && pair.value.length > 0) {
    const leafHashCount = pair.value[0]!;
    if (leafHashCount >= 0xfd)
      return 'Taproot key origin uses an extended CompactSize leaf-hash count; inspect the raw value.';
    return derivationSummary(pair.value, 1 + leafHashCount * 32);
  }
  if (chain === 'dash') return null;
  if ((scope === 'input' && pair.type === 0x1an) || (scope === 'output' && pair.type === 0x08n)) {
    return `${pair.value.length / 33} compressed participant public key(s) for aggregate key ${bytesToHex(pair.keyData)}`;
  }
  if (scope === 'input' && (pair.type === 0x1bn || pair.type === 0x1cn)) {
    return `${pair.keyData.length === 98 ? 'Tapleaf-scoped' : 'key-path'} MuSig2 ${pair.type === 0x1bn ? 'public nonce' : 'partial signature'} for participant ${bytesToHex(pair.keyData.slice(0, 33))}`;
  }
  return null;
}

function derivationSummary(value: Uint8Array, offset: number): string {
  const remaining = value.length - offset;
  if (remaining < 4 || remaining % 4 !== 0)
    return 'Malformed BIP32 key origin; expected a 4-byte fingerprint followed by zero or more child indexes.';
  const fingerprint = bytesToHex(value.slice(offset, offset + 4));
  const path: string[] = [];
  for (let position = offset + 4; position < value.length; position += 4) {
    const child =
      ((value[position] ?? 0) |
        ((value[position + 1] ?? 0) << 8) |
        ((value[position + 2] ?? 0) << 16) |
        ((value[position + 3] ?? 0) << 24)) >>>
      0;
    const hardened = child >= 0x80000000;
    path.push(`${hardened ? child - 0x80000000 : child}${hardened ? "'" : ''}`);
  }
  return `Master fingerprint ${fingerprint} · path m${path.length === 0 ? '' : `/${path.join('/')}`}`;
}

function payloadAddress(prefix: number, payload: Uint8Array): string {
  const prefixed = new Uint8Array(payload.length + 1);
  prefixed[0] = prefix;
  prefixed.set(payload, 1);
  return encodeBase58Check(prefixed);
}

export function describeScript(
  script: Uint8Array,
  chain: PsbtChain,
  network: PsbtNetwork,
): { type: string; address: string | null } {
  const hex = bytesToHex(script);
  if (/^76a914[0-9a-f]{40}88ac$/u.test(hex)) {
    const prefix = chain === 'dash' ? (network === 'mainnet' ? 0x4c : 0x8c) : network === 'mainnet' ? 0x00 : 0x6f;
    return { type: 'P2PKH', address: payloadAddress(prefix, script.slice(3, 23)) };
  }
  if (/^a914[0-9a-f]{40}87$/u.test(hex)) {
    const prefix = chain === 'dash' ? (network === 'mainnet' ? 0x10 : 0x13) : network === 'mainnet' ? 0x05 : 0xc4;
    return { type: 'P2SH', address: payloadAddress(prefix, script.slice(2, 22)) };
  }
  if (chain === 'bitcoin' && (/^0014[0-9a-f]{40}$/u.test(hex) || /^0020[0-9a-f]{64}$/u.test(hex))) {
    const hrp = network === 'mainnet' ? 'bc' : network === 'regtest' ? 'bcrt' : 'tb';
    return {
      type: script.length === 22 ? 'P2WPKH' : 'P2WSH',
      address: bech32.encode(hrp, [0, ...bech32.toWords(script.slice(2))]),
    };
  }
  if (chain === 'bitcoin' && /^5120[0-9a-f]{64}$/u.test(hex)) {
    const hrp = network === 'mainnet' ? 'bc' : network === 'regtest' ? 'bcrt' : 'tb';
    return { type: 'P2TR', address: bech32m.encode(hrp, [1, ...bech32m.toWords(script.slice(2))]) };
  }
  if (script[0] === 0x6a) return { type: 'OP_RETURN', address: null };
  return { type: 'Non-standard / unrecognized', address: null };
}

export function transactionId(bytes: Uint8Array): string {
  return reverseHex(sha256(sha256(bytes)));
}

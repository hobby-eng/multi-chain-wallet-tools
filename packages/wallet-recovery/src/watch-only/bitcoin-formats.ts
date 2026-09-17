import { descriptorChecksum } from '@ckd/export/descriptor.js';
import { HDKey } from '@scure/bip32';

export type BitcoinWatchMode = 'legacy' | 'nested-segwit' | 'native-segwit' | 'taproot';

const DESCRIPTOR_PATTERNS: ReadonlyArray<{ mode: BitcoinWatchMode; pattern: RegExp }> = [
  {
    mode: 'legacy',
    pattern: /^pkh\(\[([0-9a-f]{8})((?:\/\d+[h']?)*)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/(\d+)\/\*\)#([0-9a-z]{8})$/iu,
  },
  {
    mode: 'nested-segwit',
    pattern:
      /^sh\(wpkh\(\[([0-9a-f]{8})((?:\/\d+[h']?)*)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/(\d+)\/\*\)\)#([0-9a-z]{8})$/iu,
  },
  {
    mode: 'native-segwit',
    pattern: /^wpkh\(\[([0-9a-f]{8})((?:\/\d+[h']?)*)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/(\d+)\/\*\)#([0-9a-z]{8})$/iu,
  },
  {
    mode: 'taproot',
    pattern: /^tr\(\[([0-9a-f]{8})((?:\/\d+[h']?)*)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/(\d+)\/\*\)#([0-9a-z]{8})$/iu,
  },
];

const SLIP132_PUBLIC_VERSIONS = [
  {
    prefix: 'ypub',
    public: 0x049d7cb2,
    private: 0x049d7878,
    network: 'mainnet' as const,
    mode: 'nested-segwit' as const,
    label: 'Bitcoin Nested SegWit · SLIP-132 ypub',
  },
  {
    prefix: 'zpub',
    public: 0x04b24746,
    private: 0x04b2430c,
    network: 'mainnet' as const,
    mode: 'native-segwit' as const,
    label: 'Bitcoin Native SegWit · SLIP-132 zpub',
  },
  {
    prefix: 'upub',
    public: 0x044a5262,
    private: 0x044a4e28,
    network: 'testnet' as const,
    mode: 'nested-segwit' as const,
    label: 'Bitcoin Nested SegWit testnet · SLIP-132 upub',
  },
  {
    prefix: 'vpub',
    public: 0x045f1cf6,
    private: 0x045f18bc,
    network: 'testnet' as const,
    mode: 'native-segwit' as const,
    label: 'Bitcoin Native SegWit testnet · SLIP-132 vpub',
  },
] as const;

export interface ParsedBitcoinDescriptor {
  mode: BitcoinWatchMode;
  fingerprint: string;
  originSuffix: string;
  xpub: string;
  branch: 0 | 1;
}

export function parseBitcoinWatchDescriptor(value: string): ParsedBitcoinDescriptor | null {
  for (const { mode, pattern } of DESCRIPTOR_PATTERNS) {
    const match = pattern.exec(value);
    if (match === null) continue;
    const [fingerprint, originSuffix, xpub, branchText, checksum] = match.slice(1);
    if (descriptorChecksum(value.slice(0, -9)) !== checksum) {
      throw new Error(
        "This descriptor's BIP380 checksum does not match its content; it may have been altered or mistyped.",
      );
    }
    const branch = Number(branchText);
    if (branch !== 0 && branch !== 1) throw new Error('The descriptor branch must be 0 (receive) or 1 (change).');
    return { mode, fingerprint: fingerprint!, originSuffix: originSuffix!, xpub: xpub!, branch };
  }
  return null;
}

export function parseBitcoinSlip132(value: string): {
  node: HDKey;
  network: 'mainnet' | 'testnet';
  mode: BitcoinWatchMode;
  label: string;
} | null {
  const version = SLIP132_PUBLIC_VERSIONS.find(({ prefix }) => value.startsWith(prefix));
  if (version === undefined) return null;
  if (!/^[1-9A-HJ-NP-Za-km-z]{100,120}$/u.test(value))
    throw new Error(`This ${version.prefix} extended public key is malformed.`);
  try {
    return {
      node: HDKey.fromExtendedKey(value, { private: version.private, public: version.public }),
      network: version.network,
      mode: version.mode,
      label: version.label,
    };
  } catch {
    throw new Error(`This ${version.prefix} extended public key is malformed or has an invalid checksum.`);
  }
}

export function bitcoinWatchModeLabel(mode: BitcoinWatchMode): string {
  if (mode === 'legacy') return 'Legacy';
  if (mode === 'nested-segwit') return 'Nested SegWit';
  if (mode === 'native-segwit') return 'Native SegWit';
  return 'Taproot';
}

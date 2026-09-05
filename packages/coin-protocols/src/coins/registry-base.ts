import type { NetworkName } from '@ckd/core/types.js';

export interface CoinDerivationInput {
  seed: Uint8Array;
  network: NetworkName;
  account: number;
  branch: number;
  start: number;
  count: number;
}

export interface ControlOption {
  value: number;
  label: string;
}

export interface BranchControl {
  label: string;
  max: number;
  options?: ControlOption[];
}

export interface AddressBranches {
  receive: number;
  change: number;
}

export interface CoinLimits {
  accountMax?: number;
  startMax?: number;
}

export interface CoinFieldRoles {
  addresses: string[];
  publicKeys: string[];
  privateKeys: string[];
}

/** Extension contract: the UI renders and exports only this protocol-neutral API. */
export interface CoinAdapter {
  id: string;
  group: string;
  label: string;
  variantLabel: string;
  defaultVariant?: boolean;
  networkControl: boolean;
  /** Standard external/internal address branches exposed as Receive/Change result tabs. */
  addressBranches?: AddressBranches;
  branchControl?: BranchControl;
  limits?: CoinLimits;
  accountControl?: boolean;
  controlLabels?: {
    account?: string;
    start?: string;
    count?: string;
  };
  /** Internal work chunk. This is not a user-visible total-result limit. */
  batchSize?: number;
  defaults: { network: NetworkName; account: number; branch: number; start: number; count: number };
  fieldRoles: CoinFieldRoles;
  /** Optional protocol-specific equality (for example EVM hexadecimal address case). */
  addressesEqual?(derived: string, expected: string): boolean;
  pathPreview(input: Omit<CoinDerivationInput, 'seed'>): string;
}

export interface CoinFamily {
  id: string;
  label: string;
  adapters: readonly CoinAdapter[];
}

export const BIP44_ADDRESS_BRANCHES: AddressBranches = { receive: 0, change: 1 };

export const TRANSPARENT_ROLES: CoinFieldRoles = {
  addresses: ['address'],
  publicKeys: [
    'publicKey',
    'compressedPublicKey',
    'internalPublicKey',
    'taprootOutputPublicKey',
    'taprootOutputCompressedPublicKey',
    'childXpub',
  ],
  privateKeys: [
    'privateKey',
    'privateKeyHex',
    'privateKeyWif',
    'childPrivateKey',
    'taprootOutputPrivateKey',
    'taprootOutputPrivateKeyWif',
    'childXprv',
  ],
};

export function indexRange(start: number, count: number): string {
  return count > 1 ? `${start}…${start + count - 1}` : String(start);
}

function familyId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

export function createCoinRegistry(coinAdapters: readonly CoinAdapter[]) {
  const coinFamilies: readonly CoinFamily[] = [...new Set(coinAdapters.map(({ group }) => group))]
    .sort((left, right) => left === 'Dash' ? -1 : right === 'Dash' ? 1 : 0)
    .map((label) => ({
      id: familyId(label),
      label,
      adapters: coinAdapters.filter(({ group }) => group === label),
    }));

  return {
    COIN_ADAPTERS: coinAdapters,
    COIN_FAMILIES: coinFamilies,
    getCoinFamily(id: string): CoinFamily {
      const family = coinFamilies.find((candidate) => candidate.id === id);
      if (family === undefined) throw new Error(`Unsupported coin family: ${id}.`);
      return family;
    },
    getDefaultCoinAdapter(id: string): CoinAdapter {
      const family = coinFamilies.find((candidate) => candidate.id === id);
      if (family === undefined) throw new Error(`Unsupported coin family: ${id}.`);
      const defaults = family.adapters.filter(({ defaultVariant }) => defaultVariant === true);
      if (defaults.length > 1) {
        throw new Error(`Coin family ${family.label} declares more than one default derivation variant.`);
      }
      return defaults[0] ?? family.adapters[0]!;
    },
    getAdapterFamilyId(adapter: CoinAdapter): string {
      return familyId(adapter.group);
    },
    getCoinAdapter(id: string): CoinAdapter {
      const adapter = coinAdapters.find((candidate) => candidate.id === id);
      if (adapter === undefined) throw new Error(`Unsupported derivation protocol: ${id}.`);
      return adapter;
    },
  };
}

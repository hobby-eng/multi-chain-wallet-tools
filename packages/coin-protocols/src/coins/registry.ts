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

const BIP44_ADDRESS_BRANCHES: AddressBranches = { receive: 0, change: 1 };

const ETHEREUM_ADDRESS_BRANCH_CONTROL: BranchControl = {
  label: 'Address branch',
  max: 1,
  options: [
    { value: 0, label: '0 — common EOA path' },
    { value: 1, label: '1 — alternate path' },
  ],
};

const TRANSPARENT_ROLES: CoinFieldRoles = {
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

function indexRange(start: number, count: number): string {
  return count > 1 ? `${start}…${start + count - 1}` : String(start);
}

function bitcoinAdapter(
  id: string,
  label: string,
  variantLabel: string,
  purpose: number,
  defaultVariant = false,
): CoinAdapter {
  return {
    id,
    group: 'Bitcoin',
    label,
    variantLabel,
    defaultVariant,
    networkControl: true,
    addressBranches: BIP44_ADDRESS_BRANCHES,
    defaults: { network: 'mainnet', account: 0, branch: 0, start: 0, count: 20 },
    fieldRoles: TRANSPARENT_ROLES,
    pathPreview: ({ network, account, branch, start, count }) =>
      `m/${purpose}'/${network === 'mainnet' ? 0 : 1}'/${account}'/${branch}/${indexRange(start, count)}`,
  };
}

export const COIN_ADAPTERS: readonly CoinAdapter[] = [
  bitcoinAdapter('bitcoin-legacy', 'Legacy · BIP44 / P2PKH', 'Legacy · BIP44', 44),
  bitcoinAdapter('bitcoin-nested-segwit', 'Nested SegWit · BIP49 / P2SH-P2WPKH', 'Nested SegWit · BIP49', 49),
  bitcoinAdapter('bitcoin-native-segwit', 'Native SegWit · BIP84 / P2WPKH', 'Native SegWit · BIP84', 84),
  bitcoinAdapter('bitcoin-taproot', 'Taproot · BIP86 / P2TR', 'Taproot · BIP86', 86, true),
  {
    id: 'ethereum',
    group: 'Ethereum',
    label: 'Ethereum EOA · BIP44',
    variantLabel: 'EOA · BIP44',
    defaultVariant: true,
    networkControl: false,
    branchControl: ETHEREUM_ADDRESS_BRANCH_CONTROL,
    defaults: { network: 'mainnet', account: 0, branch: 0, start: 0, count: 20 },
    fieldRoles: TRANSPARENT_ROLES,
    addressesEqual: (derived, expected) => derived.toLowerCase() === expected.toLowerCase(),
    pathPreview: ({ account, branch, start, count }) =>
      `m/44'/60'/${account}'/${branch}/${indexRange(start, count)}`,
  },
  {
    id: 'dash-core',
    group: 'Dash',
    label: 'Dash Core · BIP44 / P2PKH',
    variantLabel: 'Core · BIP44',
    defaultVariant: true,
    networkControl: true,
    addressBranches: BIP44_ADDRESS_BRANCHES,
    defaults: { network: 'mainnet', account: 0, branch: 0, start: 0, count: 20 },
    fieldRoles: TRANSPARENT_ROLES,
    pathPreview: ({ network, account, branch, start, count }) =>
      `m/44'/${network === 'mainnet' ? 5 : 1}'/${account}'/${branch}/${indexRange(start, count)}`,
  },
  {
    id: 'dash-platform',
    group: 'Dash',
    label: 'Dash Platform · DIP17 / DIP18',
    variantLabel: 'Platform · DIP17 / DIP18',
    networkControl: true,
    branchControl: { label: 'Key class', max: 2_147_483_647 },
    defaults: { network: 'mainnet', account: 0, branch: 0, start: 0, count: 20 },
    fieldRoles: TRANSPARENT_ROLES,
    pathPreview: ({ network, account, branch, start, count }) =>
      `m/9'/${network === 'mainnet' ? 5 : 1}'/17'/${account}'/${branch}'/${indexRange(start, count)}`,
  },
  {
    id: 'dash-identity',
    group: 'Dash',
    label: 'Dash Platform Identity · DIP13',
    variantLabel: 'Identity · DIP13',
    networkControl: true,
    accountControl: false,
    controlLabels: {
      start: 'Start Identity index',
      count: 'Number of Identity candidates',
    },
    defaults: { network: 'mainnet', account: 0, branch: 0, start: 0, count: 5 },
    fieldRoles: {
      addresses: [],
      publicKeys: [
        'key0PublicKey',
        'key1PublicKey',
        'key2PublicKey',
        'key3PublicKey',
      ],
      privateKeys: [
        'key0PrivateKeyWif',
        'key0PrivateKeyHex',
        'key1PrivateKeyWif',
        'key1PrivateKeyHex',
        'key2PrivateKeyWif',
        'key2PrivateKeyHex',
        'key3PrivateKeyWif',
        'key3PrivateKeyHex',
      ],
    },
    pathPreview: ({ network, start, count }) => {
      const identity = count > 1 ? `{${start}'…${start + count - 1}'}` : `${start}'`;
      return `m/9'/${network === 'mainnet' ? 5 : 1}'/5'/0'/0'/${identity}/{0'…3'}`;
    },
  },
  {
    id: 'dash-shielded',
    group: 'Dash',
    label: 'Dash Shielded · Orchard / ZIP-32',
    variantLabel: 'Shielded · Orchard / ZIP-32',
    networkControl: true,
    limits: { startMax: 0xffff_ffff },
    defaults: { network: 'mainnet', account: 0, branch: 0, start: 0, count: 20 },
    fieldRoles: {
      addresses: ['address'],
      publicKeys: [],
      // Viewing keys are intentionally not classified as private/spending keys.
      // They remain available in Advanced mode and selected/all-field exports.
      privateKeys: ['spendingKey'],
    },
    pathPreview: ({ network, account, start, count }) =>
      `m/32'/${network === 'mainnet' ? 5 : 1}'/${account}' · external diversifier ${indexRange(start, count)}`,
  },
] as const;

export interface CoinFamily {
  id: string;
  label: string;
  adapters: readonly CoinAdapter[];
}

function familyId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

export const COIN_FAMILIES: readonly CoinFamily[] = [...new Set(COIN_ADAPTERS.map(({ group }) => group))]
  .sort((left, right) => left === 'Dash' ? -1 : right === 'Dash' ? 1 : 0)
  .map((label) => ({
    id: familyId(label),
    label,
    adapters: COIN_ADAPTERS.filter(({ group }) => group === label),
  }));

export function getCoinFamily(id: string): CoinFamily {
  const family = COIN_FAMILIES.find((candidate) => candidate.id === id);
  if (family === undefined) throw new Error(`Unsupported coin family: ${id}.`);
  return family;
}

export function getDefaultCoinAdapter(familyIdValue: string): CoinAdapter {
  const family = getCoinFamily(familyIdValue);
  const defaults = family.adapters.filter(({ defaultVariant }) => defaultVariant === true);
  if (defaults.length > 1) {
    throw new Error(`Coin family ${family.label} declares more than one default derivation variant.`);
  }
  return defaults[0] ?? family.adapters[0]!;
}

export function getAdapterFamilyId(adapter: CoinAdapter): string {
  return familyId(adapter.group);
}

export function getCoinAdapter(id: string): CoinAdapter {
  const adapter = COIN_ADAPTERS.find((candidate) => candidate.id === id);
  if (adapter === undefined) throw new Error(`Unsupported derivation protocol: ${id}.`);
  return adapter;
}

import { DIP17_PAYMENT_CHAINS } from '../dash/platform-paths.js';
import {
  BIP44_ADDRESS_BRANCHES,
  indexRange,
  TRANSPARENT_ROLES,
  type CoinAdapter,
} from '../registry-base.js';

export const DASH_COIN_ADAPTERS: readonly CoinAdapter[] = [
  {
    id: 'dash-core',
    group: 'Dash',
    label: 'Dash Core · BIP44 / P2PKH',
    variantLabel: 'Core · BIP44',
    defaultVariant: true,
    networkControl: true,
    addressBranches: BIP44_ADDRESS_BRANCHES,
    coinJoin: {
      branches: { external: 0, internal: 1 },
      workerAdapterId: 'dash-core-coinjoin',
      pathPreview: ({ network, account, start, count }) => {
        const coinType = network === 'mainnet' ? 5 : 1;
        const range = indexRange(start, count);
        return {
          external: `m/9'/${coinType}'/4'/${account}'/0/${range}`,
          internal: `m/9'/${coinType}'/4'/${account}'/1/${range}`,
        };
      },
    },
    defaults: { network: 'mainnet', account: 0, branch: 0, start: 0, count: 20 },
    fieldRoles: TRANSPARENT_ROLES,
    pathPreview: ({ network, account, branch, start, count }) =>
      `m/44'/${network === 'mainnet' ? 5 : 1}'/${account}'/${branch}/${indexRange(start, count)}`,
  },
  {
    id: 'dash-legacy-mobile',
    group: 'Dash',
    label: 'Dash Core · legacy mobile',
    variantLabel: 'Legacy mobile Core',
    networkControl: true,
    accountControl: false,
    addressBranches: BIP44_ADDRESS_BRANCHES,
    defaults: { network: 'mainnet', account: 0, branch: 0, start: 0, count: 20 },
    fieldRoles: TRANSPARENT_ROLES,
    pathPreview: ({ branch, start, count }) =>
      `m/0'/${branch}/${indexRange(start, count)}`,
  },
  {
    id: 'dash-platform',
    group: 'Dash',
    label: 'Dash Platform · DIP17 / DIP18',
    variantLabel: 'Platform · DIP17 / DIP18',
    networkControl: true,
    addressBranches: {
      receive: DIP17_PAYMENT_CHAINS[0].keyClass,
      change: DIP17_PAYMENT_CHAINS[1].keyClass,
      help: "Also derives the optional internal/change addresses in a separate result tab. Platform uses hardened classes 0' (receive) and 1' (internal); each has its own public export key.",
    },
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
      publicKeys: ['key0PublicKey', 'key1PublicKey', 'key2PublicKey', 'key3PublicKey'],
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
      privateKeys: ['spendingKey'],
    },
    pathPreview: ({ network, account, start, count }) =>
      `m/32'/${network === 'mainnet' ? 5 : 1}'/${account}' · external diversifier ${indexRange(start, count)}`,
  },
] as const;

import type { NetworkName } from './types.js';

export interface Bip32Versions {
  private: number;
  public: number;
}

export interface BitcoinNetwork {
  name: NetworkName;
  label: string;
  coinType: number;
  p2pkh: number;
  p2sh: number;
  wif: number;
  bech32Hrp: string;
  versions: Bip32Versions;
}

export interface DashNetwork {
  name: NetworkName;
  label: string;
  coinType: number;
  p2pkh: number;
  p2sh: number;
  wif: number;
  platformHrp: string;
  versions: Bip32Versions;
}

const MAIN_VERSIONS = { private: 0x0488ade4, public: 0x0488b21e } as const;
const TEST_VERSIONS = { private: 0x04358394, public: 0x043587cf } as const;

export const BITCOIN_NETWORKS: Record<NetworkName, BitcoinNetwork> = {
  mainnet: {
    name: 'mainnet',
    label: 'Bitcoin mainnet',
    coinType: 0,
    p2pkh: 0x00,
    p2sh: 0x05,
    wif: 0x80,
    bech32Hrp: 'bc',
    versions: MAIN_VERSIONS,
  },
  testnet: {
    name: 'testnet',
    label: 'Bitcoin testnet',
    coinType: 1,
    p2pkh: 0x6f,
    p2sh: 0xc4,
    wif: 0xef,
    bech32Hrp: 'tb',
    versions: TEST_VERSIONS,
  },
};

// Verified against Dash Core chainparams.cpp (current master, 2026-09-01).
// Dash Core now deliberately uses Bitcoin's xpub/xprv version bytes on mainnet.
export const DASH_NETWORKS: Record<NetworkName, DashNetwork> = {
  mainnet: {
    name: 'mainnet',
    label: 'Dash mainnet',
    coinType: 5,
    p2pkh: 76,
    p2sh: 16,
    wif: 204,
    platformHrp: 'dash',
    versions: MAIN_VERSIONS,
  },
  testnet: {
    name: 'testnet',
    label: 'Dash testnet',
    coinType: 1,
    p2pkh: 140,
    p2sh: 19,
    wif: 239,
    platformHrp: 'tdash',
    versions: TEST_VERSIONS,
  },
};

export function getBitcoinNetwork(name: NetworkName): BitcoinNetwork {
  const network = (BITCOIN_NETWORKS as Partial<Record<string, BitcoinNetwork>>)[name];
  if (network === undefined) throw new Error(`Unsupported Bitcoin network: ${String(name)}.`);
  return network;
}

export function getDashNetwork(name: NetworkName): DashNetwork {
  const network = (DASH_NETWORKS as Partial<Record<string, DashNetwork>>)[name];
  if (network === undefined) throw new Error(`Unsupported Dash network: ${String(name)}.`);
  return network;
}

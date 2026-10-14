import type { NetworkName } from "./types.js";
import { BITCOIN_ADDRESS_FACTS } from "./bitcoin-address-facts.js";
import { dashPlatformHrp } from "./dash-platform-address-facts.js";

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

/** The BIP32 serialization versions of extended keys: xprv/xpub on mainnet, tprv/tpub on testnet. */
export const BIP32_MAINNET_VERSIONS = { private: 0x0488ade4, public: 0x0488b21e } as const;
export const BIP32_TESTNET_VERSIONS = { private: 0x04358394, public: 0x043587cf } as const;

/** The versions of a network's extended keys; testnet and regtest share tprv/tpub. */
export function bip32VersionsFor(network: string): Bip32Versions {
  return network === "mainnet" ? BIP32_MAINNET_VERSIONS : BIP32_TESTNET_VERSIONS;
}

// Only private literal metadata is read here. The pure annotation lets a Dash-only build
// discard this table, including object-spread reads the bundler cannot prove harmless itself.
const BITCOIN_NETWORKS = /* @__PURE__ */ ((): Record<NetworkName, BitcoinNetwork> => ({
  mainnet: {
    name: "mainnet",
    label: "Bitcoin mainnet",
    coinType: 0,
    ...BITCOIN_ADDRESS_FACTS.mainnet,
    wif: 0x80,
    versions: BIP32_MAINNET_VERSIONS,
  },
  testnet: {
    name: "testnet",
    label: "Bitcoin testnet",
    coinType: 1,
    ...BITCOIN_ADDRESS_FACTS.testnet,
    wif: 0xef,
    versions: BIP32_TESTNET_VERSIONS,
  },
}))();

// Verified against Dash Core chainparams.cpp (current master, 2026-09-01).
// Dash Core now deliberately uses Bitcoin's xpub/xprv version bytes on mainnet.
const DASH_NETWORKS = /* @__PURE__ */ ((): Record<NetworkName, DashNetwork> => ({
  mainnet: {
    name: "mainnet",
    label: "Dash mainnet",
    coinType: 5,
    p2pkh: 76,
    p2sh: 16,
    wif: 204,
    platformHrp: dashPlatformHrp("mainnet"),
    versions: BIP32_MAINNET_VERSIONS,
  },
  testnet: {
    name: "testnet",
    label: "Dash testnet",
    coinType: 1,
    p2pkh: 140,
    p2sh: 19,
    wif: 239,
    platformHrp: dashPlatformHrp("testnet"),
    versions: BIP32_TESTNET_VERSIONS,
  },
}))();

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

import type { NetworkName } from "./types.js";

/** Public address facts only: safe to import from connected validation code. */
export interface BitcoinAddressFacts {
  readonly p2pkh: number;
  readonly p2sh: number;
  readonly bech32Hrp: string;
}

export const BITCOIN_ADDRESS_FACTS = Object.freeze({
  mainnet: Object.freeze({ p2pkh: 0x00, p2sh: 0x05, bech32Hrp: "bc" }),
  testnet: Object.freeze({ p2pkh: 0x6f, p2sh: 0xc4, bech32Hrp: "tb" }),
});

export function getBitcoinAddressFacts(network: NetworkName): BitcoinAddressFacts {
  if (network !== "mainnet" && network !== "testnet")
    throw new Error(`Unsupported Bitcoin network: ${String(network)}.`);
  return BITCOIN_ADDRESS_FACTS[network];
}

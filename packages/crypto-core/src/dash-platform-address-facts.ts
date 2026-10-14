import type { NetworkName } from "./types.js";
import { ADDRESS_HASH_BYTES, HASH_ADDRESS_PAYLOAD_BYTES } from "./address-parameters.js";

// DIP18 payment display tags and DPP hash payload geometry. No derivation or private key code.
export const DASH_PLATFORM_P2PKH_TYPE = 0xb0;
export const DASH_PLATFORM_P2SH_TYPE = 0x80;
export const DASH_PLATFORM_HASH_BYTES = ADDRESS_HASH_BYTES;
export const DASH_PLATFORM_PAYLOAD_BYTES = HASH_ADDRESS_PAYLOAD_BYTES;
export const DASH_PLATFORM_P2PKH_LABEL = `0x${DASH_PLATFORM_P2PKH_TYPE.toString(16)} (P2PKH)`;

const PLATFORM_HRPS = Object.freeze({ mainnet: "dash", testnet: "tdash" });

export function dashPlatformHrp(network: NetworkName): string {
  if (network !== "mainnet" && network !== "testnet")
    throw new Error(`Unsupported Dash network: ${String(network)}.`);
  return PLATFORM_HRPS[network];
}

export function isDashPlatformPaymentType(value: number): boolean {
  return value === DASH_PLATFORM_P2PKH_TYPE || value === DASH_PLATFORM_P2SH_TYPE;
}

import { DASH_ADDRESS_FAMILIES } from "@ckd/coins/dash/address-families.js";
import { bech32m, createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import type { NetworkName } from "@ckd/core/types.js";
import { detectMatcherTargets, type MatcherCoin } from "./matcher-targets.js";
import type { WalletMatcherTargetDetector } from "./matcher-types.js";

const base58check = createBase58check(sha256);

function detectDashAddress(
  address: string,
  network: NetworkName,
): { readonly normalized: string; readonly adapters: readonly string[] } | null {
  try {
    const payload = base58check.decode(address);
    const expected = network === "mainnet" ? 76 : 140;
    if (payload.length === 21 && payload[0] === expected) {
      return {
        normalized: address,
        adapters: DASH_ADDRESS_FAMILIES.coreAdapters(),
      };
    }
  } catch {
    // A valid Platform or Orchard address is Bech32m rather than Base58Check.
  }
  try {
    const decoded = bech32m.decode(address, 200);
    const expectedHrp = network === "mainnet" ? "dash" : "tdash";
    if (decoded.prefix !== expectedHrp) return null;
    const payload = bech32m.fromWords(decoded.words);
    if (payload[0] === 0xb0 && payload.length === 21) {
      return { normalized: address.toLowerCase(), adapters: ["dash-platform"] };
    }
    if (payload[0] === 0x10 && payload.length === 44) {
      return { normalized: address.toLowerCase(), adapters: ["dash-shielded"] };
    }
  } catch {
    // Report the common validation error below.
  }
  return null;
}

/** Dash's part of the matcher: Core, Platform and Orchard addresses, and identity key hashes. */
export const DASH_MATCHER: MatcherCoin = {
  recognize(value, network) {
    // An identity is found by the HASH160 of one of its keys, compared with derived key fields.
    if (/^[0-9a-f]{40}$/iu.test(value))
      return {
        input: value,
        normalized: value.toLowerCase(),
        network,
        adapterIds: ["dash-identity"],
        fieldKeys: ["key0PublicKeyHash"],
      };
    const detected = detectDashAddress(value, network);
    return detected === null
      ? null
      : { input: value, normalized: detected.normalized, network, adapterIds: detected.adapters };
  },
  addressAdapters: DASH_ADDRESS_FAMILIES.addressAdapters(),
};

/** The matcher targets of the Dash Community Edition. */
export const detectDashMatcherTargets: WalletMatcherTargetDetector = (
  input,
  network,
  forceAllProfiles,
) => detectMatcherTargets(input, network, forceAllProfiles, [DASH_MATCHER]);

// Litecoin's message signing: Litecoin Core's compact signature for L… addresses, and BIP137's
// typed headers for its SegWit addresses, as Trezor writes them (Litecoin Core verifies P2PKH
// only); verification also reads Electrum-LTC's untyped headers on SegWit addresses.
import type { CompactScriptType } from "@ckd/core/compact-message-headers.js";
import { compactCoinSigning } from "../message-signing-compact.js";
import { litecoinKeys } from "./index.js";
import { LITECOIN_PROFILES } from "./profiles.js";

/** The purpose of the Litecoin variant whose addresses each script type has. */
const PURPOSES: Readonly<Record<CompactScriptType, number>> = Object.freeze({
  p2pkh: 44,
  "p2sh-p2wpkh": 49,
  p2wpkh: 84,
});

/** Litecoin's formats, one per address type of its variants. */
export const LITECOIN_MESSAGE_SIGNING = compactCoinSigning({
  magic: "Litecoin Signed Message:\n",
  headers: "bip137",
  keys: (type) => {
    const profile = LITECOIN_PROFILES.find((candidate) => candidate.purpose === PURPOSES[type]);
    return profile === undefined ? undefined : litecoinKeys(profile);
  },
  formats: {
    "litecoin-compact-legacy": { name: "Litecoin Core signmessage", signingType: "p2pkh" },
    "litecoin-compact-nested": {
      name: "BIP137 P2SH-P2WPKH (Litecoin)",
      signingType: "p2sh-p2wpkh",
    },
    "litecoin-compact-native": { name: "BIP137 P2WPKH (Litecoin)", signingType: "p2wpkh" },
  },
});

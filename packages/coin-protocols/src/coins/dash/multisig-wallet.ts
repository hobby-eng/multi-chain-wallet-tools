import { bech32m } from "@scure/base";
import { concatBytes, encodeP2sh, encodeWif, hash160 } from "@ckd/core/crypto.js";
import { DASH_PLATFORM_P2SH_TYPE } from "@ckd/core/dash-platform-address-facts.js";
import { getDashNetwork } from "@ckd/core/networks.js";
import { paymentAddressField } from "@ckd/core/types.js";
import type { MultisigScheme } from "../multisig-wallet.js";
import { DASH_CORE_PATHS, DASH_MULTISIG_PATHS } from "./profiles.js";

/** DIP18's Platform P2SH address: bech32m of 0x80 || HASH160(redeem script). */
export function encodePlatformP2sh(scriptHash: Uint8Array, hrp: string): string {
  if (scriptHash.length !== 20) throw new Error("A Platform P2SH hash must be 20 bytes.");
  return bech32m.encode(
    hrp,
    bech32m.toWords(concatBytes(Uint8Array.of(DASH_PLATFORM_P2SH_TYPE), scriptHash)),
  );
}

/**
 * Dash's only multisig form is P2SH: Dash has no segwit. One redeem script gives the Core address
 * (7… or 8…) and, with the same HASH160, the Platform address (dash1s… or tdash1s…), which
 * Platform spends with exactly this bare OP_CHECKMULTISIG script. Fifteen compressed keys fill the
 * 520-byte limit of a P2SH redeem script.
 */
export const DASH_P2SH_MULTISIG: MultisigScheme = {
  id: "dash-p2sh",
  label: "Dash P2SH multisig",
  maxKeys: 15,
  cosignerPaths: [
    {
      id: "core",
      label: "Dash Core signer · m/44'/coin'/account'",
      path: (network, account) => DASH_CORE_PATHS.accountPath({ network, account }),
    },
    {
      id: "purpose48",
      label: "Purpose48 · m/48'/coin'/account'/0'",
      path: (network, account) => DASH_MULTISIG_PATHS.accountPath({ network, account }),
    },
  ],
  versions: (network) => getDashNetwork(network).versions,
  descriptor: (inner) => `sh(${inner})`,
  outputs(script, network) {
    const dash = getDashNetwork(network);
    const scriptHash = hash160(script);
    return [
      paymentAddressField(
        "address",
        "Dash Core address (P2SH)",
        encodeP2sh(scriptHash, dash.p2sh),
        "dash",
      ),
      paymentAddressField(
        "platformAddress",
        "Dash Platform address (P2SH)",
        encodePlatformP2sh(scriptHash, dash.platformHrp),
      ),
    ];
  },
  wif: (privateKey, network) => encodeWif(privateKey, getDashNetwork(network).wif),
};

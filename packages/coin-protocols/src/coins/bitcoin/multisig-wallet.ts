import { bech32 } from "@scure/base";
import {
  bytesToHex,
  concatBytes,
  encodeP2sh,
  encodeWif,
  hash160,
  sha256,
} from "@ckd/core/crypto.js";
import { getBitcoinNetwork } from "@ckd/core/networks.js";
import { field, paymentAddressField, type NetworkName } from "@ckd/core/types.js";
import type { MultisigCosignerPath, MultisigScheme } from "../multisig-wallet.js";

function bip48(scriptType: 0 | 1 | 2, label: string): MultisigCosignerPath {
  return {
    id: `bip48-${scriptType}`,
    label,
    path: (network: NetworkName, account: number) =>
      `m/48'/${getBitcoinNetwork(network).coinType}'/${account}'/${scriptType}'`,
  };
}

const versions = (network: NetworkName) => getBitcoinNetwork(network).versions;
const wif = (privateKey: Uint8Array, network: NetworkName) =>
  encodeWif(privateKey, getBitcoinNetwork(network).wif);

function p2wshAddress(witnessScript: Uint8Array, network: NetworkName): string {
  return bech32.encode(getBitcoinNetwork(network).bech32Hrp, [
    0,
    ...bech32.toWords(sha256(witnessScript)),
  ]);
}

/** BIP48 script type 2': native SegWit P2WSH, `wsh(sortedmulti(…))`, at most 20 keys. */
export const BITCOIN_P2WSH_MULTISIG: MultisigScheme = {
  id: "bitcoin-p2wsh",
  label: "Bitcoin P2WSH multisig",
  maxKeys: 20,
  cosignerPaths: [bip48(2, "BIP48 P2WSH · m/48'/coin'/account'/2'")],
  versions,
  descriptor: (inner) => `wsh(${inner})`,
  outputs: (script, network) => [
    paymentAddressField("address", "Address (P2WSH)", p2wshAddress(script, network), "bitcoin"),
  ],
  wif,
};

/** BIP48 script type 1': P2SH-wrapped P2WSH, `sh(wsh(sortedmulti(…)))`, at most 20 keys. */
export const BITCOIN_P2SH_P2WSH_MULTISIG: MultisigScheme = {
  id: "bitcoin-p2sh-p2wsh",
  label: "Bitcoin P2SH-P2WSH multisig",
  maxKeys: 20,
  cosignerPaths: [bip48(1, "BIP48 P2SH-P2WSH · m/48'/coin'/account'/1'")],
  versions,
  descriptor: (inner) => `sh(wsh(${inner}))`,
  outputs(script, network) {
    const redeemScript = concatBytes(Uint8Array.of(0x00, 0x20), sha256(script));
    return [
      paymentAddressField(
        "address",
        "Address (P2SH-P2WSH)",
        encodeP2sh(hash160(redeemScript), getBitcoinNetwork(network).p2sh),
        "bitcoin",
      ),
      field("p2shRedeemScript", "P2SH redeem script", bytesToHex(redeemScript)),
    ];
  },
  wif,
};

/** Legacy P2SH, `sh(sortedmulti(…))`, at most 15 compressed keys (520-byte redeem script). */
export const BITCOIN_P2SH_MULTISIG: MultisigScheme = {
  id: "bitcoin-p2sh",
  label: "Bitcoin legacy P2SH multisig",
  maxKeys: 15,
  cosignerPaths: [
    bip48(0, "Trezor legacy · m/48'/coin'/account'/0'"),
    {
      id: "electrum-45",
      label: "Electrum legacy · m/45'/0",
      path: () => "m/45'/0",
    },
  ],
  versions,
  descriptor: (inner) => `sh(${inner})`,
  outputs: (script, network) => [
    paymentAddressField(
      "address",
      "Address (P2SH)",
      encodeP2sh(hash160(script), getBitcoinNetwork(network).p2sh),
      "bitcoin",
    ),
  ],
  wif,
};

export const BITCOIN_MULTISIG_SCHEMES: readonly MultisigScheme[] = [
  BITCOIN_P2WSH_MULTISIG,
  BITCOIN_P2SH_P2WSH_MULTISIG,
  BITCOIN_P2SH_MULTISIG,
];

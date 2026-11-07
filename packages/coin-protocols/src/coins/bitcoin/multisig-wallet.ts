import { HDKey } from "@scure/bip32";
import { bech32 } from "@scure/base";
import { NETWORK, TEST_NETWORK, TAPROOT_UNSPENDABLE_KEY, p2tr, p2tr_ms } from "@scure/btc-signer";
import { keyAggregate, sortKeys } from "@scure/btc-signer/musig2.js";
import {
  bytesToHex,
  concatBytes,
  encodeP2sh,
  encodeWif,
  hash160,
  hexToBytes,
  sha256,
} from "@ckd/core/crypto.js";
import { getBitcoinNetwork } from "@ckd/core/networks.js";
import { field, paymentAddressField, type NetworkName } from "@ckd/core/types.js";
import type { MultisigCosignerPath, MultisigScheme } from "../multisig-wallet.js";

function bip48(scriptType: 0 | 1 | 2 | 3, label: string): MultisigCosignerPath {
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

/**
 * Taproot cosigner paths. BIP48 defines no Taproot script type: 3' is the proposed extension that
 * some wallets use (bitcoin/bips#1473), and BIP87's m/87'/coin'/account' is the generic multisig path.
 */
const TAPROOT_PATHS: readonly MultisigCosignerPath[] = [
  bip48(3, "BIP48 Taproot (proposed 3') · m/48'/coin'/account'/3'"),
  {
    id: "bip87",
    label: "BIP87 · m/87'/coin'/account'",
    path: (network: NetworkName, account: number) =>
      `m/87'/${getBitcoinNetwork(network).coinType}'/${account}'`,
  },
];

const btcSignerNetwork = (network: NetworkName) => (network === "mainnet" ? NETWORK : TEST_NETWORK);
const xOnly = (key: Uint8Array) => key.slice(1);

/** BIP341's provably unspendable internal key H: the script path is the only way to spend. */
const NUMS_KEY_HEX = bytesToHex(TAPROOT_UNSPENDABLE_KEY);

/** Order of compressed keys by their x-only form, the keys that Tapscript's multi_a commits to. */
function sortByXOnly(keys: readonly Uint8Array[]): Uint8Array[] {
  return [...keys].sort((left, right) => {
    const a = bytesToHex(xOnly(left));
    const b = bytesToHex(xOnly(right));
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * Taproot script-path multisig, `tr(H, sortedmulti_a(m, …))` (BIP386/BIP387): one Tapscript leaf
 * `<k1> OP_CHECKSIG <k2> OP_CHECKSIGADD … <m> OP_NUMEQUAL` under BIP341's unspendable internal key.
 */
export const BITCOIN_P2TR_MULTI_A_MULTISIG: MultisigScheme = {
  id: "bitcoin-p2tr-multi-a",
  label: "Bitcoin Taproot multisig (multi_a)",
  maxKeys: 20,
  cosignerPaths: TAPROOT_PATHS,
  versions,
  keyList: "multi_a",
  descriptor: (inner) => `tr(${NUMS_KEY_HEX},${inner})`,
  sortKeys: sortByXOnly,
  script(required, keys) {
    if (!Number.isSafeInteger(required) || required < 1 || required > keys.length)
      throw new Error("The required signatures must be between 1 and the number of cosigners.");
    return p2tr_ms(required, keys.map(xOnly)).script;
  },
  outputs: (script, network) => [
    paymentAddressField(
      "address",
      "Address (P2TR, script path)",
      p2tr(TAPROOT_UNSPENDABLE_KEY, { script }, btcSignerNetwork(network)).address!,
      "bitcoin",
    ),
  ],
  wif,
};

/** BIP328's chain code of an aggregate MuSig2 key: SHA256("MuSig2MuSig2MuSig2"). */
const MUSIG2_CHAIN_CODE = hexToBytes(
  "868087ca02a6f974c4598924c36b57762d32cb45717167e300622c7167e38965",
);

/**
 * MuSig2 key-path Taproot, `tr(musig(…)/branch/*)` (BIP327, BIP328, draft BIP390): the cosigners'
 * account keys, sorted, aggregate into one key; its BIP328 node derives each address, which looks
 * like a single-key Taproot address. Every cosigner must sign.
 */
export const BITCOIN_P2TR_MUSIG2_MULTISIG: MultisigScheme = {
  id: "bitcoin-p2tr-musig2",
  label: "Bitcoin Taproot MuSig2 (n-of-n, draft BIP390)",
  maxKeys: 20,
  cosignerPaths: TAPROOT_PATHS,
  versions,
  descriptor: (inner) => `tr(${inner})`,
  aggregate(accounts, network) {
    const aggregateKey = keyAggregate(
      sortKeys(accounts.map((account) => account.publicKey!)),
    ).aggPublicKey.toBytes(true);
    return new HDKey({
      versions: versions(network),
      publicKey: aggregateKey,
      chainCode: MUSIG2_CHAIN_CODE,
    });
  },
  outputs: (key, network) => [
    paymentAddressField(
      "address",
      "Address (P2TR, key path)",
      p2tr(xOnly(key), undefined, btcSignerNetwork(network)).address!,
      "bitcoin",
    ),
  ],
  wif,
};

export const BITCOIN_MULTISIG_SCHEMES: readonly MultisigScheme[] = [
  BITCOIN_P2WSH_MULTISIG,
  BITCOIN_P2SH_P2WSH_MULTISIG,
  BITCOIN_P2SH_MULTISIG,
  BITCOIN_P2TR_MULTI_A_MULTISIG,
  BITCOIN_P2TR_MUSIG2_MULTISIG,
];

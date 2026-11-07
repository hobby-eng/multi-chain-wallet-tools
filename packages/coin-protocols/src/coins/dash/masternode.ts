import type { HDKey } from "@scure/bip32";
import { assertBatch, rootFromSeed } from "@ckd/core/bip32.js";
import { bytesToHex, encodeP2pkh, encodeWif, wipe } from "@ckd/core/crypto.js";
import { getDashNetwork } from "@ckd/core/networks.js";
import {
  field,
  type Bip32BatchOptions,
  type DerivationResult,
  type NetworkName,
  type ResultFieldGroup,
} from "@ckd/core/types.js";
import { DashBlsHdKey, platformNodeId, Slip10Ed25519Key } from "./masternode-keys.js";
import { secp256k1PathKey } from "./path-key.js";
import {
  DASH_MASTERNODE_KEY_KINDS,
  DASH_MASTERNODE_PATHS,
  type DashMasternodeKeyKind,
} from "./profiles.js";

function kind(key: DashMasternodeKeyKind["key"]): DashMasternodeKeyKind {
  const found = DASH_MASTERNODE_KEY_KINDS.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`Unknown masternode key ${key}.`);
  return found;
}

/** The secp256k1 owner or voting key: a P2PKH address and key ID for protx register. */
function secp256k1Group(
  root: HDKey,
  network: NetworkName,
  keyKind: DashMasternodeKeyKind,
  index: number,
): ResultFieldGroup {
  const dash = getDashNetwork(network);
  const path = DASH_MASTERNODE_PATHS.keyPath(network, keyKind, index);
  const { privateKey, publicKey, publicKeyHash: keyId } = secp256k1PathKey(root, path);
  try {
    const name = (suffix: string): string => `${keyKind.key}${suffix}`;
    return {
      key: keyKind.key,
      title: keyKind.title,
      description: keyKind.description,
      basic: [
        field(name("Address"), "Address (protx register)", encodeP2pkh(keyId, dash.p2pkh)),
        field(name("KeyId"), "Key ID · HASH160(public key)", bytesToHex(keyId)),
        field(name("PublicKey"), "Compressed public key", bytesToHex(publicKey)),
        field(
          name("PrivateKeyWif"),
          "Private key (Dash WIF)",
          encodeWif(privateKey, dash.wif),
          true,
        ),
      ],
      advanced: [
        field(name("Path"), "DIP9 derivation path", path),
        field(name("PrivateKeyHex"), "Private key (raw 32-byte hex)", bytesToHex(privateKey), true),
      ],
    };
  } finally {
    wipe(privateKey, publicKey, keyId);
  }
}

function operatorGroup(
  account: DashBlsHdKey,
  network: NetworkName,
  index: number,
): ResultFieldGroup {
  const keyKind = kind("operator");
  const key = account.child(index, false);
  const secret = key.secretKey();
  try {
    const { basic, legacy } = key.publicKey();
    return {
      key: keyKind.key,
      title: keyKind.title,
      description: keyKind.description,
      basic: [
        field(
          "operatorPublicKey",
          "BLS public key (basic encoding)",
          bytesToHex(basic),
          false,
          "The operatorPubKey of protx register and ProRegTx version 2 or later.",
        ),
        field(
          "operatorPublicKeyLegacy",
          "BLS public key (legacy encoding)",
          bytesToHex(legacy),
          false,
          "The same key in dashbls's legacy encoding, for ProRegTx version 1 and protx register_legacy.",
        ),
        field(
          "operatorSecretKey",
          "BLS secret key (32-byte hex)",
          bytesToHex(secret),
          true,
          "The masternodeblsprivkey of the operator's dash.conf.",
        ),
      ],
      advanced: [
        field(
          "operatorPath",
          "DIP9 derivation path",
          DASH_MASTERNODE_PATHS.keyPath(network, keyKind, index),
        ),
        field(
          "operatorDerivation",
          "Derivation",
          "dashbls BLS HD (HMAC-SHA256), legacy public-key encoding in normal steps",
        ),
      ],
    };
  } finally {
    wipe(secret);
    key.wipe();
  }
}

function platformNodeGroup(
  account: Slip10Ed25519Key,
  network: NetworkName,
  index: number,
): ResultFieldGroup {
  const keyKind = kind("platformNode");
  const key = account.child(index);
  const privateKey = key.privateKey();
  const publicKey = key.publicKey();
  try {
    return {
      key: keyKind.key,
      title: keyKind.title,
      description: keyKind.description,
      basic: [
        field(
          "platformNodeId",
          "Platform node ID",
          bytesToHex(platformNodeId(publicKey)),
          false,
          "The first 20 bytes of SHA-256 of the public key: the platformNodeID of protx register_evo.",
        ),
        field("platformNodePublicKey", "Ed25519 public key (32-byte hex)", bytesToHex(publicKey)),
        field(
          "platformNodePrivateKey",
          "Ed25519 private key (32-byte hex)",
          bytesToHex(privateKey),
          true,
        ),
      ],
      advanced: [
        field(
          "platformNodePath",
          "DIP9 derivation path",
          DASH_MASTERNODE_PATHS.keyPath(network, keyKind, index),
        ),
        field("platformNodeDerivation", "Derivation", "SLIP-10 Ed25519, every level hardened"),
      ],
    };
  } finally {
    wipe(privateKey, publicKey);
    key.wipe();
  }
}

/** Derives `m/9'/coin_type'/3'/feature'` in the scheme's own child rule, wiping each step. */
function accountKey<Key extends { wipe(): void }>(
  master: Key,
  coinType: number,
  feature: number,
  child: (parent: Key, index: number) => Key,
): Key {
  let key = master;
  for (const index of [9, coinType, 3, feature]) {
    const next = child(key, index);
    key.wipe();
    key = next;
  }
  return key;
}

/**
 * The keys of one masternode per index: owner and voting (secp256k1, P2PKH), operator (BLS12-381)
 * and the Evonode's Platform node key (Ed25519). Dash Core does not derive them from a recovery
 * phrase; these are DIP9's paths as dashj and the Platform wallet library derive them.
 */
export function deriveDashMasternode(options: Bip32BatchOptions): DerivationResult {
  const network = getDashNetwork(options.network);
  assertBatch(options.start, options.count);
  const root = rootFromSeed(options.seed, network.versions);
  const operator = accountKey(
    DashBlsHdKey.fromSeed(options.seed),
    network.coinType,
    kind("operator").feature,
    (parent, index) => parent.child(index, true),
  );
  const platformNode = accountKey(
    Slip10Ed25519Key.fromSeed(options.seed),
    network.coinType,
    kind("platformNode").feature,
    (parent, index) => parent.child(index),
  );
  try {
    const rows = [];
    for (let offset = 0; offset < options.count; offset += 1) {
      const index = options.start + offset;
      rows.push({
        index,
        path: DASH_MASTERNODE_PATHS.featurePath(options.network),
        title: `Masternode key index #${index}`,
        basic: [],
        advanced: [field("masternodeKeyIndex", "Masternode key index", String(index))],
        groups: [
          secp256k1Group(root, options.network, kind("owner"), index),
          secp256k1Group(root, options.network, kind("voting"), index),
          operatorGroup(operator, options.network, index),
          platformNodeGroup(platformNode, options.network, index),
        ],
      });
    }
    return {
      id: "dash-masternode",
      title: "Dash masternode keys (DIP9)",
      networkLabel: network.label,
      pathTemplate: `${DASH_MASTERNODE_PATHS.featurePath(options.network)}/sub_feature'/i`,
      basicSummary: [],
      summary: [],
      rows,
      notices: [
        "Dash Core does not derive masternode keys from a recovery phrase: protx register takes the owner and voting addresses, the operator public key and, for an Evonode, the Platform node ID. These are DIP9's paths as the Dash mobile wallets (dashj) and the Platform wallet library derive them.",
        "The operator key is derived by dashbls's BLS HD scheme, with the legacy public-key encoding in its normal steps, as dashj and the Platform wallet derive it. The basic public key is for protx register and ProRegTx version 2 or later, the legacy one for version 1.",
        "The Platform node key is derived by SLIP-10 with hardened indexes (DIP28). Its node ID is the first 20 bytes of SHA-256 of the public key, not HASH160.",
      ],
    };
  } finally {
    root.wipePrivateData();
    operator.wipe();
    platformNode.wipe();
  }
}

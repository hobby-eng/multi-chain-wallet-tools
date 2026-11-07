import type { HDKey } from "@scure/bip32";
import { assertBatch, rootFromSeed } from "@ckd/core/bip32.js";
import { bytesToHex, encodeP2pkh, encodeWif, wipe } from "@ckd/core/crypto.js";
import { getDashNetwork } from "@ckd/core/networks.js";
import {
  field,
  paymentAddressField,
  type Bip32BatchOptions,
  type DerivationResult,
  type ResultFieldGroup,
} from "@ckd/core/types.js";
import { DASH_IDENTITY_FUNDING_KINDS, DASH_IDENTITY_FUNDING_PATHS } from "./profiles.js";
import type { DashIdentityFundingKind } from "./profiles.js";
import { secp256k1PathKey } from "./path-key.js";

function fundingGroup(
  root: HDKey,
  options: Bip32BatchOptions,
  kind: DashIdentityFundingKind,
  index: number,
): ResultFieldGroup {
  const network = getDashNetwork(options.network);
  const path = DASH_IDENTITY_FUNDING_PATHS.keyPath(options.network, kind, index, options.account);
  const key = secp256k1PathKey(root, path);
  const name = (suffix: string): string => `${kind.key}${suffix}`;
  try {
    return {
      key: kind.key,
      title: kind.title,
      description: kind.description,
      basic: [
        paymentAddressField(
          name("Address"),
          "Funding address (Dash Core P2PKH)",
          encodeP2pkh(key.publicKeyHash, network.p2pkh),
          "dash",
        ),
        field(name("PublicKey"), "Compressed public key", bytesToHex(key.publicKey)),
        field(
          name("PrivateKeyWif"),
          "Private key (Dash WIF)",
          encodeWif(key.privateKey, network.wif),
          true,
        ),
      ],
      advanced: [
        field(name("Path"), "DIP13 derivation path", path),
        field(name("PublicKeyHash"), "HASH160(public key)", bytesToHex(key.publicKeyHash)),
        field(
          name("PrivateKeyHex"),
          "Private key (raw 32-byte hex)",
          bytesToHex(key.privateKey),
          true,
        ),
        field(
          name("LeafDerivation"),
          "Funding index level",
          kind.hardenedLeaf ? "Hardened (index')" : "Normal (index)",
        ),
      ],
    };
  } finally {
    wipe(key.privateKey, key.publicKey, key.publicKeyHash);
  }
}

/**
 * The one-time keys whose Dash Core P2PKH addresses fund asset locks: identity registration, identity
 * top-up, invitations, and the asset locks that fund a Platform address or the shielded pool (DIP13,
 * DIP9's identity feature 5'). An unconsumed asset lock is spent with its funding key, so these keys
 * recover credits that never reached Platform. Each row holds one funding index of every kind; the
 * account input is the identity index of the bound top-up key.
 */
export function deriveDashIdentityFunding(options: Bip32BatchOptions): DerivationResult {
  const network = getDashNetwork(options.network);
  assertBatch(options.start, options.count);
  const root = rootFromSeed(options.seed, network.versions);
  try {
    const rows = [];
    for (let offset = 0; offset < options.count; offset += 1) {
      const index = options.start + offset;
      rows.push({
        index,
        path: DASH_IDENTITY_FUNDING_PATHS.featurePath(options.network),
        title: `Funding index #${index}`,
        basic: [],
        advanced: [field("fundingIndex", "Funding index", String(index))],
        groups: DASH_IDENTITY_FUNDING_KINDS.map((kind) => fundingGroup(root, options, kind, index)),
      });
    }
    return {
      id: "dash-identity-funding",
      title: "Dash Platform identity funding keys (DIP13)",
      networkLabel: network.label,
      pathTemplate: `${DASH_IDENTITY_FUNDING_PATHS.featurePath(options.network)}/funding_feature'/i`,
      basicSummary: [],
      summary: [],
      rows,
      notices: [
        "These Dash Core addresses receive the credit outputs of asset locks. Their keys spend an asset lock that never reached Platform; once Platform consumed it, the credits belong to the identity, Platform address or shielded pool that it funded.",
        "Wallets disagree on the invitation key: the DIP13 text and Dash Core v24 harden the funding index, while the Dash mobile wallets (dashj, DashSync), Dash Evo Tool and the Platform wallet library do not. Both are shown.",
        "An identity ID depends on the asset lock's outpoint, not on these keys, so it cannot be derived from the recovery phrase.",
      ],
    };
  } finally {
    root.wipePrivateData();
  }
}

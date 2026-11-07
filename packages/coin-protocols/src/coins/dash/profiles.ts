import { getDashNetwork } from "@ckd/core/networks.js";
import type { NetworkName } from "@ckd/core/types.js";
import { assertIndex } from "@ckd/core/bip32-limits.js";
import {
  assertPathRange,
  DerivationPathProfile,
  type PathAccount,
  type PathRange,
} from "../../derivation-path.js";
import { indexRange } from "../registry-base.js";

export interface DashIdentityStandardKey {
  keyId: 0 | 1 | 2 | 3;
  purpose: "AUTHENTICATION" | "TRANSFER";
  purposeValue: 0 | 3;
  securityLevel: "MASTER" | "CRITICAL" | "HIGH";
  securityLevelValue: 0 | 1 | 2;
  use: string;
}

export const DASH_IDENTITY_STANDARD_PROFILE_NAME = "Official Platform Wallet v5.0.3 · 4 ECDSA keys";

/**
 * The default registration profile is wallet policy, not a DIP13 path rule.
 * An IdentityCreate transition explicitly assigns each public key its purpose
 * and security level; a custom registration can assign different metadata.
 */
export const DASH_IDENTITY_STANDARD_KEYS: readonly DashIdentityStandardKey[] = [
  {
    keyId: 0,
    purpose: "AUTHENTICATION",
    purposeValue: 0,
    securityLevel: "MASTER",
    securityLevelValue: 0,
    use: "Master-level identity authentication and later identity-key management.",
  },
  {
    keyId: 1,
    purpose: "AUTHENTICATION",
    purposeValue: 0,
    securityLevel: "CRITICAL",
    securityLevelValue: 1,
    use: "Critical authentication operations, including sensitive token operations.",
  },
  {
    keyId: 2,
    purpose: "AUTHENTICATION",
    purposeValue: 0,
    securityLevel: "HIGH",
    securityLevelValue: 2,
    use: "Routine document and application state transitions.",
  },
  {
    keyId: 3,
    purpose: "TRANSFER",
    purposeValue: 3,
    securityLevel: "CRITICAL",
    securityLevelValue: 1,
    use: "Identity credit transfers and withdrawals.",
  },
] as const;

// Unused profiles must disappear from selectively composed artifacts, including their data.
export const DASH_CORE_PATHS = /* @__PURE__ */ new DerivationPathProfile(
  ({ network, account }) => `m/44'/${getDashNetwork(network).coinType}'/${account}'`,
);
export const DASH_COINJOIN_PATHS = /* @__PURE__ */ new DerivationPathProfile(
  ({ network, account }) => `m/9'/${getDashNetwork(network).coinType}'/4'/${account}'`,
);
export const DASH_LEGACY_MOBILE_PATHS = /* @__PURE__ */ new DerivationPathProfile(
  ({ account }) => `m/${account}'`,
);
export const DASH_MULTISIG_PATHS = /* @__PURE__ */ new DerivationPathProfile(
  ({ network, account }) => `m/48'/${getDashNetwork(network).coinType}'/${account}'/0'`,
);
export const DASH_PLATFORM_PATHS = /* @__PURE__ */ new DerivationPathProfile(
  ({ network, account }) => `m/9'/${getDashNetwork(network).coinType}'/17'/${account}'`,
  true,
);

// DIP13's identity/key indices replace the wallet account/branch, and are all hardened.
export class DashIdentityPathProfile {
  profilePath(network: NetworkName): string {
    return `m/9'/${getDashNetwork(network).coinType}'/5'/0'/0'`;
  }

  identityPath(network: NetworkName, identityIndex: number): string {
    assertIndex(identityIndex, "Identity index");
    return `${this.profilePath(network)}/${identityIndex}'`;
  }

  keyPath(network: NetworkName, identityIndex: number, keyIndex: number): string {
    assertIndex(keyIndex, "Identity key index");
    return `${this.identityPath(network, identityIndex)}/${keyIndex}'`;
  }

  pathPreview(input: PathRange): string {
    const { network, start, count } = input;
    assertPathRange(start, count);
    const identity = count > 1 ? `{${start}'…${start + count - 1}'}` : `${start}'`;
    const firstKey = DASH_IDENTITY_STANDARD_KEYS[0]!.keyId;
    const lastKey = DASH_IDENTITY_STANDARD_KEYS.at(-1)!.keyId;
    return `${this.profilePath(network)}/${identity}/{${firstKey}'…${lastKey}'}`;
  }
}

export const DASH_IDENTITY_PATHS = /* @__PURE__ */ new DashIdentityPathProfile();

/**
 * One kind of identity funding key: its DIP13 funding feature, whether its index is hardened, and
 * whether a hardened identity index precedes it (DIP13's top-up key bound to one identity).
 */
export interface DashIdentityFundingKind {
  readonly key: string;
  readonly feature: 1 | 2 | 3 | 4 | 5;
  readonly hardenedLeaf: boolean;
  readonly boundToIdentity?: true;
  readonly title: string;
  readonly description: string;
}

/**
 * The funding keys of DIP13 and DIP9's identity feature 5', in the order of their features. DIP13
 * gives the top-up key two forms, for any identity and bound to one identity; Dash Core v24 and
 * dashj derive only the first, the Platform wallet library (rust-dashcore key-wallet) both. The
 * invitation key appears twice: the DIP13 text and Dash Core v24 harden its index, while dashj,
 * DashSync, Dash Evo Tool and the Platform wallet library do not.
 */
export const DASH_IDENTITY_FUNDING_KINDS: readonly DashIdentityFundingKind[] = [
  {
    key: "registration",
    feature: 1,
    hardenedLeaf: false,
    title: "Identity registration funding",
    description: "Funds the asset lock that registers a new identity.",
  },
  {
    key: "topUp",
    feature: 2,
    hardenedLeaf: false,
    title: "Identity top-up funding",
    description: "Funds an asset lock that adds credits to an identity, for any identity.",
  },
  {
    key: "boundTopUp",
    feature: 2,
    hardenedLeaf: false,
    boundToIdentity: true,
    title: "Identity top-up funding · bound to one identity",
    description:
      "Funds an asset lock that adds credits to the identity of the chosen identity index, as DIP13 and the Platform wallet derive it.",
  },
  {
    key: "invitation",
    feature: 3,
    hardenedLeaf: false,
    title: "Invitation funding · Dash mobile wallets, Dash Evo Tool, Platform wallet",
    description:
      "Funds the asset lock of an invitation, with a normal index, as the deployed wallets derive it.",
  },
  {
    key: "invitationHardened",
    feature: 3,
    hardenedLeaf: true,
    title: "Invitation funding · DIP13 text, Dash Core v24",
    description:
      "Funds the asset lock of an invitation, with the hardened index of the DIP13 text and Dash Core v24.",
  },
  {
    key: "addressTopUp",
    feature: 4,
    hardenedLeaf: false,
    title: "Platform address top-up funding",
    description: "Funds an asset lock that tops up a Platform address.",
  },
  {
    key: "shieldedTopUp",
    feature: 5,
    hardenedLeaf: false,
    title: "Shielded pool top-up funding",
    description: "Funds an asset lock that tops up the shielded pool.",
  },
] as const;

/**
 * DIP13 funding paths: m/9'/coin_type'/5'/funding_feature'/index, the index hardened where noted;
 * the bound top-up key puts the hardened identity index before it.
 */
export class DashIdentityFundingPathProfile {
  featurePath(network: NetworkName): string {
    return `m/9'/${getDashNetwork(network).coinType}'/5'`;
  }

  keyPath(
    network: NetworkName,
    kind: DashIdentityFundingKind,
    index: number,
    identityIndex: number,
  ): string {
    assertIndex(index, "Funding index");
    assertIndex(identityIndex, "Identity index");
    const identity = kind.boundToIdentity === true ? `/${identityIndex}'` : "";
    const leaf = `${index}${kind.hardenedLeaf ? "'" : ""}`;
    return `${this.featurePath(network)}/${kind.feature}'${identity}/${leaf}`;
  }

  pathPreview(input: PathRange): string {
    const { network, account, start, count } = input;
    assertPathRange(start, count);
    assertIndex(account, "Identity index");
    const range = indexRange(start, count);
    return `${this.featurePath(network)}/{1'…5'}/${range} · bound top-up ${this.featurePath(network)}/2'/${account}'/${range}`;
  }
}

export const DASH_IDENTITY_FUNDING_PATHS = /* @__PURE__ */ new DashIdentityFundingPathProfile();

/** One masternode key of DIP9's feature 3': its key type and its sub-feature. */
export interface DashMasternodeKeyKind {
  readonly key: "owner" | "voting" | "operator" | "platformNode";
  readonly feature: 1 | 2 | 3 | 4;
  readonly title: string;
  readonly description: string;
}

/**
 * The masternode keys of DIP9 (sub-feature 0' is reserved), as dashj and the Platform wallet
 * library derive them: secp256k1 owner and voting keys and a BLS operator key with normal indexes,
 * and the Ed25519 Platform node key of an Evonode with hardened indexes (DIP28).
 */
export const DASH_MASTERNODE_KEY_KINDS: readonly DashMasternodeKeyKind[] = [
  {
    key: "owner",
    feature: 2,
    title: "Owner key",
    description:
      "Controls the masternode registration: its address is the ownerAddress of protx register, its HASH160 the keyIDOwner of the ProRegTx.",
  },
  {
    key: "voting",
    feature: 1,
    title: "Voting key",
    description:
      "Votes on governance proposals: its address is the votingAddress of protx register, its HASH160 the keyIDVoting of the ProRegTx.",
  },
  {
    key: "operator",
    feature: 3,
    title: "Operator key · BLS12-381",
    description:
      "Signs the operator's quorum and service messages; its public key is the operatorPubKey of protx register.",
  },
  {
    key: "platformNode",
    feature: 4,
    title: "Platform node key · Ed25519 (Evonode)",
    description:
      "Identifies an Evonode's Platform (Tenderdash) node; its node ID is the platformNodeID of protx register_evo.",
  },
] as const;

/** DIP9 masternode paths: m/9'/coin_type'/3'/sub_feature'/index, the Ed25519 index hardened. */
export class DashMasternodePathProfile {
  featurePath(network: NetworkName): string {
    return `m/9'/${getDashNetwork(network).coinType}'/3'`;
  }

  /** Whether the kind's last index is hardened: SLIP-10 has no normal Ed25519 child. */
  hardenedLeaf(kind: DashMasternodeKeyKind): boolean {
    return kind.key === "platformNode";
  }

  keyPath(network: NetworkName, kind: DashMasternodeKeyKind, index: number): string {
    assertIndex(index, "Masternode key index");
    const leaf = `${index}${this.hardenedLeaf(kind) ? "'" : ""}`;
    return `${this.featurePath(network)}/${kind.feature}'/${leaf}`;
  }

  pathPreview(input: PathRange): string {
    const { network, start, count } = input;
    assertPathRange(start, count);
    const hardened = count > 1 ? `{${start}'…${start + count - 1}'}` : `${start}'`;
    const feature = this.featurePath(network);
    return `${feature}/{1'…3'}/${indexRange(start, count)} · platform node ${feature}/4'/${hardened}`;
  }
}

export const DASH_MASTERNODE_PATHS = /* @__PURE__ */ new DashMasternodePathProfile();

/**
 * DIP15's receiving chain of one contact: m/9'/coin_type'/15'/account'/(own identity ID)/(contact
 * identity ID)/index, the two IDs DIP14 256-bit normal children and the index normal.
 */
export class DashPayPathProfile {
  accountPath(network: NetworkName, account: number): string {
    assertIndex(account, "Account");
    return `m/9'/${getDashNetwork(network).coinType}'/15'/${account}'`;
  }

  chainPath(network: NetworkName, account: number): string {
    return `${this.accountPath(network, account)}/(your ID)/(contact ID)`;
  }

  pathPreview(input: PathRange): string {
    const { network, account, start, count } = input;
    assertPathRange(start, count);
    return `${this.chainPath(network, account)}/${indexRange(start, count)}`;
  }
}

export const DASH_DASHPAY_PATHS = /* @__PURE__ */ new DashPayPathProfile();

/** The identity IDs that DashPay's text inputs take: Base58 of 32 bytes, or 64 hex digits. */
export const DASH_IDENTITY_ID_MAX_LENGTH = 64;

/** The page's text of each refused DashPay input; it never repeats what was typed. */
export const DASH_PAY_INPUT_MESSAGES = {
  "dashpay.own.empty": "Enter your identity ID.",
  "dashpay.contact.empty": "Enter the contact's identity ID.",
  "dashpay.own.format": "Your identity ID is not a Base58 or 64-digit hex identity ID.",
  "dashpay.contact.format":
    "The contact's identity ID is not a Base58 or 64-digit hex identity ID.",
  "dashpay.own.length": "Your identity ID must decode to 32 bytes.",
  "dashpay.contact.length": "The contact's identity ID must decode to 32 bytes.",
  "dashpay.own.form": "Your identity ID is not a valid identity ID.",
  "dashpay.contact.form": "The contact's identity ID is not a valid identity ID.",
  "dashpay.same": "Your identity ID and the contact's identity ID are the same.",
} as const;

/** ZIP-32's leaf is an external diversifier index, not a BIP32 branch/index pair. */
export class DashShieldedPathProfile {
  accountPath(input: PathAccount): string {
    assertIndex(input.account, "Account");
    return `m/32'/${getDashNetwork(input.network).coinType}'/${input.account}'`;
  }

  pathPreview(input: Omit<PathRange, "branch">): string {
    assertPathRange(input.start, input.count, MAX_DASH_DIVERSIFIER_INDEX);
    const range = indexRange(input.start, input.count);
    return `${this.accountPath(input)} · external diversifier ${range}`;
  }
}

export const DASH_SHIELDED_PATHS = /* @__PURE__ */ new DashShieldedPathProfile();

/** The browser adapter accepts uint32 external Orchard diversifier indices. */
export const MAX_DASH_DIVERSIFIER_INDEX = 0xffff_ffff;

const COINJOIN_BRANCHES = { external: 0, internal: 1 } as const;

/** The optional DIP9 protocol's identity, controls and preview belong to its metadata. */
export const DASH_COINJOIN_PROTOCOL = {
  label: "Dash Mobile CoinJoin · DIP9",
  branches: COINJOIN_BRANCHES,
  workerAdapterId: "dash-core-coinjoin",
  pathPreview: (input: Omit<PathRange, "branch">) => ({
    external: DASH_COINJOIN_PATHS.pathPreview({ ...input, branch: COINJOIN_BRANCHES.external }),
    internal: DASH_COINJOIN_PATHS.pathPreview({ ...input, branch: COINJOIN_BRANCHES.internal }),
  }),
} as const;

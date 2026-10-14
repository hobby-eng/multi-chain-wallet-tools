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

export const DASH_IDENTITY_STANDARD_PROFILE_NAME = "Official Platform Wallet v4.1.1 · 4 ECDSA keys";

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

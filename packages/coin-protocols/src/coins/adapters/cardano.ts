import type { BranchControl, CoinAdapter, CoinFieldRoles } from "../registry-base.js";
import { CARDANO_PROFILES, CARDANO_ROLES, type CardanoProfile } from "../cardano/profiles.js";

/** CIP-1852's roles as the page's branch choice: receive and change addresses, and the stake key. */
const CARDANO_ROLE_CONTROL: BranchControl = Object.freeze({
  label: "Role (CIP-1852)",
  max: CARDANO_ROLES.staking,
  options: [
    { value: CARDANO_ROLES.external, label: "0 — receive addresses" },
    { value: CARDANO_ROLES.internal, label: "1 — change addresses" },
    { value: CARDANO_ROLES.staking, label: "2 — stake key" },
  ],
});

/** The fields that the page's exports read: the addresses, the public keys and the private keys. */
const CARDANO_FIELD_ROLES: CoinFieldRoles = Object.freeze({
  addresses: ["address", "enterpriseAddress"],
  publicKeys: ["publicKey", "publicKeyHex", "extendedPublicKey"],
  privateKeys: ["privateKey", "signingKey"],
});

/** The page's adapter of one Cardano variant: mainnet only, an account and CIP-1852's role. */
function cardanoAdapter(profile: CardanoProfile): CoinAdapter {
  const { seedSource } = profile;
  return {
    id: profile.adapterId,
    group: profile.group,
    fixedPathLabels: ["Purpose", "Coin type"],
    label: profile.label,
    variantLabel: profile.variantLabel,
    defaultVariant: profile.defaultVariant,
    ...(seedSource === undefined ? {} : { seedSource }),
    networkControl: false,
    branchControl: CARDANO_ROLE_CONTROL,
    controlLabels: { start: "Start index", count: "Number of keys" },
    defaults: { network: "mainnet", account: 0, branch: 0, start: 0, count: 20 },
    fieldRoles: CARDANO_FIELD_ROLES,
    pathPreview: (input) => profile.pathPreview(input),
  };
}

/** Cardano's page adapters, one per variant of the Derivation type tabs. */
export const CARDANO_COIN_ADAPTERS: readonly CoinAdapter[] = CARDANO_PROFILES.map(cardanoAdapter);

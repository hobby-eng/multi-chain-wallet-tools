// Cardano's derivation: the keys of CIP-1852's path m/1852'/1815'/account'/role/index below a CIP-3
// root (bip32-ed25519.ts), each row one key of the chosen role with its addresses (address.ts) and
// its key texts as Cardano's wallets and tools write them: CIP-5's bech32 forms, as cardano-address
// prints them, and the 128-byte extended signing key of cardano-cli's .skey files. Every key and
// private-key copy is wiped when its row is built.
import { assertBatch } from "@ckd/core/bip32.js";
import { bytesToHex, concatBytes, wipe } from "@ckd/core/crypto.js";
import {
  field,
  paymentAddressField,
  type Bip32BatchOptions,
  type DerivationResult,
  type DerivedRow,
  type ResultField,
} from "@ckd/core/types.js";
import { Bip32Ed25519Key, type Bip32Ed25519Level } from "../../bip32-ed25519.js";
import { variantDerivation, type VariantDerivation } from "../coin-variant.js";
import {
  cardanoBaseAddress,
  cardanoEnterpriseAddress,
  cardanoKeyText,
  cardanoRewardAddress,
} from "./address.js";
import {
  CARDANO_COIN_TYPE,
  CARDANO_PROFILES,
  CARDANO_PURPOSE,
  CARDANO_ROLES,
  CARDANO_STAKE_INDEX,
  CardanoProfile,
  type CardanoMaster,
} from "./profiles.js";

const hardened = (index: number): Bip32Ed25519Level => ({ index, hardened: true });
const normal = (index: number): Bip32Ed25519Level => ({ index, hardened: false });

/** The stake key below an account key: role 2, index 0 (CIP-11). */
const STAKE_LEVELS = Object.freeze([normal(CARDANO_ROLES.staking), normal(CARDANO_STAKE_INDEX)]);

/** The names of CIP-3's master keys, as the result's derivation line gives them. */
const MASTER_NAMES: Readonly<Record<CardanoMaster, string>> = Object.freeze({
  icarus: "Icarus",
  "icarus-trezor": "Icarus-Trezor",
  ledger: "Ledger",
});

const NOT_DERIVED =
  "Byron-era addresses (Ae2…, DdzFF…) are not derived. The stake key is role 2, index 0, the one Cardano's wallets use (CIP-11).";
const NOTICES: Readonly<Record<CardanoMaster, readonly string[]>> = Object.freeze({
  icarus: [
    "Yoroi, Lace and Trust Wallet use no BIP39 passphrase: with a passphrase, these keys match Trezor's, not those wallets'. Eternl is said to use the same keys; its code is closed and was not checked.",
    NOT_DERIVED,
  ],
  ledger: [
    "Ledger and BitBox02 derive other keys from the same words, so their addresses differ from Yoroi's and Trezor's.",
    NOT_DERIVED,
  ],
  "icarus-trezor": [
    "The keys of Trezor's Cardano wallets made from 24 words with older firmware. For a phrase of 12 to 21 words they are Icarus's.",
    NOT_DERIVED,
  ],
});

/** The root key of a variant's seed: a CIP-3 root (seedSource), or Ledger's from a BIP39 seed. */
function rootKey(profile: CardanoProfile, seed: Uint8Array): Bip32Ed25519Key {
  return profile.master === "ledger"
    ? Bip32Ed25519Key.fromLedgerSeed(seed)
    : Bip32Ed25519Key.fromRoot(seed);
}

/** The CIP-5 prefixes of a role's keys: a payment key's, or the stake key's. */
function prefixesOf(role: number) {
  return role === CARDANO_ROLES.staking
    ? ({ xsk: "stake_xsk", xvk: "stake_xvk", vk: "stake_vk" } as const)
    : ({ xsk: "addr_xsk", xvk: "addr_xvk", vk: "addr_vk" } as const);
}

/** A key's CIP-5 xsk text (kL ‖ kR ‖ chain code), its bytes wiped. */
function xskText(key: Bip32Ed25519Key, prefix: "addr_xsk" | "stake_xsk" | "acct_xsk" | "root_xsk") {
  const privateKey = key.privateKey();
  const chainCode = key.chainCode();
  const extended = concatBytes(privateKey, chainCode);
  try {
    return cardanoKeyText(prefix, extended);
  } finally {
    wipe(privateKey, chainCode, extended);
  }
}

/** A key's 128-byte hex as cardano-cli's .skey holds it (kL ‖ kR ‖ public key ‖ chain code), its bytes wiped. */
function signingKeyHex(key: Bip32Ed25519Key): string {
  const privateKey = key.privateKey();
  const chainCode = key.chainCode();
  const signing = concatBytes(privateKey, key.publicKey(), chainCode);
  try {
    return bytesToHex(signing);
  } finally {
    wipe(privateKey, chainCode, signing);
  }
}

/** The fields of one key of `role`, its address first among the basic fields. */
function keyFields(
  key: Bip32Ed25519Key,
  role: number,
  stakeKey: Uint8Array,
): { basic: ResultField[]; advanced: ResultField[] } {
  const prefixes = prefixesOf(role);
  const publicKey = key.publicKey();
  const xsk = xskText(key, prefixes.xsk);
  const keys = {
    basic: [
      field("publicKey", `Public key (${prefixes.vk})`, cardanoKeyText(prefixes.vk, publicKey)),
      field("privateKey", `Private key (${prefixes.xsk}, extended)`, xsk, true),
    ],
    advanced: [
      field("publicKeyHex", "Public key (32-byte hex)", bytesToHex(publicKey)),
      field(
        "extendedPublicKey",
        `Extended public key (${prefixes.xvk})`,
        cardanoKeyText(prefixes.xvk, key.extendedPublicKey()),
      ),
      field(
        "signingKey",
        "Extended signing key (128-byte hex, as cardano-cli's .skey holds it)",
        signingKeyHex(key),
        true,
      ),
    ],
  };
  if (role === CARDANO_ROLES.staking)
    return {
      basic: [
        field("address", "Stake address (reward account)", cardanoRewardAddress(publicKey)),
        ...keys.basic,
      ],
      advanced: keys.advanced,
    };
  return {
    basic: [
      paymentAddressField(
        "address",
        "Address (base: this key and the account's stake key)",
        cardanoBaseAddress(publicKey, stakeKey),
      ),
      ...keys.basic,
    ],
    advanced: [
      paymentAddressField(
        "enterpriseAddress",
        "Enterprise address (no stake key)",
        cardanoEnterpriseAddress(publicKey),
      ),
      field(
        "rewardAddress",
        "Stake address of the account (m/1852'/1815'/a'/2/0)",
        cardanoRewardAddress(stakeKey),
      ),
      ...keys.advanced,
    ],
  };
}

/** The row of `index` below the role key `branch`, built while its key is held. */
function row(
  profile: CardanoProfile,
  branch: Bip32Ed25519Key,
  stakeKey: Uint8Array,
  options: Bip32BatchOptions,
  index: number,
): DerivedRow {
  const key = branch.derive([normal(index)]);
  try {
    const path = profile.path(options.account, options.branch, index);
    const { basic, advanced } = keyFields(key, options.branch, stakeKey);
    const title = options.branch === CARDANO_ROLES.staking ? "Stake key" : "Address";
    return {
      index,
      path,
      title: `${title} #${index}`,
      basic,
      advanced: [field("path", "Derivation path", path), ...advanced],
    };
  } finally {
    key.wipe();
  }
}

/** The account's fields: its extended public key, and its private and root keys. */
function summaryOf(root: Bip32Ed25519Key, account: Bip32Ed25519Key, profile: CardanoProfile) {
  return {
    basicSummary: [
      field(
        "accountPublicKey",
        "Account public key (acct_xvk)",
        cardanoKeyText("acct_xvk", account.extendedPublicKey()),
      ),
    ],
    summary: [
      field(
        "accountPrivateKey",
        "Account private key (acct_xsk)",
        xskText(account, "acct_xsk"),
        true,
      ),
      field("rootPrivateKey", "Root private key (root_xsk)", xskText(root, "root_xsk"), true),
      field(
        "derivation",
        "Derivation",
        `BIP32-Ed25519 below CIP-3's ${MASTER_NAMES[profile.master]} master key, CIP-1852 path`,
      ),
    ],
  };
}

/** The rows of `options` under `profile`: the keys of the role `options.branch` of the account. */
export function deriveCardano(
  profile: CardanoProfile,
  options: Bip32BatchOptions,
): DerivationResult {
  assertBatch(options.start, options.count);
  const role = CardanoProfile.role(options.branch);
  const accountPath = profile.accountPath(options);
  const root = rootKey(profile, options.seed);
  let account: Bip32Ed25519Key | undefined;
  let stake: Bip32Ed25519Key | undefined;
  let branch: Bip32Ed25519Key | undefined;
  try {
    account = root.derive([
      hardened(CARDANO_PURPOSE),
      hardened(CARDANO_COIN_TYPE),
      hardened(options.account),
    ]);
    stake = account.derive(STAKE_LEVELS);
    branch = account.derive([normal(role)]);
    const stakeKey = stake.publicKey();
    const held = branch;
    const rows = Array.from({ length: options.count }, (_, offset) =>
      row(profile, held, stakeKey, options, options.start + offset),
    );
    return {
      id: profile.adapterId,
      title: profile.label,
      networkLabel: "Cardano mainnet",
      pathTemplate: `${accountPath}/${role}/i`,
      ...summaryOf(root, account, profile),
      rows,
      notices: [...NOTICES[profile.master]],
    };
  } finally {
    root.wipe();
    account?.wipe();
    stake?.wipe();
    branch?.wipe();
  }
}

/** The derivation of a Cardano adapter id; undefined for another coin's. */
export function cardanoDerivation(id: string): VariantDerivation | undefined {
  return variantDerivation(CARDANO_PROFILES, id, deriveCardano);
}

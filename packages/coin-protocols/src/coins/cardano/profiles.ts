// The public facts of Cardano's variants: the master key each derives from a BIP39 phrase (CIP-3:
// Icarus, Icarus-Trezor and Ledger) and the path of CIP-1852, m/1852'/1815'/account'/role/index.
// Crypto-free, so that the page's registry and its previews read them without the derivation
// runtime.
import { assertIndex } from "@ckd/core/bip32-limits.js";
import type { CardanoIcarusMaster } from "@ckd/core/cardano-root.js";
import { assertPathRange, type PathAccount, type PathRange } from "../../derivation-path.js";
import { indexRange, type SeedSource } from "../registry-base.js";
import { CoinVariant, type CoinVariantFacts } from "../coin-variant.js";

/** CIP-3's master keys of a BIP39 phrase. */
export type CardanoMaster = CardanoIcarusMaster | "ledger";

/** CIP-1852's purpose and Cardano's coin type (SLIP-44 1815), the path's two fixed levels. */
export const CARDANO_PURPOSE = 1852;
export const CARDANO_COIN_TYPE = 1815;

/**
 * CIP-1852's roles that the Deriver shows: receive addresses, change addresses, and the stake key
 * (CIP-11). Roles 3 to 5 (CIP-105's DRep and committee keys) are not derived.
 */
export const CARDANO_ROLES = Object.freeze({ external: 0, internal: 1, staking: 2 });

/** The stake key's index: CIP-11 "RECOMMENDS wallets only use address_index=0". */
export const CARDANO_STAKE_INDEX = 0;

/** The seed source of each master: Icarus's come from the phrase's entropy, Ledger's from BIP39's seed. */
const SEED_SOURCES: Readonly<Record<CardanoMaster, SeedSource | undefined>> = Object.freeze({
  icarus: "cardano-icarus",
  "icarus-trezor": "cardano-icarus-trezor",
  ledger: undefined,
});

interface ProfileFacts extends CoinVariantFacts {
  readonly master: CardanoMaster;
}

/** One variant of Cardano: its names, its master key and its paths. */
export class CardanoProfile extends CoinVariant {
  readonly master: CardanoMaster;

  constructor(facts: ProfileFacts) {
    super(facts);
    this.master = facts.master;
  }

  /** Where the page reads the variant's seed: undefined for BIP39's seed (CoinAdapter.seedSource). */
  get seedSource(): SeedSource | undefined {
    return SEED_SOURCES[this.master];
  }

  /** The role of a branch value, refused unless it is one of CARDANO_ROLES. */
  static role(branch: number): number {
    return assertIndex(branch, "Role", CARDANO_ROLES.staking);
  }

  /** The account path m/1852'/1815'/account'. */
  accountPath(input: PathAccount): string {
    assertIndex(input.account, "Account");
    return `m/${CARDANO_PURPOSE}'/${CARDANO_COIN_TYPE}'/${input.account}'`;
  }

  /** The path of one key, m/1852'/1815'/account'/role/index. */
  path(account: number, role: number, index: number): string {
    assertIndex(index, "Address index");
    return `${this.accountPath({ network: "mainnet", account })}/${CardanoProfile.role(role)}/${index}`;
  }

  /** The path with the row range in place of the index, such as m/1852'/1815'/0'/0/0…19. */
  pathPreview(input: PathRange): string {
    assertPathRange(input.start, input.count);
    return `${this.accountPath(input)}/${CardanoProfile.role(input.branch)}/${indexRange(input.start, input.count)}`;
  }
}

/**
 * Cardano's variants (CIP-3): Icarus, the master key of Yoroi, Lace, Daedalus's Shelley wallets and
 * Trezor from a BIP39 phrase; Ledger's, which Ledger devices and BitBox02 derive from the BIP39 seed; and
 * Icarus-Trezor, Trezor's for 24-word wallets made with older firmware.
 */
export const CARDANO_PROFILES: readonly CardanoProfile[] = Object.freeze([
  new CardanoProfile({
    adapterId: "cardano",
    group: "Cardano",
    variantLabel: "Icarus · Yoroi, Lace, Daedalus (Shelley wallets), Trezor",
    master: "icarus",
    defaultVariant: true,
  }),
  new CardanoProfile({
    adapterId: "cardano-ledger",
    group: "Cardano",
    variantLabel: "Ledger · Ledger, BitBox02",
    master: "ledger",
  }),
  new CardanoProfile({
    adapterId: "cardano-icarus-trezor",
    group: "Cardano",
    variantLabel: "Icarus-Trezor · Trezor 24-word (legacy)",
    master: "icarus-trezor",
  }),
]);

// The public facts of Zcash's variants: its transparent P2PKH addresses (BIP44) and its shielded
// Sapling addresses (ZIP-32), both at coin type 133 (SLIP-44). Crypto-free, so that the page's
// registry and its previews read them without the derivation runtime.
import { assertIndex } from "@ckd/core/bip32-limits.js";
import { assertPathRange, type PathAccount, type PathRange } from "../../derivation-path.js";
import { Bip44CoinProfile } from "../bip44-coin-profile.js";
import { CoinVariant } from "../coin-variant.js";
import { indexRange } from "../registry-base.js";

/** Zcash's coin type (SLIP-44), of its BIP44 and its ZIP-32 paths. */
export const ZCASH_COIN_TYPE = 133;

/**
 * Zcash's transparent P2PKH profile under its coin type 133 (SLIP-44), the coin's default variant;
 * its external branch also gives the Sapling rows' transparent receivers.
 */
export const ZCASH_TRANSPARENT_PROFILE = new Bip44CoinProfile({
  adapterId: "zcash",
  group: "Zcash",
  variantLabel: "Transparent · BIP44",
  purpose: 44,
  coinType: ZCASH_COIN_TYPE,
  branches: "receive-change",
  outputType: "P2PKH",
  defaultVariant: true,
});

/** Zcash's BIP44 profiles: the transparent one alone, which its message signing reads. */
export const ZCASH_PROFILES: readonly Bip44CoinProfile[] = Object.freeze([
  ZCASH_TRANSPARENT_PROFILE,
]);

/** zcashd's mainnet chainparams (master, read 2026-11-10): transparent P2PKH 0x1CB8 ("t1…"), WIF 0x80. */
export const ZCASH_ADDRESS = Object.freeze({ t1: Object.freeze([0x1c, 0xb8]), wif: 0x80 });

/** ZIP-32's purpose of shielded keys ("Sapling key path": m_Sapling/32'/coin_type'/account'). */
export const ZIP32_PURPOSE = 32;

/**
 * Zcash's Sapling variant: ZIP-32's account m_Sapling/32'/133'/account', whose rows are diversifier
 * indexes j, each with its address or none. j stays below 2^31, so that each address has the
 * transparent receiver m/44'/133'/account'/0/j that ZIP-316 pairs with it.
 */
export class ZcashSaplingProfile extends CoinVariant {
  /** The account path m_Sapling/32'/133'/account'. */
  accountPath(input: PathAccount): string {
    assertIndex(input.account, "Account");
    return `m/${ZIP32_PURPOSE}'/${ZCASH_COIN_TYPE}'/${input.account}'`;
  }

  /** The path of one row: the account and its diversifier index j. */
  path(account: number, index: number): string {
    assertIndex(index, "Diversifier index");
    return `${this.accountPath({ network: "mainnet", account })} · diversifier index ${index}`;
  }

  /** The account path with the row range, such as m/32'/133'/0' · diversifier index 0…19. */
  pathPreview(input: PathRange): string {
    assertPathRange(input.start, input.count);
    return `${this.accountPath(input)} · diversifier index ${indexRange(input.start, input.count)}`;
  }
}

/** Zcash's shielded Sapling variant, beside the transparent one, which stays the coin's default. */
export const ZCASH_SAPLING_PROFILE = new ZcashSaplingProfile({
  adapterId: "zcash-sapling",
  group: "Zcash",
  variantLabel: "Shielded Sapling · ZIP-32",
});

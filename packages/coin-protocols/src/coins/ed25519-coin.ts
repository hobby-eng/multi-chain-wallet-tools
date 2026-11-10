// The derivation of an Ed25519 coin (ed25519-coin-profile.ts): each row is the SLIP-10 key at the
// variant's path with the row index in it, shown with the coin's address and key forms. Every key
// and private-key copy is wiped when its row is built.
import { assertBatch } from "@ckd/core/bip32.js";
import { wipe } from "@ckd/core/crypto.js";
import {
  field,
  type Bip32BatchOptions,
  type DerivationResult,
  type DerivedRow,
  type ResultField,
} from "@ckd/core/types.js";
import { Slip10Ed25519Key } from "../slip10-ed25519.js";
import type { Ed25519CoinProfile } from "./ed25519-coin-profile.js";
import { variantDerivation, type VariantDerivation } from "./coin-variant.js";

/** How a coin shows an Ed25519 key. */
export interface Ed25519CoinKeys {
  /** The result's network line, such as "Solana mainnet". */
  readonly networkLabel: string;
  readonly notices?: readonly string[];
  /**
   * The row's fields from the 32-byte private key (the Ed25519 seed) and the public key: its
   * address first among the basic fields.
   */
  fields(
    privateKey: Uint8Array,
    publicKey: Uint8Array,
  ): { basic: ResultField[]; advanced: ResultField[] };
}

/** The row of `index`, built while its key is held. */
function row(
  profile: Ed25519CoinProfile,
  keys: Ed25519CoinKeys,
  seed: Uint8Array,
  index: number,
): DerivedRow {
  const key = Slip10Ed25519Key.atPath(seed, profile.indexes(index));
  const privateKey = key.privateKey();
  try {
    const path = profile.path(index);
    const { basic, advanced } = keys.fields(privateKey, key.publicKey());
    return {
      index,
      path,
      title: `Key #${index}`,
      basic,
      advanced: [field("path", "Derivation path", path), ...advanced],
    };
  } finally {
    key.wipe();
    wipe(privateKey);
  }
}

/** The rows of `options` under `profile`, shown by `keys`; the account and branch are unused. */
export function deriveEd25519Coin(
  profile: Ed25519CoinProfile,
  keys: Ed25519CoinKeys,
  options: Bip32BatchOptions,
): DerivationResult {
  assertBatch(options.start, options.count);
  const rows = Array.from({ length: options.count }, (_, offset) =>
    row(profile, keys, options.seed, options.start + offset),
  );
  return {
    id: profile.adapterId,
    title: profile.label,
    networkLabel: keys.networkLabel,
    pathTemplate: profile.template,
    basicSummary: [],
    summary: [field("derivation", "Derivation", "SLIP-10 Ed25519, every level hardened")],
    rows,
    notices: [...(keys.notices ?? [])],
  };
}

/** The derivation of every profile of a coin, by adapter id; undefined for another coin's id. */
export function ed25519CoinDerivation(
  profiles: readonly Ed25519CoinProfile[],
  keys: Ed25519CoinKeys,
  id: string,
): VariantDerivation | undefined {
  return variantDerivation(profiles, id, (profile, options) =>
    deriveEd25519Coin(profile, keys, options),
  );
}

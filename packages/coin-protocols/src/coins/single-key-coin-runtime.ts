// The derivations of every single-key coin, by adapter id, for the full runtime registry. Import
// only inside isolated derivation workers or tests.
import type { Bip32BatchOptions, DerivationResult } from "@ckd/core/types.js";
import type { RuntimeCoinAdapter } from "./runtime-types.js";
import { bitcoinCashDerivation } from "./bitcoin-cash/index.js";
import { cardanoDerivation } from "./cardano/index.js";
import { cosmosDerivation } from "./cosmos/index.js";
import { dogecoinDerivation } from "./dogecoin/index.js";
import { ethereumClassicDerivation } from "./ethereum-classic/index.js";
import { hederaDerivation } from "./hedera/index.js";
import { injectiveDerivation } from "./injective/index.js";
import { litecoinDerivation } from "./litecoin/index.js";
import { nearDerivation } from "./near/index.js";
import { solanaDerivation } from "./solana/index.js";
import { stellarDerivation } from "./stellar/index.js";
import { tonDerivation } from "./ton/index.js";
import { tronDerivation } from "./tron/index.js";
import { xrpDerivation } from "./xrp/index.js";
import { zcashDerivation, zcashOwnership } from "./zcash/index.js";

const DERIVATIONS = [
  litecoinDerivation,
  dogecoinDerivation,
  bitcoinCashDerivation,
  zcashDerivation,
  xrpDerivation,
  tronDerivation,
  ethereumClassicDerivation,
  cosmosDerivation,
  injectiveDerivation,
  solanaDerivation,
  stellarDerivation,
  nearDerivation,
  hederaDerivation,
  tonDerivation,
  cardanoDerivation,
];

/** The ownership tests of the coins whose variants offer one (RuntimeCoinAdapter.ownedAddresses). */
const OWNERSHIPS = [zcashOwnership];

/** The ownership test of a single-key coin's adapter id, or undefined when it offers none. */
export function singleKeyCoinOwnershipFor(id: string): RuntimeCoinAdapter["ownedAddresses"] {
  for (const ownership of OWNERSHIPS) {
    const ownedAddresses = ownership(id);
    if (ownedAddresses !== undefined) return ownedAddresses;
  }
  return undefined;
}

/** The derivation of a single-key coin's adapter id, or undefined for any other id. */
export function singleKeyCoinDerivationFor(
  id: string,
): ((options: Bip32BatchOptions) => DerivationResult) | undefined {
  for (const derivation of DERIVATIONS) {
    const derive = derivation(id);
    if (derive !== undefined) return derive;
  }
  return undefined;
}

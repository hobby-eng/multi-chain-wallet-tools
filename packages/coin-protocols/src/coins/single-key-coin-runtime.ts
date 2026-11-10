// The derivations of every single-key coin, by adapter id, for the full runtime registry. Import
// only inside isolated derivation workers or tests.
import type { Bip32BatchOptions, DerivationResult } from "@ckd/core/types.js";
import { bitcoinCashDerivation } from "./bitcoin-cash/index.js";
import { cosmosDerivation } from "./cosmos/index.js";
import { dogecoinDerivation } from "./dogecoin/index.js";
import { ethereumClassicDerivation } from "./ethereum-classic/index.js";
import { hederaDerivation } from "./hedera/index.js";
import { injectiveDerivation } from "./injective/index.js";
import { litecoinDerivation } from "./litecoin/index.js";
import { nearDerivation } from "./near/index.js";
import { solanaDerivation } from "./solana/index.js";
import { stellarDerivation } from "./stellar/index.js";
import { tronDerivation } from "./tron/index.js";
import { xrpDerivation } from "./xrp/index.js";
import { zcashDerivation } from "./zcash/index.js";

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
];

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

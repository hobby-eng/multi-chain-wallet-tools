// Cardano's seeds on the page: the CIP-3 roots of a BIP39 phrase and its passphrase, from which its
// Icarus and Icarus-Trezor variants derive (@ckd/core/cardano-icarus.js). A build composes them only
// with Cardano (tooling/key-derivation-features.mjs); the controller reads a variant's seed here when
// its seedSource names one (CoinAdapter.seedSource).
import { cardanoIcarusRoot } from "@ckd/core/cardano-icarus.js";
import type { PhraseSeedReaders } from "@ckd/coins/registry-base.js";

/** The readers of Cardano's phrase seed sources. */
export const phraseSeedReaders: PhraseSeedReaders = Object.freeze({
  "cardano-icarus": (phrase: string, passphrase: string) =>
    cardanoIcarusRoot(phrase, passphrase, "icarus"),
  "cardano-icarus-trezor": (phrase: string, passphrase: string) =>
    cardanoIcarusRoot(phrase, passphrase, "icarus-trezor"),
});

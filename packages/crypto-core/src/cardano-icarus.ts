// CIP-3's Icarus master key of a Cardano wallet from a BIP39 phrase (cardano-foundation/CIPs @7720fed
// CIP-0003/Icarus.md, read 2026-11-13), which Yoroi, Lace, Daedalus's Shelley wallets and Trezor
// derive (Eternl may as well; its code is closed and no source for it was checked), and Trezor's
// 24-word variant of it: the phrase's entropy and passphrase, read as BIP39 reads them, given to
// cardano-root.ts. The page computes this root as the seed of the Cardano variants, as it computes
// BIP39's seed for the others; coin-protocols/src/bip32-ed25519.ts derives the keys below it.
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { englishMnemonicToEntropy } from "./bip39.js";
import { cardanoIcarusRootOf, type CardanoIcarusMaster } from "./cardano-root.js";
import { wipe } from "./crypto.js";
import { nfkd } from "./unicode-nfkd.js";

/**
 * The 96-byte CIP-3 root (kL ‖ kR ‖ chain code) of a BIP39 `phrase` and its `passphrase` under
 * `master`; the caller wipes it. The passphrase is the PBKDF2 password as UTF-8 of its NFKD form,
 * normalized as BIP39's seed normalizes it, so an ASCII passphrase gives what every wallet gives.
 * Yoroi, Lace and Trust Wallet use no passphrase; Trezor does. A phrase that is not a valid English
 * BIP39 phrase is refused, as BIP39's seed refuses it.
 */
export function cardanoIcarusRoot(
  phrase: string,
  passphrase: string,
  master: CardanoIcarusMaster,
): Uint8Array {
  const entropy = englishMnemonicToEntropy(phrase);
  let password: Uint8Array | undefined;
  try {
    password = utf8ToBytes(nfkd(passphrase));
    return cardanoIcarusRootOf(entropy, password, master);
  } finally {
    wipe(entropy, password);
  }
}

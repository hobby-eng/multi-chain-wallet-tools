// The BIP32 master key fingerprint of a BIP39 phrase without a BIP39 passphrase: eight hex
// characters that identify a wallet without revealing its phrase. Backups show it so that a copied
// or recovered phrase can be compared with the original before anyone relies on it.
import { masterFingerprintFromSeed } from "@ckd/core/bip39.js";

/** The host's BIP39 seed function, so that the page can use the same one it derives with. */
export type MnemonicToSeed = (mnemonic: string, passphrase: string) => Uint8Array;

/** The fingerprint for an empty BIP39 passphrase; the seed is wiped before returning. */
export function fingerprintWithoutPassphrase(
  mnemonic: string,
  mnemonicToSeed: MnemonicToSeed,
): string {
  const seed = mnemonicToSeed(mnemonic, "");
  try {
    return masterFingerprintFromSeed(seed);
  } finally {
    seed.fill(0);
  }
}

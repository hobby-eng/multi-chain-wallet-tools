// The BIP32 master key fingerprint of a BIP39 phrase without a BIP39 passphrase: eight hex
// characters that identify a wallet without revealing its phrase. Backups show it so that a copied
// or recovered phrase can be compared with the original before anyone relies on it.
import { MnemonicFingerprint } from "@ckd/core/mnemonic-fingerprint.js";

/** The host's BIP39 seed function, so that the page can use the same one it derives with. */
export type { MnemonicToSeed } from "@ckd/core/mnemonic-fingerprint.js";

/** The fingerprint for an empty BIP39 passphrase; the seed is wiped before returning. */
export const fingerprintWithoutPassphrase =
  MnemonicFingerprint.withoutPassphrase.bind(MnemonicFingerprint);

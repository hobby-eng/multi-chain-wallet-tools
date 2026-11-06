import { HDKey } from "@scure/bip32";
import { Bip32Key } from "./bip32-key.js";

/** The host's synchronous BIP39 seed conversion, shared with the wallet's own derivation. */
export type MnemonicToSeed = (mnemonic: string, passphrase: string) => Uint8Array;

/** Computes BIP32 fingerprints and closes every temporary seed/node lifetime in one place. */
export class MnemonicFingerprint {
  /** Borrow a seed; only the newly created SDK node is consumed and wiped here. */
  static fromSeed(seed: Uint8Array): string {
    using root = Bip32Key.take(HDKey.fromMasterSeed(seed));
    return root.fingerprint;
  }

  /** The returned fingerprint outlives its temporary seed, including when SDK admission fails. */
  static fromPhrase(mnemonic: string, passphrase: string, mnemonicToSeed: MnemonicToSeed): string {
    const seed = mnemonicToSeed(mnemonic, passphrase);
    try {
      return this.fromSeed(seed);
    } finally {
      seed.fill(0);
    }
  }

  /** Backups compare the original wallet with an empty BIP39 passphrase. */
  static withoutPassphrase(mnemonic: string, mnemonicToSeed: MnemonicToSeed): string {
    return this.fromPhrase(mnemonic, "", mnemonicToSeed);
  }
}

// CIP-3's Icarus master key of a Cardano wallet (cardano-foundation/CIPs @7720fed
// CIP-0003/Icarus.md, read 2026-11-13), which Yoroi, Lace, Daedalus and Trezor derive from a BIP39
// phrase (Eternl is said to as well; its code is closed and was not checked): PBKDF2-HMAC-SHA512 of
// the passphrase, salted with the phrase's BIP39 entropy (not its BIP39 seed), 4096 rounds, 96
// bytes, with the root bits that CIP-3 sets (cardano-root.ts). Its
// variant Icarus-Trezor (same document; trezor-firmware @433075c core/src/apps/cardano/seed.py
// L139-144) is Trezor's for wallets made from 24 words with older firmware: it salts with the
// entropy and the phrase's checksum byte, and equals Icarus for every other word count. The page
// computes this root as the seed of the Cardano variants, as it computes BIP39's seed for the
// others; coin-protocols/src/bip32-ed25519.ts derives the keys below it.
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { englishMnemonicToEntropy } from "./bip39.js";
import { bip39ChecksumBits, bip39WordCountOfEntropy } from "./bip39-parameters.js";
import { CARDANO_ROOT_BYTES, setCardanoRootBits } from "./cardano-root.js";
import { concatBytes, wipe } from "./crypto.js";
import { nfkd } from "./unicode-nfkd.js";

/** CIP-3's master keys that come from a phrase's entropy: Icarus, and Trezor's variant of it. */
export type CardanoIcarusMaster = "icarus" | "icarus-trezor";

/** CIP-3 Icarus's PBKDF2 rounds ("iter=4096"). */
const ICARUS_ITERATIONS = 4096;
/** The one word count whose checksum Trezor's variant adds: there it is a whole byte (8 bits). */
const ICARUS_TREZOR_WORDS = 24;
const CHECKSUM_BYTES = bip39ChecksumBits(ICARUS_TREZOR_WORDS) / 8;

/** The PBKDF2 salt of `master`: the entropy, followed for a 24-word Icarus-Trezor root by its checksum byte. */
function saltOf(entropy: Uint8Array, master: CardanoIcarusMaster): Uint8Array {
  if (master !== "icarus-trezor" || bip39WordCountOfEntropy(entropy.length) !== ICARUS_TREZOR_WORDS)
    return entropy.slice();
  const digest = sha256(entropy);
  try {
    return concatBytes(entropy, digest.subarray(0, CHECKSUM_BYTES));
  } finally {
    wipe(digest);
  }
}

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
  let salt: Uint8Array | undefined;
  let password: Uint8Array | undefined;
  try {
    salt = saltOf(entropy, master);
    password = utf8ToBytes(nfkd(passphrase));
    const root = pbkdf2(sha512, password, salt, {
      c: ICARUS_ITERATIONS,
      dkLen: CARDANO_ROOT_BYTES,
    });
    setCardanoRootBits(root);
    return root;
  } finally {
    wipe(entropy, salt, password);
  }
}

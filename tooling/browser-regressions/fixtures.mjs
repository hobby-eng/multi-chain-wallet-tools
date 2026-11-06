import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { p2tr } from "@scure/btc-signer";

const mnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const parentPassphrase = "TREZOR";

const childPassphrase = "browser-child-only";

const encryptionPassphrase = "browser-bip38-only";

const message = "Standalone browser regression: public synthetic wallet only";

const parent = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic, parentPassphrase));

const childEntropy = hmac(
  sha512,
  new TextEncoder().encode("bip-entropy-from-k"),
  parent.derive("m/83696968'/39'/0'/12'/0'").privateKey,
).slice(0, 16);

const childMnemonic = entropyToMnemonic(childEntropy, wordlist);

const childKey = HDKey.fromMasterSeed(mnemonicToSeedSync(childMnemonic, childPassphrase)).derive(
  "m/86'/0'/0'/0/0",
);

const childAddress = p2tr(childKey.publicKey.slice(1)).address;

/** Cohesive fixtures cases; helpers stay private to this module. */
export class BrowserFixtures {
  /** Published bip39-128-2-of-3 fixture, independently checked by the SSKR known-answer harness. */
  static sskrShares = [
    "ur:sskr/goemjzaeadaejoinoyvotkwlptsskispvwbkbwjnamstlubnampf",
    "ur:sskr/goemjzaeadadflihpkmhspcheycndschfhcmkelyvaveiesolrls",
  ];
  /** Independently computed BIP39 phrase of the fixture entropy 000102…0f. */
  static sskrPhrase = "abandon amount liar amount expire adjust cage candy arch gather drum buyer";
  /** Shared mnemonic boundary for the native browser cases. */
  static mnemonic = mnemonic;
  /** Shared message boundary for the native browser cases. */
  static message = message;
  /** Shared parent boundary for the native browser cases. */
  static parent = parent;
  /** Shared parentPassphrase boundary for the native browser cases. */
  static parentPassphrase = parentPassphrase;
  /** Shared childMnemonic boundary for the native browser cases. */
  static childMnemonic = childMnemonic;
  /** Shared childPassphrase boundary for the native browser cases. */
  static childPassphrase = childPassphrase;
  /** Shared childAddress boundary for the native browser cases. */
  static childAddress = childAddress;
  /** Shared encryptionPassphrase boundary for the native browser cases. */
  static encryptionPassphrase = encryptionPassphrase;
}

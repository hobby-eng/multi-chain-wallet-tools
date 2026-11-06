import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { HDKey } from "@scure/bip32";
import { bytesToHex, encodeBase58Check, encodeWif, secp256k1, wipe } from "./crypto.js";
import { rootFromSeed } from "./bip32.js";
import { BIP32_MAINNET_VERSIONS } from "./networks.js";
import { bip39EntropyBytes } from "./bip39-parameters.js";
import { Bip85Error, Bip85Parameters, type Bip85Result } from "./bip85-parameters.js";
import { BITCOIN_MAINNET_WIF, WifVersion } from "./wif-version.js";

const BIP85_PURPOSE = 83696968;
const ENTROPY_DOMAIN = new TextEncoder().encode("bip-entropy-from-k");
const PRIVATE_KEY_BYTES = 32;
// BIP32's 78-byte serialization: version/depth/fingerprint/index/chain-code/private-key marker/key.
const XPRV_PAYLOAD = Object.freeze({ size: 78, chainCode: 13, marker: 45, key: 46 });

type Bip85Root = Uint8Array | string;

/** Owns BIP85 application paths, derivation and temporary-secret cleanup; no source is retained. */
export class Bip85 {
  static #entropyAt(source: Bip85Root, path: string): Uint8Array {
    const root =
      typeof source === "string"
        ? HDKey.fromExtendedKey(source)
        : rootFromSeed(source, BIP32_MAINNET_VERSIONS);
    let child: HDKey | undefined;
    let privateKey: Uint8Array | null = null;
    try {
      child = root.derive(path);
      privateKey = child.privateKey;
      if (privateKey === null) throw new Bip85Error("bip85.private-key");
      return hmac(sha512, ENTROPY_DOMAIN, privateKey);
    } finally {
      wipe(privateKey);
      child?.wipePrivateData();
      root.wipePrivateData();
    }
  }

  static #validScalar(value: Uint8Array): void {
    if (!secp256k1.utils.isValidSecretKey(value)) {
      throw new Bip85Error("bip85.scalar");
    }
  }

  /** Derive BIP39 entropy for the admitted word count and zero-based BIP85 index; the source is borrowed. Invalid parameters fail before entropy derivation. */
  static bip39(
    seed: Bip85Root,
    words: unknown,
    index: number,
  ): { path: string; entropyHex: string } {
    // A JavaScript caller can pass any number: the count is checked before any entropy is derived
    // (AUD-024-API001).
    const wordCount = Bip85Parameters.words(words);
    Bip85Parameters.index(index);
    const byteLength = bip39EntropyBytes(wordCount);
    const path = `m/${BIP85_PURPOSE}'/39'/0'/${wordCount}'/${index}'`;
    const entropy = Bip85.#entropyAt(seed, path);
    const selected = entropy.slice(0, byteLength);
    try {
      return {
        path,
        entropyHex: bytesToHex(selected),
      };
    } finally {
      wipe(entropy, selected);
    }
  }

  /** Derive a compressed WIF at the zero-based BIP85 index and one-byte network version; the source is borrowed. Invalid parameters fail before entropy derivation. */
  static wif(
    seed: Bip85Root,
    index: number,
    wifVersion: number = BITCOIN_MAINNET_WIF,
  ): { path: string; wif: string } {
    Bip85Parameters.index(index);
    new WifVersion(wifVersion);
    const path = `m/${BIP85_PURPOSE}'/2'/${index}'`;
    const entropy = Bip85.#entropyAt(seed, path);
    const privateKey = entropy.slice(0, PRIVATE_KEY_BYTES);
    try {
      Bip85.#validScalar(privateKey);
      return { path, wif: encodeWif(privateKey, wifVersion) };
    } finally {
      wipe(entropy, privateKey);
    }
  }

  /** Derive the BIP85 master extended private key at a zero-based index; all temporary serialization bytes are wiped. Invalid parameters fail before entropy derivation. */
  static xprv(seed: Bip85Root, index: number): { path: string; xprv: string } {
    Bip85Parameters.index(index);
    const path = `m/${BIP85_PURPOSE}'/32'/${index}'`;
    const entropy = Bip85.#entropyAt(seed, path);
    const privateKey = entropy.slice(PRIVATE_KEY_BYTES);
    // BIP32's serialized extended-key payload holds both the chain code and private scalar.
    const payload = new Uint8Array(XPRV_PAYLOAD.size);
    try {
      Bip85.#validScalar(privateKey);
      new DataView(payload.buffer).setUint32(0, BIP32_MAINNET_VERSIONS.private);
      payload.set(entropy.subarray(0, PRIVATE_KEY_BYTES), XPRV_PAYLOAD.chainCode);
      payload[XPRV_PAYLOAD.marker] = 0;
      payload.set(privateKey, XPRV_PAYLOAD.key);
      return { path, xprv: encodeBase58Check(payload) };
    } finally {
      wipe(entropy, privateKey, payload);
    }
  }

  /** Derive 16 through 64 bytes of BIP85 entropy as hex at a zero-based index; the source is borrowed. Invalid parameters fail before entropy derivation. */
  static hex(seed: Bip85Root, bytes: unknown, index: number): { path: string; entropyHex: string } {
    Bip85Parameters.index(index);
    const byteLength = Bip85Parameters.bytes(bytes);
    const path = `m/${BIP85_PURPOSE}'/128169'/${byteLength}'/${index}'`;
    const entropy = Bip85.#entropyAt(seed, path);
    try {
      return { path, entropyHex: bytesToHex(entropy.subarray(0, byteLength)) };
    } finally {
      wipe(entropy);
    }
  }

  /** Dispatch an admitted application; unknown runtime application values fail before key work. */
  static derive(seed: Bip85Root, input: unknown): Bip85Result {
    const options = new Bip85Parameters(input).options;
    switch (options.application) {
      case "bip39": {
        const result = Bip85.bip39(seed, options.words, options.index);
        return {
          path: result.path,
          value: result.entropyHex,
          entropyHex: result.entropyHex,
          kind: options.application,
        };
      }
      case "wif": {
        const result = Bip85.wif(seed, options.index, options.wifVersion);
        return { path: result.path, value: result.wif, kind: options.application };
      }
      case "xprv": {
        const result = Bip85.xprv(seed, options.index);
        return { path: result.path, value: result.xprv, kind: options.application };
      }
      case "hex": {
        const result = Bip85.hex(seed, options.bytes, options.index);
        return { path: result.path, value: result.entropyHex, kind: options.application };
      }
    }
  }
}

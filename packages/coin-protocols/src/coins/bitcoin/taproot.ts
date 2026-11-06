import { schnorr } from "@noble/curves/secp256k1.js";
import { bech32m } from "@scure/base";
import {
  bytesToHex,
  bytesToNumber,
  concatBytes,
  encodeWif,
  numberTo32Bytes,
  secp256k1,
  wipe,
} from "@ckd/core/crypto.js";
import type { BitcoinNetwork } from "@ckd/core/networks.js";

// BIP340 compressed points and BIP341 key-path witness programs with no script tree.
const PUBLIC_KEY_BYTES = 33;
const EVEN_KEY_PREFIX = 0x02;
const ODD_KEY_PREFIX = 0x03;
const WITNESS_VERSION = 1;
const SCRIPT_PREFIX = "5120";
const TWEAK_TAG = "TapTweak";
const ERROR_TEXT = {
  "taproot.compressed-public-key":
    "Taproot address derivation requires a compressed secp256k1 public key.",
  "taproot.invalid-private-key": "Taproot derivation requires a valid secp256k1 private key.",
  "taproot.invalid-tweak": "Invalid Taproot tweak: value exceeds the curve order.",
  "taproot.zero-output-private-key": "Invalid zero Taproot output private key.",
} as const;

/** Stable input or arithmetic refusals of key-path Taproot derivation. */
export type TaprootErrorCode = keyof typeof ERROR_TEXT;

/** An input-free refusal; `code` is stable and carries no private key material. */
export class TaprootError extends Error {
  readonly code: TaprootErrorCode;
  constructor(code: TaprootErrorCode) {
    super(ERROR_TEXT[code]);
    this.name = "TaprootError";
    this.code = code;
  }
}

/** Key-path Taproot outputs; private hex/WIF strings belong to the requesting caller. */
export interface TaprootDetails {
  /** Bech32m address on the selected network. */
  readonly address: string;
  /** The 32-byte internal x-only public key, in hexadecimal. */
  readonly internalKeyHex: string;
  /** The 32-byte TapTweak hash, in hexadecimal. */
  readonly tapTweakHex: string;
  /** The 32-byte output x-only public key, in hexadecimal. */
  readonly outputKeyHex: string;
  /** The 33-byte output compressed public key, in hexadecimal. */
  readonly outputCompressedPublicKeyHex: string;
  /** The tweaked private scalar, in 32-byte hexadecimal. */
  readonly outputPrivateKeyHex: string;
  /** The tweaked private scalar as compressed WIF on the selected network. */
  readonly outputPrivateKeyWif: string;
  /** The version-one, 32-byte witness program, as script hexadecimal. */
  readonly scriptPubKeyHex: string;
}

/** The public-only projection, requiring no private key and carrying no private transports. */
export type TaprootAddress = Omit<TaprootDetails, "outputPrivateKeyHex" | "outputPrivateKeyWif">;

/** BIP341 key-path TapTweak for BIP86, owning temporary private output bytes until serialization. */
export class Taproot implements Disposable {
  readonly #outputPrivateKey: Uint8Array;

  private constructor(outputSecret: bigint) {
    this.#outputPrivateKey = numberTo32Bytes(outputSecret);
  }

  /**
   * Borrows a compressed public key and returns independent public address details.
   * Refuses malformed point encodings or an out-of-order tweak with `TaprootError`.
   */
  static address(childPublicKey: Uint8Array, network: BitcoinNetwork): TaprootAddress {
    if (
      !(childPublicKey instanceof Uint8Array) ||
      childPublicKey.length !== PUBLIC_KEY_BYTES ||
      (childPublicKey[0] !== EVEN_KEY_PREFIX && childPublicKey[0] !== ODD_KEY_PREFIX)
    ) {
      throw new TaprootError("taproot.compressed-public-key");
    }
    const internalKey = childPublicKey.slice(1);
    const tweakBytes = schnorr.utils.taggedHash(TWEAK_TAG, internalKey);
    const tweak = bytesToNumber(tweakBytes);
    const order = secp256k1.Point.Fn.ORDER;
    if (tweak >= order) throw new TaprootError("taproot.invalid-tweak");
    const internalPoint = Taproot.#internalPoint(internalKey);
    const outputPoint =
      tweak === 0n ? internalPoint : internalPoint.add(secp256k1.Point.BASE.multiply(tweak));
    const outputKey = numberTo32Bytes(outputPoint.x);
    const outputCompressed = concatBytes(
      Uint8Array.of((outputPoint.y & 1n) === 0n ? EVEN_KEY_PREFIX : ODD_KEY_PREFIX),
      outputKey,
    );
    return {
      address: bech32m.encode(network.bech32Hrp, [WITNESS_VERSION, ...bech32m.toWords(outputKey)]),
      internalKeyHex: bytesToHex(internalKey),
      tapTweakHex: bytesToHex(tweakBytes),
      outputKeyHex: bytesToHex(outputKey),
      outputCompressedPublicKeyHex: bytesToHex(outputCompressed),
      scriptPubKeyHex: `${SCRIPT_PREFIX}${bytesToHex(outputKey)}`,
    };
  }

  static #internalPoint(internalKey: Uint8Array): ReturnType<typeof schnorr.utils.lift_x> {
    try {
      return schnorr.utils.lift_x(bytesToNumber(internalKey));
    } catch {
      throw new TaprootError("taproot.compressed-public-key");
    }
  }

  /**
   * Borrows a private key, returning public details and caller-owned private hex/WIF strings.
   * The temporary output bytes are cleared on success or failure; the input is never cleared.
   * Refuses invalid scalars and a zero tweaked scalar with `TaprootError`; WIF refusals propagate.
   */
  static details(childPrivateKey: Uint8Array, network: BitcoinNetwork): TaprootDetails {
    if (!secp256k1.utils.isValidSecretKey(childPrivateKey))
      throw new TaprootError("taproot.invalid-private-key");
    const childPublicKey = secp256k1.getPublicKey(childPrivateKey, true);
    const publicDetails = Taproot.address(childPublicKey, network);
    const tweak = BigInt(`0x${publicDetails.tapTweakHex}`);
    const order = secp256k1.Point.Fn.ORDER;
    const childSecret = bytesToNumber(childPrivateKey);
    const normalizedSecret =
      childPublicKey[0] === ODD_KEY_PREFIX ? order - childSecret : childSecret;
    const outputSecret = (normalizedSecret + tweak) % order;
    if (outputSecret === 0n) throw new TaprootError("taproot.zero-output-private-key");
    using output = new Taproot(outputSecret);

    return {
      ...publicDetails,
      outputPrivateKeyHex: bytesToHex(output.#outputPrivateKey),
      outputPrivateKeyWif: encodeWif(output.#outputPrivateKey, network.wif),
    };
  }

  /** Clears temporary mutable private bytes as far as the runtime allows; safe to repeat. */
  wipe(): void {
    wipe(this.#outputPrivateKey);
  }

  /** Ends the temporary output key's lifetime, including a refused serialization. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

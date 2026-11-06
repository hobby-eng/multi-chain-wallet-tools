import { HDKey } from "@scure/bip32";
import { requirePrivate, requirePublic } from "./bip32.js";
import { wipe } from "./crypto.js";

// A BIP32 fingerprint is four bytes, with two hexadecimal digits per byte.
const FINGERPRINT_HEX_DIGITS = 4 * 2;
const ERROR_TEXT = {
  "bip32.owner-wiped": "This BIP32 key owner has ended its lifetime.",
  "bip32.owner-node": "A BIP32 key owner requires an HDKey instance.",
} as const;

/** A resource ownership refusal, without key data or caller input. */
export class Bip32KeyError extends Error {
  readonly code: keyof typeof ERROR_TEXT;
  constructor(code: keyof typeof ERROR_TEXT) {
    super(ERROR_TEXT[code]);
    this.name = "Bip32KeyError";
    this.code = code;
  }
}

/**
 * Owns one SDK node and its explicitly borrowed byte views until wipe/disposal.
 * SDK-internal temporaries and immutable extended-key strings remain outside this owner's reach.
 */
export class Bip32Key implements Disposable {
  #node: HDKey | undefined;
  #private: Uint8Array | undefined;
  #public: Uint8Array | undefined;

  private constructor(node: HDKey) {
    this.#node = node;
  }

  /** Takes exclusive ownership of a newly created node, never a caller's borrowed root. */
  static take(node: HDKey): Bip32Key {
    if (!(node instanceof HDKey)) throw new Bip32KeyError("bip32.owner-node");
    return new Bip32Key(node);
  }

  /** A borrowed SDK node, valid only during this owner's lifetime; not a transfer of ownership. */
  get node(): HDKey {
    if (this.#node === undefined) throw new Bip32KeyError("bip32.owner-wiped");
    return this.#node;
  }

  /** A borrowed private-key byte view; copied SDK bytes are wiped with this owner. */
  privateKey(path: string): Uint8Array {
    const node = this.node;
    this.#private ??= requirePrivate(node, path);
    return this.#private;
  }

  /** A borrowed public-key byte view; a missing SDK public key is refused by its shared rule. */
  publicKey(path: string): Uint8Array {
    const node = this.node;
    this.#public ??= requirePublic(node, path);
    return this.#public;
  }

  /** The SDK's BIP32 fingerprint as exactly eight hexadecimal digits. */
  get fingerprint(): string {
    return this.node.fingerprint.toString(16).padStart(FINGERPRINT_HEX_DIGITS, "0");
  }

  /** Clears the views and node as far as the runtime permits, even if one disposer throws. */
  wipe(): void {
    const node = this.#node;
    if (node === undefined) return;
    this.#node = undefined;
    try {
      wipe(this.#private);
    } finally {
      try {
        wipe(this.#public);
      } finally {
        this.#private = undefined;
        this.#public = undefined;
        node.wipePrivateData();
      }
    }
  }

  /** Ends the node lifetime on every exit from its using scope. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

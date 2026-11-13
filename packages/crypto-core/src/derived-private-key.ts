import { bytesToHex, hexToBytes, secp256k1 } from "./crypto.js";
import { DerivationSecrets, DerivationSecretsError } from "./secrets.js";
import type { DerivationResult, ResultField } from "./types.js";

/** The bytes of a signing key, a secp256k1 scalar or an Ed25519 seed. */
const KEY_BYTES = 32;

/**
 * Where a coin's rows keep the key that signs, and how that field writes it: the coin owns its key
 * text, such as Stellar's S… seed or TON's 64-byte secret.
 */
export interface DerivedKeySource {
  /** The secret row field that holds the key. */
  readonly field: string;
  /**
   * The key's 32 bytes, which the caller owns and wipes; it throws on any other text and wipes
   * its own copies first.
   */
  read(this: void, text: string): Uint8Array;
}

/** A secp256k1 key written as 64 hex digits, refused unless it is a valid scalar. */
function secp256k1Hex(text: string): Uint8Array {
  const bytes = hexToBytes(text);
  if (secp256k1.utils.isValidSecretKey(bytes)) return bytes;
  bytes.fill(0);
  throw new DerivationSecretsError("derivation.key.material");
}

/** A secp256k1 key in `field` as 64 hex digits, such as Ethereum's `privateKey`. */
export function secp256k1HexKey(field: string): DerivedKeySource {
  return Object.freeze({ field, read: secp256k1Hex });
}

/** An Ed25519 seed in `field` as 64 hex digits, such as Solana's and NEAR's `privateKeyHex`. */
export function ed25519HexSeed(field: string): DerivedKeySource {
  return Object.freeze({
    field,
    read: (text: string) => {
      const bytes = hexToBytes(text);
      if (bytes.length === KEY_BYTES) return bytes;
      bytes.fill(0);
      throw new DerivationSecretsError("derivation.key.material");
    },
  });
}

/** Owns one derived key until an asynchronous signing/encryption use ends. */
export class DerivedPrivateKey implements Disposable {
  readonly #fields: readonly ResultField[];
  #bytes: Uint8Array | undefined;

  /**
   * Bind the key to the row's field `addressKey`, which must hold `address`: the row's address, or
   * another public payment-address form of it, such as Bitcoin Cash's legacy one. The key is read
   * from the secret field that the coin's `source` names, in the coin's own text, or else from
   * `privateKeyHex` or `childPrivateKey` as a secp256k1 key in hex. The consumed result is retired
   * before the key is lent.
   */
  constructor(
    result: DerivationResult,
    address: string,
    addressKey = "address",
    source?: DerivedKeySource,
  ) {
    this.#fields = [];
    let failure: DerivationSecretsError | undefined;
    try {
      DerivationSecrets.take(result);
      const row = result.rows[0];
      const fields = row === undefined ? [] : [...row.basic, ...row.advanced];
      const bound = fields.some(
        (field) =>
          field.key === addressKey &&
          (field.key === "address" || field.role === "paymentAddress") &&
          !field.secret &&
          field.value === address,
      );
      if (!bound) throw new DerivationSecretsError("derivation.key.address");
      const privateField = fields.find((field) =>
        source === undefined
          ? field.key === "privateKeyHex" || field.key === "childPrivateKey"
          : field.key === source.field,
      );
      if (privateField === undefined)
        throw new DerivationSecretsError("derivation.key.unavailable");
      if (!privateField.secret) throw new DerivationSecretsError("derivation.key.material");
      // The immutable library view ends with this synchronous constructor, before any await.
      this.#bytes = (source?.read ?? secp256k1Hex)(privateField.value);
      // Signing needs public script metadata; private result fields have no authority here.
      this.#fields = fields.filter((field) => !field.secret).map((field) => ({ ...field }));
    } catch (cause) {
      this.wipe();
      failure =
        cause instanceof DerivationSecretsError
          ? cause
          : new DerivationSecretsError("derivation.key.material");
    }
    // Retire every result path before either returning a key or reporting an admission failure.
    try {
      DerivationSecrets.clear(result);
    } catch (cause) {
      this.wipe();
      throw cause;
    }
    if (failure !== undefined) throw failure;
  }

  /** Borrow key bytes only until wipe/disposal; native copies cannot be recalled. */
  get bytes(): Uint8Array {
    if (this.#bytes === undefined) throw new DerivationSecretsError("derivation.result.retired");
    return this.#bytes;
  }

  /** Fresh temporary hexadecimal view for a library whose existing seam takes text. */
  get hex(): string {
    return bytesToHex(this.bytes);
  }

  /** Borrow public field snapshots for the selected signing protocol until disposal. */
  get fields(): readonly ResultField[] {
    if (this.#bytes === undefined) throw new DerivationSecretsError("derivation.result.retired");
    return this.#fields;
  }

  /** Revoke access and wipe the owned key bytes; native copies cannot be recalled. */
  wipe(): void {
    const bytes = this.#bytes;
    this.#bytes = undefined;
    bytes?.fill(0);
  }

  /** Release the key on successful or failed asynchronous consumption. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

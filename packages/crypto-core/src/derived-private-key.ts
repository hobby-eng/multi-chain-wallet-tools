import { bytesToHex, hexToBytes, secp256k1 } from "./crypto.js";
import { DerivationSecrets, DerivationSecretsError } from "./secrets.js";
import type { DerivationResult, ResultField } from "./types.js";

/** Owns one derived secp256k1 key until an asynchronous signing/encryption use ends. */
export class DerivedPrivateKey implements Disposable {
  readonly #fields: readonly ResultField[];
  #bytes: Uint8Array | undefined;

  /** Bind the key to its public address and retire the consumed result before lending the key. */
  constructor(result: DerivationResult, address: string) {
    this.#fields = [];
    let failure: DerivationSecretsError | undefined;
    try {
      DerivationSecrets.take(result);
      const row = result.rows[0];
      const derived = row?.basic.find((field) => field.key === "address" && !field.secret)?.value;
      if (derived !== address) throw new DerivationSecretsError("derivation.key.address");
      const fields = row === undefined ? [] : [...row.basic, ...row.advanced];
      const privateField = fields.find(
        (field) => field.key === "privateKeyHex" || field.key === "childPrivateKey",
      );
      if (privateField === undefined)
        throw new DerivationSecretsError("derivation.key.unavailable");
      if (!privateField.secret) throw new DerivationSecretsError("derivation.key.material");
      // The immutable library view ends with this synchronous constructor, before any await.
      this.#bytes = hexToBytes(privateField.value);
      if (!secp256k1.utils.isValidSecretKey(this.#bytes))
        throw new DerivationSecretsError("derivation.key.material");
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

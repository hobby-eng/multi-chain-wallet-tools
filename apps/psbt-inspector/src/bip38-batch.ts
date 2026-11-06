import { SecretValue } from "@ckd/core/secret-value.js";
import { decryptBip38Key } from "./bip38-decryptor.js";
import { Bip38Input, Bip38InputError } from "./bip38-input.js";
import type { PsbtChain, PsbtNetwork } from "./psbt-types.js";

/** One bounded request owns literal input snapshots until completion, cancellation or disposal. */
export class Bip38Batch implements Disposable {
  readonly #literal: SecretValue<readonly string[]>;
  readonly #keys: SecretValue<readonly string[]>;
  readonly #chain: PsbtChain;
  readonly #network: PsbtNetwork;
  readonly #count: number;
  #released = false;

  /** Snapshots admitted literal fields; password normalization stays in the cryptographic API. */
  constructor(text: string, password: string, chain: unknown, network: unknown) {
    const keys = Bip38Input.batch(text);
    Bip38Input.password(password);
    this.#chain = Bip38Input.chain(chain);
    this.#network = Bip38Input.network(this.#chain, network);
    this.#count = keys.length;
    this.#literal = SecretValue.utf16Texts([text, password]);
    try {
      this.#keys = SecretValue.utf16Texts(keys);
    } catch (cause) {
      this.#literal.wipe();
      throw cause;
    }
  }

  /** Number of distinct admitted keys, before any cryptographic outcome is known. */
  get count(): number {
    return this.#count;
  }

  /** Exact literal equality also catches programmatic field changes without native input events. */
  matches(text: string, password: string, chain: string, network: string): boolean {
    if (this.#released) return false;
    const [originalText, originalPassword] = this.#literal.value;
    return (
      text === originalText &&
      password === originalPassword &&
      chain === this.#chain &&
      network === this.#network
    );
  }

  /** Recovers one admitted key; the caller must still verify current publication ownership. */
  decrypt(index: number): ReturnType<typeof decryptBip38Key> {
    if (this.#released) throw new Bip38InputError("released");
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.#count)
      throw new Bip38InputError("index");
    const key = this.#keys.value[index];
    const password = this.#literal.value[1];
    if (key === undefined || password === undefined) throw new Bip38InputError("released");
    return decryptBip38Key(key, password, this.#chain, this.#network);
  }

  /** Retires mutable snapshots; an already running KDF ends under its own library cleanup. */
  wipe(): void {
    this.#released = true;
    this.#literal.wipe();
    this.#keys.wipe();
  }
  [Symbol.dispose](): void {
    this.wipe();
  }
}

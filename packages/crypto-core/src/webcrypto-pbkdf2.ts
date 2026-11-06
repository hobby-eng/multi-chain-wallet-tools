const ENCODER = new TextEncoder();
const BITS_PER_BYTE = 8;

/** PBKDF2-HMAC-SHA512 with owned UTF-8 input bytes and a borrowed WebCrypto service. */
export class WebCryptoPbkdf2 implements Disposable {
  #password = new Uint8Array();
  #salt = new Uint8Array();

  private constructor(password: string, salt: string) {
    try {
      this.#password = ENCODER.encode(password);
      this.#salt = ENCODER.encode(salt);
    } catch (cause) {
      this.wipe();
      throw cause;
    }
  }

  /**
   * Derives `bytes` bytes with `rounds` iterations, without normalizing either input string.
   * The caller owns the result. Both input encodings are cleared after settlement, including
   * import/derive refusals, which propagate unchanged. WebCrypto owns its internal key copies.
   */
  static async derive(
    subtle: Pick<SubtleCrypto, "importKey" | "deriveBits">,
    password: string,
    salt: string,
    rounds: number,
    bytes: number,
  ): Promise<Uint8Array> {
    using inputs = new WebCryptoPbkdf2(password, salt);
    const key = await subtle.importKey("raw", inputs.#password, "PBKDF2", false, ["deriveBits"]);
    const bits = await subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-512", salt: inputs.#salt, iterations: rounds },
      key,
      bytes * BITS_PER_BYTE,
    );
    return new Uint8Array(bits);
  }

  /** Overwrites owned input bytes as far as the runtime allows; safe to repeat. */
  wipe(): void {
    this.#password.fill(0);
    this.#salt.fill(0);
  }

  /** Clears the input encodings when the asynchronous derivation scope ends. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

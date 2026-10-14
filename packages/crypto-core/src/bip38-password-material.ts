import { ecb } from "@noble/ciphers/aes.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { wipe } from "./crypto.js";

/** BIP38 non-EC-multiplied keys use two 32-byte halves of the 64-byte scrypt result. */
const KEY_BYTES = 32;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 8, dkLen: KEY_BYTES * 2 } as const;
type KeyDerivation = (
  password: Uint8Array,
  salt: Uint8Array,
  options: typeof SCRYPT_OPTIONS,
) => Promise<Uint8Array>;

/** Owns NFC password bytes, KDF material and the AES/mask operations for one BIP38 lifetime. */
export class Bip38PasswordMaterial {
  readonly #derived: Uint8Array;
  #disposed = false;

  private constructor(derived: Uint8Array) {
    this.#derived = derived;
  }

  static assertPassphrase(passphrase: string): void {
    if (passphrase.length === 0) throw new Error("Enter a BIP38 passphrase.");
  }

  static async with<T>(
    passphrase: string,
    salt: Uint8Array,
    use: (material: Bip38PasswordMaterial) => T | Promise<T>,
    derive: KeyDerivation = scryptAsync,
  ): Promise<T> {
    Bip38PasswordMaterial.assertPassphrase(passphrase);
    const password = new TextEncoder().encode(passphrase.normalize("NFC"));
    let derived: Uint8Array | undefined;
    let material: Bip38PasswordMaterial | undefined;
    try {
      derived = await derive(password, salt, SCRYPT_OPTIONS);
      if (!(derived instanceof Uint8Array) || derived.length !== SCRYPT_OPTIONS.dkLen)
        throw new Error("BIP38 key derivation returned invalid material.");
      material = new Bip38PasswordMaterial(derived);
      // Await the consumer too: an asynchronous consumer must finish before its material is wiped.
      return await use(material);
    } finally {
      material?.dispose();
      wipe(password);
      // Refused KDF output has no material owner yet but can still contain secret bytes.
      if (derived instanceof Uint8Array) wipe(derived);
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("BIP38 password material has been disposed.");
  }

  #masked(bytes: Uint8Array): Uint8Array {
    this.#assertActive();
    if (bytes.length !== KEY_BYTES) throw new Error(`BIP38 key block must be ${KEY_BYTES} bytes.`);
    return Uint8Array.from(bytes, (value, index) => value ^ this.#derived[index]!);
  }

  encrypt(privateKey: Uint8Array): Uint8Array {
    const block = this.#masked(privateKey);
    try {
      return ecb(this.#derived.subarray(KEY_BYTES), { disablePadding: true }).encrypt(block);
    } finally {
      wipe(block);
    }
  }

  decrypt(encrypted: Uint8Array): Uint8Array {
    this.#assertActive();
    const block = ecb(this.#derived.subarray(KEY_BYTES), { disablePadding: true }).decrypt(
      encrypted,
    );
    try {
      return this.#masked(block);
    } finally {
      wipe(block);
    }
  }

  dispose(): void {
    wipe(this.#derived);
    this.#disposed = true;
  }
}

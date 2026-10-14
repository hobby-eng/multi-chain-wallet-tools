import { MINIMAL_BYTEWORDS } from "../../recovery-mnemocode/source/sskr/bytewords-list.js";
import { CRC32_BYTES, crc32 } from "../../recovery-mnemocode/source/sskr/checksum.js";

/** Small public dCBOR inputs; the production Envelope decoder remains under test. */
export class GordianAdmissionFixtures {
  static readonly entropy = Uint8Array.from({ length: 16 }, (_, index) => index);
  static readonly keyBytes = 32;
  static readonly #leafTag = [0xd8, 201]; // bc-tags: leaf tag 201.

  static #ur(type: string, payload: Uint8Array): string {
    const transport = new Uint8Array(payload.length + CRC32_BYTES);
    transport.set(payload);
    new DataView(transport.buffer).setUint32(payload.length, crc32(payload));
    return `ur:${type}/${Array.from(transport, (byte) => MINIMAL_BYTEWORDS[byte]!).join("")}`;
  }

  static agreementKey(key: Uint8Array): string {
    if (key.length !== this.keyBytes) throw new Error("Fixture key must have 32 bytes.");
    // bc-components encodes agreement-public-key as an untagged CBOR byte string.
    return this.#ur("agreement-public-key", Uint8Array.of(0x58, key.length, ...key));
  }

  static #leaf(value: readonly number[]): number[] {
    return [...this.#leafTag, ...value];
  }

  static #text(text: string): number[] {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length >= 24) throw new Error("Fixture text must use short CBOR form.");
    return [0x60 + bytes.length, ...bytes];
  }

  static seed(objects: readonly (number | string)[]): string {
    const predicate = this.#leaf(this.#text("ckd-bip39-passphrase"));
    const assertions = objects.flatMap((object) => [
      0xa1,
      ...predicate,
      ...this.#leaf(typeof object === "number" ? [object] : this.#text(object)),
    ]);
    // bc-envelope node/assertion forms; known-values: isA=1 and Seed=200.
    return this.#ur(
      "envelope",
      Uint8Array.of(
        0x80 + 2 + objects.length,
        ...this.#leaf([0x50, ...this.entropy]),
        0xa1,
        1,
        0x18,
        200,
        ...assertions,
      ),
    );
  }
}

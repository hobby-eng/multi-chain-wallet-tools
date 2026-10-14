import { readFileSync } from "node:fs";
import { x25519 } from "@noble/curves/ed25519.js";
import { describe, expect, it, vi } from "vitest";
import { SyntheticUr } from "./synthetic-ur.js";

vi.mock("@ckd/recovery-envelope-wasm/recovery_envelope_wasm_bg.wasm", () => ({
  default: readFileSync(
    new URL(
      "../../../packages/recovery-envelope-wasm/generated/recovery_envelope_wasm_bg.wasm",
      import.meta.url,
    ),
  ),
}));

import {
  createProtectedGordianSeedEnvelope,
  deriveGordianRecipientKeys,
  recoverProtectedGordianSeedEnvelopeBundle,
} from "../../../packages/recovery-backup/src/gordian-envelope.js";

// bc-components 0.31.1 encodes this UR's payload as an untagged 32-byte CBOR byte string.
// Reuse the checked-in transport alphabet/checksum; only recipient rejection is under test.
class SyntheticAgreementKey {
  static readonly bytes = 32;
  readonly #key: Uint8Array;

  constructor(firstByte: number) {
    this.#key = new Uint8Array(SyntheticAgreementKey.bytes);
    this.#key[0] = firstByte;
  }

  get raw(): Uint8Array {
    return this.#key.slice();
  }

  get ur(): string {
    const payload = Uint8Array.of(0x58, SyntheticAgreementKey.bytes, ...this.#key);
    return SyntheticUr.encode("agreement-public-key", payload);
  }
}

const entropy = Uint8Array.from({ length: 16 }, (_, index) => index);
const passphrase = "TREZOR"; // Public BIP39 test passphrase; no real wallet data.

describe("AUD-028 Envelope: bounded recipient conformance", () => {
  it("control: two ordinary recipients independently restore entropy and passphrase", () => {
    const owner = deriveGordianRecipientKeys(new Uint8Array(64).fill(7));
    const other = deriveGordianRecipientKeys(new Uint8Array(64).fill(8));
    const wrong = deriveGordianRecipientKeys(new Uint8Array(64).fill(9));
    const records = createProtectedGordianSeedEnvelope(entropy, "", "", {
      bip39Passphrase: passphrase,
      recipientPublicKeys: [owner.publicKey, other.publicKey],
    });
    expect(records).toHaveLength(1);
    for (const recipient of [owner, other]) {
      expect(recoverProtectedGordianSeedEnvelopeBundle(records, "", recipient.privateKey)).toEqual({
        entropy,
        bip39Passphrase: passphrase,
      });
    }
    expect(() =>
      recoverProtectedGordianSeedEnvelopeBundle(records, "", wrong.privateKey),
    ).toThrow();
    expect(() => recoverProtectedGordianSeedEnvelopeBundle(records)).toThrow();
  });

  for (const firstByte of [0, 1]) {
    it(`refuses a noncontributory recipient with u=${firstByte} before returning a record`, () => {
      const malformed = new SyntheticAgreementKey(firstByte);
      // RFC 7748 sections 6.1/7 discuss this all-zero result. Noble is an independent
      // negative control, not a replacement for the production WASM implementation.
      expect(() => x25519.getSharedSecret(new Uint8Array(32).fill(7), malformed.raw)).toThrow();
      expect(() =>
        createProtectedGordianSeedEnvelope(entropy, "", "", {
          bip39Passphrase: passphrase,
          recipientPublicKeys: [malformed.ur],
        }),
      ).toThrow();
    });
  }

  it("control: a two-of-three SSKR quorum preserves the included passphrase", () => {
    const records = createProtectedGordianSeedEnvelope(entropy, "", "", {
      bip39Passphrase: passphrase,
      sskrGroupThreshold: 1,
      sskrGroups: [{ threshold: 2, count: 3 }],
    });
    expect(records).toHaveLength(3);
    expect(recoverProtectedGordianSeedEnvelopeBundle([records[0]!, records[2]!])).toEqual({
      entropy,
      bip39Passphrase: passphrase,
    });
    expect(() => recoverProtectedGordianSeedEnvelopeBundle([records[0]!])).toThrow();
  });
});

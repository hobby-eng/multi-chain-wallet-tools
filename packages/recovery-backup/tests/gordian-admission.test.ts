import { readFileSync } from "node:fs";
import { x25519 } from "@noble/curves/ed25519.js";
import { describe, expect, it, vi } from "vitest";
import { GordianAdmissionFixtures as fixture } from "./gordian-admission-fixtures.js";

vi.mock("@ckd/recovery-envelope-wasm/recovery_envelope_wasm_bg.wasm", () => ({
  default: readFileSync(
    new URL(
      "../../recovery-envelope-wasm/generated/recovery_envelope_wasm_bg.wasm",
      import.meta.url,
    ),
  ),
}));
import {
  createProtectedGordianSeedEnvelope,
  deriveGordianRecipientKeys,
  recoverProtectedGordianSeedEnvelopeBundle,
} from "../src/gordian-envelope.js";

describe("Gordian Envelope recipient and typed factor admission", () => {
  it("preserves the public BIP39 passphrase through either valid recipient", () => {
    const owner = deriveGordianRecipientKeys(new Uint8Array(64).fill(7));
    const other = deriveGordianRecipientKeys(new Uint8Array(64).fill(8));
    const wrong = deriveGordianRecipientKeys(new Uint8Array(64).fill(9));
    const records = createProtectedGordianSeedEnvelope(fixture.entropy, "", "", {
      bip39Passphrase: "TREZOR",
      recipientPublicKeys: [owner.publicKey, other.publicKey],
    });
    for (const recipient of [owner, other])
      expect(recoverProtectedGordianSeedEnvelopeBundle(records, "", recipient.privateKey)).toEqual({
        entropy: fixture.entropy,
        bip39Passphrase: "TREZOR",
      });
    expect(() =>
      recoverProtectedGordianSeedEnvelopeBundle(records, "", wrong.privateKey),
    ).toThrow();
    expect(() => recoverProtectedGordianSeedEnvelopeBundle(records)).toThrow();
  });

  it("refuses low-order recipients and RFC7748 equivalent encodings", () => {
    const keys: Uint8Array[] = [new Uint8Array(fixture.keyBytes)];
    const one = new Uint8Array(fixture.keyBytes);
    one[0] = 1;
    keys.push(one);
    // RFC7748 requires field reduction; p and p+1 are u=0 and u=1 again.
    for (const first of [0xed, 0xee]) {
      const key = new Uint8Array(fixture.keyBytes).fill(0xff);
      key[0] = first;
      key[key.length - 1] = 0x7f;
      keys.push(key);
    }
    for (const original of keys) {
      const masked = original.slice();
      masked[masked.length - 1] = masked[masked.length - 1]! | 0x80;
      for (const key of [original, masked]) {
        // Independent negative control; no ciphertext is decrypted with a weak key.
        expect(() => x25519.getSharedSecret(new Uint8Array(32).fill(7), key)).toThrow();
        expect(() =>
          createProtectedGordianSeedEnvelope(fixture.entropy, "", "", {
            recipientPublicKeys: [fixture.agreementKey(key)],
          }),
        ).toThrow(/contributory/u);
      }
    }
  });

  it("accepts absent or typed passphrases and refuses malformed or duplicate assertions", () => {
    expect(recoverProtectedGordianSeedEnvelopeBundle([fixture.seed([])])).toEqual({
      entropy: fixture.entropy,
    });
    expect(recoverProtectedGordianSeedEnvelopeBundle([fixture.seed(["TREZOR"])])).toEqual({
      entropy: fixture.entropy,
      bip39Passphrase: "TREZOR",
    });
    expect(recoverProtectedGordianSeedEnvelopeBundle([fixture.seed([""])])).toEqual({
      entropy: fixture.entropy,
      bip39Passphrase: "",
    });
    expect(() => recoverProtectedGordianSeedEnvelopeBundle([fixture.seed([1])])).toThrow();
    expect(() =>
      recoverProtectedGordianSeedEnvelopeBundle([fixture.seed(["TREZOR", "other"])]),
    ).toThrow();
  });
});

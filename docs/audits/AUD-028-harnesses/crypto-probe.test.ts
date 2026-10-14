import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SyntheticUr } from "./synthetic-ur.js";

const syntheticRandom = vi.hoisted(() => ({ lastBit: 0 }));
vi.mock("@ckd/core/secure-random.js", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  // Only randomness is replaced, allowing enumeration of both last-byte LSB choices.
  secureRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    bytes[length - 1] = syntheticRandom.lastBit;
    return bytes;
  },
}));
vi.mock("@ckd/recovery-codex32-wasm/recovery_codex32_wasm_bg.wasm", () => ({
  default: readFileSync(
    new URL(
      "../../../packages/recovery-codex32-wasm/generated/recovery_codex32_wasm_bg.wasm",
      import.meta.url,
    ),
  ),
}));
vi.mock("@ckd/dash-wasm/dash_shielded_wasm_bg.wasm", () => ({
  default: readFileSync(
    new URL(
      "../../../packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm",
      import.meta.url,
    ),
  ),
}));
vi.mock("@ckd/recovery-envelope-wasm/recovery_envelope_wasm_bg.wasm", () => ({
  default: readFileSync(
    new URL(
      "../../../packages/recovery-envelope-wasm/generated/recovery_envelope_wasm_bg.wasm",
      import.meta.url,
    ),
  ),
}));

import {
  createCodex32Shares,
  recoverCodex32Shares,
} from "../../../packages/recovery-backup/src/codex32.js";
import { deriveDashShielded } from "../../../packages/coin-protocols/src/coins/dash/shielded.js";
import { recoverProtectedGordianSeedEnvelopeBundle } from "../../../packages/recovery-backup/src/gordian-envelope.js";

const official = JSON.parse(
  readFileSync(
    new URL("../../../packages/recovery-backup/tests/fixtures/bip93-vectors.json", import.meta.url),
    "utf8",
  ),
).shared[0] as { seed: string; shares: string[] };

describe("AUD-028 crypto: bounded actual-codec contracts", () => {
  it("control: official BIP93 vector two restores in either complete presentation case", () => {
    const seed = Uint8Array.from(Buffer.from(official.seed, "hex"));
    expect(recoverCodex32Shares(official.shares)).toEqual(seed);
    expect(recoverCodex32Shares(official.shares.map((share) => share.toLowerCase()))).toEqual(seed);
    const invalid = official.shares[0]!.slice(0, 10) + official.shares[0]!.slice(10).toLowerCase();
    expect(() => recoverCodex32Shares([invalid, official.shares[1]!])).toThrow();
  });

  it("restores compatible individually valid upper-case and lower-case BIP93 shares", () => {
    expect(recoverCodex32Shares([official.shares[0]!, official.shares[1]!.toLowerCase()])).toEqual(
      Uint8Array.from(Buffer.from(official.seed, "hex")),
    );
  });

  it("does not reveal the secret last bit through the last symbol of a below-threshold share", () => {
    const projections: string[][] = [];
    // 256 data bits occupy 52 GF(32) symbols; from_seed zero-pads the final four bits.
    // Pointwise interpolation makes other symbols irrelevant to this last-symbol projection.
    const checksumSymbols = 13; // BIP93 short checksum for this 32-byte payload.
    for (const secretBit of [0, 1]) {
      const seed = new Uint8Array(32);
      seed[31] = secretBit;
      const symbols: string[] = [];
      for (const randomBit of [0, 1]) {
        syntheticRandom.lastBit = randomBit;
        const shares = createCodex32Shares(seed, "test", 2, 2).shares;
        expect(recoverCodex32Shares(shares)).toEqual(seed);
        const second = shares[1]!; // First generated share is index a; second is index c.
        symbols.push(second[second.length - checksumSymbols - 1]!);
      }
      projections.push([...new Set(symbols)].sort());
    }
    // These projection supports must agree if the one-share observation hides this bit.
    expect(projections[0]).toEqual(projections[1]);
  });

  it("keeps caller-owned BIP39 seed bytes intact after Dash Shielded derivation", () => {
    const seed = Uint8Array.from({ length: 64 }, (_, index) => index);
    const original = seed.slice();
    const result = deriveDashShielded({ seed, network: "testnet", account: 0, start: 0, count: 1 });
    expect(result.rows).toHaveLength(1);
    expect(seed).toEqual(original);
  });

  it("returns the same Dash Shielded output when the same caller seed is reused", () => {
    const seed = Uint8Array.from({ length: 64 }, (_, index) => index);
    const options = { seed, network: "testnet" as const, account: 0, start: 0, count: 1 };
    const first = deriveDashShielded(options);
    const second = deriveDashShielded(options);
    const fresh = deriveDashShielded({
      ...options,
      seed: Uint8Array.from({ length: 64 }, (_, i) => i),
    });
    expect(first).toEqual(fresh);
    expect(second).toEqual(first);
  });
});

/** Small dCBOR fixtures from bc-envelope 0.43.0's documented leaf/node/assertion encodings. */
class SyntheticSeedEnvelope {
  static readonly entropy = Uint8Array.from({ length: 16 }, (_, index) => index);
  // bc-tags 0.12.0: leaf tag 201; known-values 0.15.5: isA=1, Seed=200.
  static readonly leafTag = [0xd8, 201];

  static #leaf(value: readonly number[]): number[] {
    return [...this.leafTag, ...value];
  }

  static #text(text: string): number[] {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length >= 24) throw new Error("Audit fixture text exceeds the short CBOR form.");
    return [0x60 + bytes.length, ...bytes];
  }

  static record(objects: readonly (number | string)[]): string {
    const predicate = this.#leaf(this.#text("ckd-bip39-passphrase"));
    const assertions = objects.flatMap((object) => [
      0xa1,
      ...predicate,
      ...this.#leaf(typeof object === "number" ? [object] : this.#text(object)),
    ]);
    const payload = Uint8Array.of(
      0x80 + 2 + objects.length,
      ...this.#leaf([0x50, ...this.entropy]),
      0xa1,
      1,
      0x18,
      200,
      ...assertions,
    );
    return SyntheticUr.encode("envelope", payload);
  }
}

describe("AUD-028 Envelope: typed passphrase admission", () => {
  it("control: valid typed synthetic assertions preserve entropy and passphrase", () => {
    expect(
      recoverProtectedGordianSeedEnvelopeBundle([SyntheticSeedEnvelope.record(["TREZOR"])]),
    ).toEqual({
      entropy: SyntheticSeedEnvelope.entropy,
      bip39Passphrase: "TREZOR",
    });
    expect(recoverProtectedGordianSeedEnvelopeBundle([SyntheticSeedEnvelope.record([])])).toEqual({
      entropy: SyntheticSeedEnvelope.entropy,
    });
  });

  it("refuses an existing passphrase assertion with the wrong object type", () => {
    expect(() =>
      recoverProtectedGordianSeedEnvelopeBundle([SyntheticSeedEnvelope.record([1])]),
    ).toThrow();
  });

  it("refuses ambiguous duplicate passphrase assertions instead of restoring an empty passphrase", () => {
    expect(() =>
      recoverProtectedGordianSeedEnvelopeBundle([
        SyntheticSeedEnvelope.record(["TREZOR", "other"]),
      ]),
    ).toThrow();
  });
});

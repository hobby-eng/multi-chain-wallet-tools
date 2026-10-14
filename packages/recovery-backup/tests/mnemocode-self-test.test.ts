import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@ckd/recovery-sskr-wasm/recovery_sskr_wasm_bg.wasm", async () => ({
  default: readFileSync(
    new URL("../../recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm", import.meta.url),
  ),
}));

import { bytesOfHex } from "../../recovery-mnemocode/source/core/bits.js";
import {
  checkSskrKnownAnswers,
  sskrSetVector,
} from "../../recovery-mnemocode/source/sskr/known-answers.js";
import { CheckedSskrPlatform } from "../src/mnemocode-share-platform.js";
import { sskrSharePlatform } from "../src/mnemocode-shares.js";
import { runMnemoCodeSelfTest } from "../src/self-test-mnemocode.js";
import { sskrCodec } from "../src/sskr.js";

describe("MnemoCode self-tests in the Deriver", () => {
  it("runs the expanded engine-free known answers through the startup adapter", () => {
    expect(runMnemoCodeSelfTest().passed).toBe(true);
  });

  it("matches recovery and deterministic creation, and refuses bad shares with the host engine", async () => {
    await expect(checkSskrKnownAnswers(sskrSharePlatform(sskrCodec()))).resolves.toBeUndefined();
  });

  it("does not run the engine checks until use, and shares one check between concurrent operations", async () => {
    const host = sskrSharePlatform(sskrCodec());
    const combine = vi.fn(host.combineShares);
    const create = vi.fn(host.createShares);
    const checked = new CheckedSskrPlatform({
      hmacSha256: host.hmacSha256,
      combineShares: combine,
      createShares: create,
    });
    expect(combine).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    const [first, second] = await Promise.all([
      checked.combineShares(sskrSetVector.shares),
      checked.combineShares(sskrSetVector.shares),
    ]);
    try {
      expect(first).toEqual(bytesOfHex(sskrSetVector.entropy));
      expect(second).toEqual(first);
      // One deterministic creation belongs to the shared check, not each pending request.
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      first.fill(0);
      second.fill(0);
    }
  });

  it("keeps the gate closed after a failed known answer and never passes the requested shares", async () => {
    const host = sskrSharePlatform(sskrCodec());
    const combine = vi.fn(async () => new Uint8Array(bytesOfHex(sskrSetVector.entropy).length));
    const create = vi.fn(host.createShares);
    const checked = new CheckedSskrPlatform({
      ...host,
      combineShares: combine,
      createShares: create,
    });
    await expect(checked.combineShares(sskrSetVector.shares)).rejects.toThrow(
      /SSKR recovery self-test failed/u,
    );
    await expect(checked.combineShares(sskrSetVector.shares)).rejects.toThrow(
      /SSKR recovery self-test failed/u,
    );
    expect(combine).toHaveBeenCalledTimes(1);
    expect(combine).not.toHaveBeenCalledWith(sskrSetVector.shares);
    const secret = bytesOfHex(sskrSetVector.entropy);
    const seed = bytesOfHex(sskrSetVector.testOnlySeed);
    try {
      await expect(checked.createShares(secret, 2, 3, seed)).rejects.toThrow(
        /SSKR recovery self-test failed/u,
      );
      expect(create).not.toHaveBeenCalled();
    } finally {
      secret.fill(0);
      seed.fill(0);
    }
  });

  it("refuses a wrong creation answer and clears the public entropy and seed used to check it", async () => {
    const host = sskrSharePlatform(sskrCodec());
    const buffers: Uint8Array[] = [];
    const create: typeof host.createShares = async (secret, threshold, count, seed) => {
      buffers.push(secret, seed);
      return (await host.createShares(secret, threshold, count, seed)).reverse();
    };
    const checked = new CheckedSskrPlatform({ ...host, createShares: create });
    await expect(checked.combineShares(sskrSetVector.shares)).rejects.toThrow(
      /SSKR creation known answer mismatch/u,
    );
    expect(buffers).toHaveLength(2);
    for (const bytes of buffers) expect(bytes.every((byte) => byte === 0)).toBe(true);
  });
});

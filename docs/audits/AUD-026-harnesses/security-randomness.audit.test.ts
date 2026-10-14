// AUD-026 security reviewer (CHECK-SEC-004): the production default random source of the Deriver's
// phrase generators, observed from outside. Web Crypto is replaced by a counting stub; the probes
// call the exported production functions without any injected source and check that every draw
// comes from crypto.getRandomValues (never Math.random), that a source which leaves the buffer
// empty makes a wish-constrained search fail rather than fall back, and that the MnemoCode share
// filler wipes its own copy. Public test data only.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHOSEN_WORDS_KNOWN_ANSWERS,
  generateMnemonicWithChosenWords,
  runChosenWordsSelfTest,
} from "@ckd/core/bip39-chosen-words.js";
import { generateMnemonic } from "@ckd/core/bip39.js";
import { checkSecureRandom, fillSecureRandom } from "@ckd/core/secure-random.js";

/** A counting stand-in for crypto.getRandomValues: `fill` decides what each call writes. */
function stubRandom(fill: (bytes: Uint8Array, call: number) => void) {
  const calls: number[] = [];
  const buffers: Uint8Array[] = [];
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(
    <T extends ArrayBufferView>(array: T): T => {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      calls.push(bytes.length);
      buffers.push(bytes);
      fill(bytes, calls.length);
      return array;
    },
  );
  return { calls, buffers };
}

afterEach(() => vi.restoreAllMocks());

describe("default random source of the phrase generators", () => {
  it("an ordinary phrase takes exactly its entropy from Web Crypto", () => {
    const mathRandom = vi.spyOn(Math, "random");
    const { calls } = stubRandom((bytes) => bytes.fill(0));
    expect(generateMnemonic(12)).toBe(
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    );
    expect(calls).toEqual([16]);
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it("a chosen-word phrase draws batches from Web Crypto and wipes them", async () => {
    const mathRandom = vi.spyOn(Math, "random");
    let counter = 0;
    const { calls, buffers } = stubRandom((bytes) => {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = (counter += 7) & 255;
    });
    const phrase = await generateMnemonicWithChosenWords({
      wordCount: 12,
      chosen: [{ word: "zoo", position: 1 }],
      neverUse: [],
    });
    expect(phrase.split(" ")[0]).toBe("zoo");
    // One batch of 256 draws of 16 bytes, from the host source and no other.
    expect(calls).toEqual([16 * 256]);
    expect(mathRandom).not.toHaveBeenCalled();
    // The batch the search drew from is wiped when the search returns.
    expect(buffers[0]!.every((byte) => byte === 0)).toBe(true);
  });

  it("a source that leaves its buffer empty makes a constrained search fail, not fall back", async () => {
    const { calls } = stubRandom(() => undefined);
    await expect(
      generateMnemonicWithChosenWords({ wordCount: 12, chosen: [], neverUse: ["abandon"] }),
    ).rejects.toThrow(/No phrase met these wishes/u);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("the startup health check refuses such a source before any phrase is drawn", () => {
    stubRandom(() => undefined);
    expect(() => checkSecureRandom()).toThrow(/health check/u);
  });

  it("the page self-test never touches the host source", () => {
    const { calls } = stubRandom((bytes) => bytes.fill(0));
    runChosenWordsSelfTest();
    expect(calls).toEqual([]);
    expect(CHOSEN_WORDS_KNOWN_ANSWERS.length).toBeGreaterThan(0);
  });

  it("the MnemoCode share filler takes Web Crypto bytes and wipes its own copy", () => {
    const { calls, buffers } = stubRandom((bytes) => bytes.fill(0xa5));
    const target = new Uint8Array(32);
    fillSecureRandom(target);
    expect(calls).toEqual([32]);
    expect(target.every((byte) => byte === 0xa5)).toBe(true);
    expect(buffers[0]!.every((byte) => byte === 0)).toBe(true);
  });
});

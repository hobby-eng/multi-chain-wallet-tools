// The lifetime of ZIP-32 Sapling keys' secrets: every working copy the module builds through its
// helpers is wiped, a key's own parts are erased on wipe, and a fault of CRH^ivk is refused. The
// helpers are observed, not replaced: each mock passes its call through and keeps the arrays, so
// that what is left in them after the wipes can be read. Synthetic seeds only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EdwardsPoint } from "@noble/curves/abstract/edwards.js";
import { bytesToHex } from "@noble/hashes/utils.js";

interface Observations {
  /** Every array the module's helpers took or made. */
  arrays: Uint8Array[];
  /** Every array given to wipe(). */
  wiped: Uint8Array[];
  /** Fault: CRH^ivk's digest is all zero, which no known key gives. */
  zeroIvk: boolean;
}

const observed = vi.hoisted((): Observations => ({ arrays: [], wiped: [], zeroIvk: false }));
const IVK_PERSONALIZATION = "Zcashivk";

vi.mock("@ckd/core/crypto.js", async (original) => {
  const actual = await original<typeof import("@ckd/core/crypto.js")>();
  return {
    ...actual,
    concatBytes: (...parts: Uint8Array[]) => {
      const joined = actual.concatBytes(...parts);
      observed.arrays.push(...parts, joined);
      return joined;
    },
    wipe: (...arrays: Array<Uint8Array | null | undefined>) => {
      for (const array of arrays) if (array) observed.wiped.push(array);
      actual.wipe(...arrays);
    },
  };
});

vi.mock("@noble/hashes/blake2.js", async (original) => {
  const actual = await original<typeof import("@noble/hashes/blake2.js")>();
  type Options = { dkLen?: number; personalization?: Uint8Array };
  const observe = <Hash extends (message: Uint8Array, options?: Options) => Uint8Array>(
    hash: Hash,
  ): Hash =>
    Object.assign((message: Uint8Array, options?: Options) => {
      const digest = hash(message, options);
      const personalization = new TextDecoder().decode(options?.personalization);
      if (observed.zeroIvk && personalization === IVK_PERSONALIZATION) digest.fill(0);
      observed.arrays.push(message, digest);
      return digest;
    }, hash);
  return { ...actual, blake2b: observe(actual.blake2b), blake2s: observe(actual.blake2s) };
});

/** `point`, whose multiples keep each encoding they give: ak = [ask]G and nk = [nsk]H. */
function observedBase(point: EdwardsPoint): EdwardsPoint {
  const observedMultiple = (multiple: EdwardsPoint): EdwardsPoint =>
    new Proxy(multiple, {
      get: (target, property): unknown =>
        property === "toBytes"
          ? () => {
              const bytes = target.toBytes();
              observed.arrays.push(bytes);
              return bytes;
            }
          : Reflect.get(target, property),
    });
  return new Proxy(point, {
    get: (target, property): unknown =>
      property === "multiply"
        ? (scalar: bigint) => observedMultiple(target.multiply(scalar))
        : Reflect.get(target, property),
  });
}

vi.mock("@noble/curves/misc.js", async (original) => {
  const actual = await original<typeof import("@noble/curves/misc.js")>();
  return {
    ...actual,
    jubjub_findGroupHash: (...args: Parameters<typeof actual.jubjub_findGroupHash>) =>
      observedBase(actual.jubjub_findGroupHash(...args)),
  };
});

vi.mock("@noble/curves/utils.js", async (original) => {
  const actual = await original<typeof import("@noble/curves/utils.js")>();
  return {
    ...actual,
    numberToBytesLE: (value: number | bigint, length: number) => {
      const bytes = actual.numberToBytesLE(value, length);
      observed.arrays.push(bytes);
      return bytes;
    },
  };
});

const { SaplingExpandedSpendingKey, SaplingExtendedSpendingKey } =
  await import("../src/zip32-sapling.js");

/** A synthetic seed, never a wallet's. */
const seed = (): Uint8Array => new Uint8Array(64).fill(7);

/** The 32-byte parts of a ZIP-32 encoding after its 9-byte header, in hex. */
function partsOf(encoding: Uint8Array): string[] {
  const parts = [1, 2, 3, 4, 5].map((index) =>
    bytesToHex(encoding.subarray(9 + 32 * (index - 1), 9 + 32 * index)),
  );
  encoding.fill(0);
  return parts;
}

beforeEach(() => {
  observed.arrays.length = 0;
  observed.wiped.length = 0;
  observed.zeroIvk = false;
});
afterEach(() => vi.restoreAllMocks());

describe("the secrets of ZIP-32 Sapling keys", () => {
  it("leaves no copy of any key's secrets in the arrays it worked with once the keys are wiped", () => {
    const input = seed();
    const master = SaplingExtendedSpendingKey.fromSeed(input);
    const parent = master.deriveHardened([32, 133]);
    const account = parent.deriveHardened([0]);
    const secrets = new Set<string>();
    for (const key of [master, parent, account]) {
      // c, ask, nsk, ovk and dk; then ak and nk; then ivk.
      for (const part of partsOf(key.bytes())) secrets.add(part);
      for (const part of partsOf(key.extendedFullViewingKey()).slice(1, 3)) secrets.add(part);
      const ivk = key.incomingViewingKey();
      secrets.add(bytesToHex(ivk));
      ivk.fill(0);
    }
    expect(account.nextAddress(0n, 20)).not.toBeNull();
    account.fingerprint();
    account.fullViewingKeyEncoding().fill(0);
    account.incomingViewingKeyEncoding().fill(0);
    for (const key of [account, parent, master]) key.wipe();
    input.fill(0);
    const left = observed.arrays.filter((array) =>
      [...secrets].some((secret) => bytesToHex(array).includes(secret)),
    );
    expect(left.map((array) => array.length)).toEqual([]);
  });

  it("erases a key's own parts on wipe", () => {
    const key = SaplingExtendedSpendingKey.fromSeed(seed());
    observed.wiped.length = 0;
    key.wipe();
    // ask ‖ nsk ‖ ovk, ak ‖ nk ‖ ovk, ivk, dk and the chain code.
    expect(observed.wiped.map((array) => array.length).sort((a, b) => a - b)).toEqual([
      32, 32, 32, 96, 96,
    ]);
    expect(observed.wiped.every((array) => array.every((byte) => byte === 0))).toBe(true);
  });

  it("refuses a key whose ivk is zero, and wipes what it made", () => {
    // Fault: CRH^ivk gives zero, which ZIP-32 makes invalid and no known key causes.
    observed.zeroIvk = true;
    const bytes = new Uint8Array(96);
    bytes[0] = 1;
    bytes[32] = 1;
    expect(() => SaplingExpandedSpendingKey.fromBytes(bytes)).toThrow(
      expect.objectContaining({ code: "sapling.key.invalid" }),
    );
    expect(observed.wiped.some((array) => array.length === 96)).toBe(true);
    expect(observed.wiped.every((array) => array.every((byte) => byte === 0))).toBe(true);
  });
});

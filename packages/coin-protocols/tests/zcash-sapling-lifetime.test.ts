// The lifetime of the Sapling rows' working material (coins/zcash/sapling.ts): the ZIP-32 master and
// account keys, which hold the account's spending authority, are wiped once the rows are built,
// and so are the arrays that held each row's Sapling receiver (d ‖ pk_d) and transparent receiver
// hash. The helpers are observed, not replaced: each mock passes its call through and keeps the
// arrays, so that what is left in them can be read. Public test data only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { DerivationResult } from "@ckd/core/types.js";

const made = vi.hoisted((): Uint8Array[] => []);

vi.mock("@ckd/core/crypto.js", async (original) => {
  const actual = await original<typeof import("@ckd/core/crypto.js")>();
  return {
    ...actual,
    concatBytes: (...parts: Uint8Array[]) => {
      const joined = actual.concatBytes(...parts);
      made.push(joined);
      return joined;
    },
    hash160: (bytes: Uint8Array) => {
      const digest = actual.hash160(bytes);
      made.push(digest);
      return digest;
    },
  };
});

const { hexToBytes } = await import("@ckd/core/crypto.js");
const { clearDerivationResult } = await import("@ckd/core/secrets.js");
const { zcashDerivation } = await import("../src/coins/zcash/index.js");
const { decodeUnified } = await import("../src/coins/zcash/unified.js");
const { SaplingExtendedSpendingKey } = await import("../src/zip32-sapling.js");

/** The BIP39 seed of "abandon abandon … about" without a passphrase (BIP39's first vector). */
const ABANDON_ABOUT =
  "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1" +
  "9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4";

/** The Sapling rows j = 0 to 3 of account 0 (j = 2 has no address); the caller clears them. */
function rows(): DerivationResult {
  const derive = zcashDerivation("zcash-sapling");
  if (derive === undefined) throw new Error("Zcash's Sapling variant is not derived.");
  const seed = hexToBytes(ABANDON_ABOUT);
  return derive({ seed, network: "mainnet", account: 0, branch: 0, start: 0, count: 4 });
}

afterEach(() => {
  vi.restoreAllMocks();
  made.length = 0;
});

describe("the working material of the Sapling rows", () => {
  it("wipes the ZIP-32 master and account keys once the rows are built", () => {
    const fromSeed = vi.spyOn(SaplingExtendedSpendingKey, "fromSeed");
    const deriveHardened = vi.spyOn(SaplingExtendedSpendingKey.prototype, "deriveHardened");
    clearDerivationResult(rows());
    const keys = [...fromSeed.mock.results, ...deriveHardened.mock.results].map(
      ({ value }) => value as ReturnType<typeof SaplingExtendedSpendingKey.fromSeed>,
    );
    expect(keys).toHaveLength(2);
    for (const key of keys)
      expect(() => key.bytes()).toThrow(expect.objectContaining({ code: "sapling.key.wiped" }));
  });

  it("leaves no array holding a row's Sapling receiver or transparent receiver hash", () => {
    const receivers = new Set<string>();
    const result = rows();
    for (const row of result.rows) {
      const text = row.advanced.find(({ key }) => key === "unifiedTransparentAddress")?.value;
      if (text === undefined) continue;
      const decoded = decodeUnified("address", text);
      try {
        for (const item of [decoded.sapling, decoded.p2pkh])
          if (item !== undefined) receivers.add(bytesToHex(item));
      } finally {
        decoded.wipe();
      }
    }
    clearDerivationResult(result);
    // Three rows with an address, each with its two receivers.
    expect(receivers.size).toBe(6);
    made.length = 0;
    clearDerivationResult(rows());
    const left = made.filter((array) => receivers.has(bytesToHex(array)));
    expect(left.map(({ length }) => length)).toEqual([]);
    // The helpers did make them, one Sapling receiver (43 bytes) and one hash (20) per such row.
    const wiped = (length: number) =>
      made.filter((array) => array.length === length && array.every((byte) => byte === 0)).length;
    expect([wiped(43) >= 3, wiped(20) >= 3]).toEqual([true, true]);
  });
});

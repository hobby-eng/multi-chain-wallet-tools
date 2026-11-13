// The lifetime of the viewing keys that unified.ts writes and reads: once the caller wipes its items
// and the decoded ones, no array that the module took or made still holds a part of a viewing key,
// whether it wrote, read or refused the encoding. The helpers are observed, not replaced: each spy
// passes its call through and keeps the arrays. Published items and the oracle's fixtures only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bytesToHex } from "@noble/hashes/utils.js";
import { bytesOf, own, rows, textOf } from "./zcash-unified-fixtures.js";

const observed = vi.hoisted((): { arrays: Uint8Array[] } => ({ arrays: [] }));

vi.mock("@ckd/core/crypto.js", async (original) => {
  const actual = await original<typeof import("@ckd/core/crypto.js")>();
  return {
    ...actual,
    concatBytes: (...parts: Uint8Array[]) => {
      const joined = actual.concatBytes(...parts);
      observed.arrays.push(...parts, joined);
      return joined;
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
      observed.arrays.push(message, digest);
      return digest;
    }, hash);
  return { ...actual, blake2b: observe(actual.blake2b) };
});

const { decodeUnified, encodeUnified } = await import("../src/coins/zcash/unified.js");

/** The first published UFVK holding only a P2PKH and a Sapling item. */
const VIEWING_KEY = (() => {
  const row = rows("unified_full_viewing_keys").find(
    (candidate) =>
      candidate.t_key_bytes !== null &&
      candidate.sapling_fvk_bytes !== null &&
      candidate.orchard_fvk_bytes === null &&
      candidate.unknown_fvk_bytes === null,
  );
  if (row === undefined) throw new Error("No published UFVK of P2PKH and Sapling items.");
  return row;
})();

/** The hex of each 32-byte part of `bytes`, from `from` on. */
const partsOf = (bytes: Uint8Array, from = 0): string[] =>
  Array.from({ length: Math.floor((bytes.length - from) / 32) }, (_, at) =>
    bytesToHex(bytes.subarray(from + 32 * at, from + 32 * at + 32)),
  );

/** The lengths of the observed arrays that still hold one of `secrets`. */
const left = (secrets: readonly string[]): number[] =>
  observed.arrays
    .filter((array) => secrets.some((secret) => bytesToHex(array).includes(secret)))
    .map((array) => array.length);

beforeEach(() => {
  observed.arrays.length = 0;
  // The module's own copies of items and buffers are slices; each is kept as well. The copy is
  // made from a view, so that the spy needs no reference to the method it replaces.
  vi.spyOn(Uint8Array.prototype, "slice").mockImplementation(function (
    this: Uint8Array,
    ...args: Parameters<Uint8Array["slice"]>
  ) {
    const copy = new Uint8Array(this.subarray(...args));
    observed.arrays.push(copy);
    return copy;
  });
});
afterEach(() => vi.restoreAllMocks());

describe("the viewing keys of unified encodings", () => {
  it("leaves no part of a viewing key in the arrays it worked with", () => {
    const p2pkh = bytesOf(VIEWING_KEY, "t_key_bytes") ?? new Uint8Array(0);
    const sapling = bytesOf(VIEWING_KEY, "sapling_fvk_bytes") ?? new Uint8Array(0);
    const text = textOf(VIEWING_KEY, "unified_fvk");
    // ak, nk, ovk and dk of the Sapling item, and the P2PKH item's chain code.
    const secrets = [...partsOf(sapling), bytesToHex(p2pkh.subarray(0, 32))];
    expect(encodeUnified("full-viewing-key", { p2pkh, sapling })).toBe(text);
    const decoded = decodeUnified("full-viewing-key", text);
    expect(decoded.sapling).toEqual(sapling);
    p2pkh.fill(0);
    sapling.fill(0);
    decoded.wipe();
    expect(left(secrets)).toEqual([]);
  });

  it("wipes the item it refuses and the ones read before it", () => {
    // The oracle's "P2PKH key, then identity ak": a published P2PKH item, then a published Sapling
    // item whose ak is the identity, so that its nk, ovk and dk are real.
    const published = rows("unified_full_viewing_keys").find(
      (row) => row.sapling_fvk_bytes !== null && row.t_key_bytes !== null,
    );
    const p2pkh = published === undefined ? undefined : bytesOf(published, "t_key_bytes");
    const sapling = published === undefined ? undefined : bytesOf(published, "sapling_fvk_bytes");
    if (p2pkh === undefined || sapling === undefined) throw new Error("No published items.");
    expect(() => decodeUnified("full-viewing-key", own("P2PKH key, then identity ak"))).toThrow(
      expect.objectContaining({ code: "zcash.unified.item" }),
    );
    expect(left([bytesToHex(p2pkh.subarray(0, 32)), ...partsOf(sapling, 32)])).toEqual([]);
  });

  it("wipes the bytes of an encoding whose padding is wrong", () => {
    const address = rows("unified_address")[0];
    const receiver = address === undefined ? undefined : bytesOf(address, "sapling_raw_addr");
    if (receiver === undefined) throw new Error("No published receiver.");
    expect(() => decodeUnified("address", own("padding of uview"))).toThrow(
      expect.objectContaining({ code: "zcash.unified.padding" }),
    );
    expect(left(partsOf(receiver, 11))).toEqual([]);
  });
});

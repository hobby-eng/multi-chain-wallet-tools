// ZIP-316's unified encodings (Revision 0, mainnet) against the published vectors of
// zcash/zcash-test-vectors @78321beacb0e0477e33cd002b56585a107c2708c, which
// test/fixtures/zcash-test-vectors keeps byte for byte (its SHA256SUMS beside them): F4Jumble both
// ways, and every unified address, full viewing key and incoming viewing key, read and, where it
// holds only items this version writes, written. The own fixtures (zcash-unified-fixtures.ts) are
// built and checked by test/oracles/zcash_unified_oracle.py, which also reads each one as the test
// expects. Public test data only.
import { readFileSync } from "node:fs";
import { blake2b } from "@noble/hashes/blake2.js";
import { describe, expect, it } from "vitest";
import { bytesToHex, concatBytes, hexToBytes, sha256 } from "@ckd/core/crypto.js";
import {
  decodeUnified,
  encodeUnified,
  f4Jumble,
  f4JumbleInverse,
  type UnifiedItems,
} from "../src/coins/zcash/unified.js";
import { SaplingExtendedSpendingKey } from "../src/zip32-sapling.js";
import {
  bytesOf,
  type Cell,
  FIXTURES,
  own,
  OWN_FIXTURES,
  rows,
  textOf,
} from "./zcash-unified-fixtures.js";

/** ℓ^MAX_M, F4Jumble's longest message ("Jumbling"). */
const MAX_JUMBLE_BYTES = 4194368;

/** A vector file of unified encodings: its kind, its text column and its columns of items. */
const UNIFIED = [
  {
    file: "unified_address",
    kind: "address",
    text: "unified_addr",
    items: { p2pkh: "p2pkh_bytes", p2sh: "p2sh_bytes", sapling: "sapling_raw_addr" },
    orchard: "orchard_raw_addr",
    unknown: "unknown",
  },
  {
    file: "unified_full_viewing_keys",
    kind: "full-viewing-key",
    text: "unified_fvk",
    items: { p2pkh: "t_key_bytes", sapling: "sapling_fvk_bytes" },
    orchard: "orchard_fvk_bytes",
    unknown: "unknown_fvk",
  },
  {
    file: "unified_incoming_viewing_keys",
    kind: "incoming-viewing-key",
    text: "unified_ivk",
    items: { p2pkh: "t_key_bytes", sapling: "sapling_ivk_bytes" },
    orchard: "orchard_ivk_bytes",
    unknown: "unknown_ivk",
  },
] as const;

/** A row of a unified vector file: its text, the items this version reads, and the others. */
function unifiedRow(file: (typeof UNIFIED)[number], row: Record<string, Cell>) {
  const items: { -readonly [Name in keyof UnifiedItems]: Uint8Array } = {};
  for (const [name, column] of Object.entries(file.items) as [keyof UnifiedItems, string][]) {
    const bytes = bytesOf(row, column);
    if (bytes !== undefined) items[name] = bytes;
  }
  const others: { typecode: number; bytes: Uint8Array }[] = [];
  const orchard = bytesOf(row, file.orchard);
  if (orchard !== undefined) others.push({ typecode: 3, bytes: orchard });
  const unknown = bytesOf(row, `${file.unknown}_bytes`);
  const typecode = row[`${file.unknown}_typecode`];
  if (unknown !== undefined && typeof typecode === "number")
    others.push({ typecode, bytes: unknown });
  return { text: textOf(row, file.text), items, others };
}

/** Expects `run` to be refused with the code zcash.unified.`code`. */
function expectRefusal(run: () => unknown, code: string): void {
  expect(run).toThrow(expect.objectContaining({ code: `zcash.unified.${code}` }));
}

describe("the published vector files", () => {
  it("are kept byte for byte as SHA256SUMS lists them", () => {
    const sums = readFileSync(new URL("SHA256SUMS", FIXTURES), "utf8").trim().split("\n");
    expect(sums).toHaveLength(5);
    for (const line of sums) {
      const [sum, file] = line.split(/\s+/u);
      expect([file, bytesToHex(sha256(readFileSync(new URL(file ?? "", FIXTURES))))]).toEqual([
        file,
        sum,
      ]);
    }
  });
});

describe("F4Jumble", () => {
  it.each(rows("f4jumble"))("jumbles and unjumbles f4jumble.json's message $normal", (row) => {
    const normal = textOf(row, "normal");
    const jumbled = textOf(row, "jumbled");
    expect(bytesToHex(f4Jumble(hexToBytes(normal)))).toBe(jumbled);
    expect(bytesToHex(f4JumbleInverse(hexToBytes(jumbled)))).toBe(normal);
  });

  it.each(rows("f4jumble_long"))(
    "jumbles and unjumbles f4jumble_long.json's message of $length bytes",
    (row) => {
      const length = row.length;
      if (typeof length !== "number") throw new Error("A long vector has no length.");
      // f4jumble.py long_test_vectors(): M = bytes([i & 0xFF for i in range(l_M)]).
      const message = Uint8Array.from({ length }, (_, at) => at & 0xff);
      const jumbled = f4Jumble(message);
      expect(bytesToHex(blake2b(jumbled))).toBe(textOf(row, "jumbled_hash"));
      expect(f4JumbleInverse(jumbled)).toEqual(message);
    },
  );

  it("takes 38 to 4194368 bytes and refuses any other length", () => {
    for (const length of [0, 37, MAX_JUMBLE_BYTES + 1]) {
      expectRefusal(() => f4Jumble(new Uint8Array(length)), "length");
      expectRefusal(() => f4JumbleInverse(new Uint8Array(length)), "length");
    }
    const shortest = Uint8Array.from({ length: 38 }, (_, at) => at);
    expect(f4JumbleInverse(f4Jumble(shortest))).toEqual(shortest);
  });
});

describe.each(UNIFIED)("$file", (file) => {
  const table = rows(file.file);

  it.each(table.map((row, index) => ({ index, ...unifiedRow(file, row) })))(
    "reads row $index, and writes it again where it holds only items this version writes",
    ({ text, items, others }) => {
      const decoded = decodeUnified(file.kind, text);
      const { p2pkh, p2sh, sapling } = decoded;
      expect({ p2pkh, p2sh, sapling }).toEqual(items);
      expect(decoded.unrecognised).toEqual(others);
      // BIP-350 text may also be all upper case.
      expect(decodeUnified(file.kind, text.toUpperCase())).toEqual(decoded);
      if (others.length === 0) expect(encodeUnified(file.kind, items)).toBe(text);
    },
  );
});

describe("Sapling items of ZIP-32 account keys", () => {
  // The viewing key vectors' Sapling items are those of m_Sapling/32'/133'/account' of root_seed
  // (unified_full_viewing_keys.py, unified_incoming_viewing_keys.py); dk comes from the full
  // viewing key, never from the spending key's encoding.
  const sapling = UNIFIED.slice(1).flatMap((file) =>
    rows(file.file)
      .filter((row) => row[file.items.sapling] !== null)
      .map((row) => ({ file, row, account: Number(row.account) })),
  );

  it.each(sapling.map(({ file, row, account }) => ({ kind: file.kind, account, file, row })))(
    "gives the $kind of account $account, and its text with the published transparent item",
    ({ file, row, account }) => {
      const master = SaplingExtendedSpendingKey.fromSeed(hexToBytes(textOf(row, "root_seed")));
      const key = master.deriveHardened([32, 133, account]);
      master.wipe();
      try {
        const item =
          file.kind === "full-viewing-key"
            ? key.fullViewingKeyEncoding()
            : key.incomingViewingKeyEncoding();
        expect(bytesToHex(item)).toBe(textOf(row, file.items.sapling));
        const { text, items, others } = unifiedRow(file, row);
        if (others.length === 0)
          expect(encodeUnified(file.kind, { ...items, sapling: item })).toBe(text);
      } finally {
        key.wipe();
      }
    },
  );
});

describe("decoded items", () => {
  it("are erased by wipe and by dispose, read or not", () => {
    const row = rows("unified_full_viewing_keys").find(
      (candidate) => candidate.orchard_fvk_bytes !== null && candidate.sapling_fvk_bytes !== null,
    );
    if (row === undefined) throw new Error("No published UFVK with Sapling and Orchard items.");
    for (const end of ["wipe", "dispose"] as const) {
      const decoded = decodeUnified("full-viewing-key", textOf(row, "unified_fvk"));
      const arrays = [decoded.p2pkh, decoded.sapling, ...decoded.unrecognised.map((i) => i.bytes)];
      expect(arrays.some((bytes) => bytes?.some((byte) => byte !== 0))).toBe(true);
      if (end === "wipe") decoded.wipe();
      else decoded[Symbol.dispose]();
      for (const bytes of arrays) expect(bytes?.every((byte) => byte === 0) ?? true).toBe(true);
    }
  });
});

describe("own fixtures", () => {
  it.each(OWN_FIXTURES.filter(([, , code]) => code !== null))(
    "refuses %s (a %s) with zcash.unified.%s",
    (_, kind, code, text) => {
      expectRefusal(() => decodeUnified(kind, text), code ?? "");
    },
  );

  it("reads a birthday metadata item of a unified address as an item it does not read", () => {
    const address = rows("unified_address")[0];
    if (address === undefined) throw new Error("No published address.");
    expect(decodeUnified("address", own("birthday metadata"))).toEqual({
      sapling: bytesOf(address, "sapling_raw_addr"),
      unrecognised: [{ typecode: 0xc0, bytes: new Uint8Array(4) }],
    });
  });

  it("reads metadata typecodes on either side of the MUST-understand range as items it does not read", () => {
    const decoded = decodeUnified("address", own("typecodes 0xDF and 0xFD"));
    expect(decoded.unrecognised).toEqual([
      { typecode: 0xdf, bytes: new Uint8Array(0) },
      { typecode: 0xfd, bytes: new Uint8Array(0) },
    ]);
  });

  it("reads an item of typecode 0x2000000, the largest ZIP-316 admits, as one it does not read", () => {
    const decoded = decodeUnified("address", own("typecode 0x2000000"));
    expect(decoded.unrecognised).toEqual([{ typecode: 0x200_0000, bytes: new Uint8Array(0) }]);
  });

  it("reads typecode 1 of a viewing key as an item it does not read, as Revision 0 asks", () => {
    const key = rows("unified_full_viewing_keys").find(
      (row) => row.sapling_fvk_bytes !== null && row.t_key_bytes !== null,
    );
    const address = rows("unified_address")[0];
    if (key === undefined || address === undefined) throw new Error("No published items.");
    expect(decodeUnified("full-viewing-key", own("P2SH in a viewing key"))).toEqual({
      p2pkh: bytesOf(key, "t_key_bytes"),
      sapling: bytesOf(key, "sapling_fvk_bytes"),
      unrecognised: [{ typecode: 1, bytes: bytesOf(address, "p2pkh_bytes") }],
    });
  });
});

describe("refusals of text", () => {
  const address = textOf(rows("unified_address")[0] ?? {}, "unified_addr");
  const viewing = textOf(rows("unified_full_viewing_keys")[0] ?? {}, "unified_fvk");

  it("refuses a changed character, mixed case and white space as not Bech32m", () => {
    const last = address.at(-1) === "q" ? "p" : "q";
    for (const text of [
      `${address.slice(0, -1)}${last}`,
      `${address.slice(0, 5)}${address.slice(5).toUpperCase()}`,
      ` ${address}`,
      `${address}\n`,
    ])
      expectRefusal(() => decodeUnified("address", text), "bech32m");
  });

  it("refuses another kind's encoding by its prefix", () => {
    expectRefusal(() => decodeUnified("address", viewing), "prefix");
    expectRefusal(() => decodeUnified("full-viewing-key", address), "prefix");
    expectRefusal(() => decodeUnified("incoming-viewing-key", viewing), "prefix");
  });

  it("refuses text longer than 4194368 bytes can be before reading it", () => {
    // u, the separator, 6710989 characters of data and 6 of checksum are the longest.
    const text = `u1${"q".repeat(6710989 + 6 + 1)}`;
    expectRefusal(() => decodeUnified("address", text), "length");
  });

  it("does not quote the text in its refusal, nor keep @scure/base's error that does", () => {
    const text = `${address.slice(0, -1)}${address.at(-1) === "q" ? "p" : "q"}`;
    let refused: unknown;
    try {
      decodeUnified("address", text);
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(Error);
    expect(refused instanceof Error ? refused.cause : "no error").toBeUndefined();
    expect(String(refused)).not.toContain(text.slice(3, 20));
  });
});

describe("refusals of items to write", () => {
  const address = rows("unified_address")[0] ?? {};
  const sapling = bytesOf(address, "sapling_raw_addr") ?? new Uint8Array(0);
  const p2pkh = bytesOf(address, "p2pkh_bytes") ?? new Uint8Array(0);
  const key = rows("unified_full_viewing_keys").find((row) => row.sapling_fvk_bytes !== null) ?? {};
  const fvk = bytesOf(key, "sapling_fvk_bytes") ?? new Uint8Array(0);

  it("writes no encoding without a Sapling item, the one shielded item it writes", () => {
    expectRefusal(() => encodeUnified("address", { p2pkh }), "shielded");
    expectRefusal(() => encodeUnified("full-viewing-key", {}), "shielded");
  });

  it("writes no address with both transparent receivers, and no viewing key with P2SH", () => {
    expectRefusal(() => encodeUnified("address", { p2pkh, p2sh: p2pkh, sapling }), "transparent");
    expectRefusal(() => encodeUnified("full-viewing-key", { p2sh: p2pkh, sapling: fvk }), "p2sh");
  });

  it("writes no item that is not valid for its kind", () => {
    const pkD = sapling.slice();
    pkD.fill(0xff, 11);
    for (const [kind, items] of [
      ["address", { sapling: pkD }],
      ["address", { p2pkh: p2pkh.subarray(1), sapling }],
      ["address", { p2pkh: concatBytes(p2pkh, Uint8Array.of(0)), sapling }],
      ["address", { sapling: fvk }],
      ["full-viewing-key", { sapling }],
      ["full-viewing-key", { p2pkh, sapling: fvk }],
      ["incoming-viewing-key", { sapling: fvk }],
    ] as const)
      expectRefusal(() => encodeUnified(kind, items), "item");
  });
});

import { describe, expect, it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { getCoinAdapter } from "@ckd/coins/registry.js";
import { zcashDerivation } from "@ckd/coins/zcash/index.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { field } from "@ckd/core/types.js";
import {
  displayedFields,
  formatSelectedRows,
  inspectSelectedRows,
  iterateSelectedRows,
} from "../src/formatter.js";

const result: DerivationResult = {
  id: "bitcoin-taproot",
  title: "Export fixture",
  networkLabel: "Bitcoin mainnet",
  pathTemplate: "m/86'/0'/0'/0/*",
  basicSummary: [],
  summary: [],
  notices: [],
  rows: [0, 1].map((index) => ({
    index,
    path: `m/86'/0'/0'/0/${index}`,
    title: `Address ${index}`,
    basic: [
      field("address", "Address", `bc1p-address-${index}`),
      field("privateKey", "BIP32 child WIF", `secret-wif-${index}`, true),
    ],
    advanced: [
      field("tapTweak", "TapTweak", `tweak-${index}`),
      field("taprootOutputPrivateKey", "Tweaked output key", `secret-tweaked-${index}`, true),
    ],
  })),
};
const adapter = getCoinAdapter("bitcoin-taproot");

describe("generic export formatter", () => {
  it("limits basic mode to basic fields and reports secret presence", () => {
    const output = formatSelectedRows(
      adapter,
      result,
      new Set([0]),
      "basic",
      "allDisplayed",
      "structured",
    );
    expect(output.valueCount).toBe(2);
    expect(output.containsSecret).toBe(true);
    expect(output.text).toContain("bc1p-address-0");
    expect(output.text).not.toContain("tweak-0");
  });

  it("exports only selected address values in plain mode", () => {
    const output = formatSelectedRows(
      adapter,
      result,
      new Set([1]),
      "advanced",
      "addresses",
      "plain",
    );
    expect(output).toEqual({ text: "bc1p-address-1", containsSecret: false, valueCount: 1 });
  });

  it("exports only role-classified private fields and flags them as secret", () => {
    const output = formatSelectedRows(
      adapter,
      result,
      new Set([0, 1]),
      "advanced",
      "privateKeys",
      "plain",
    );
    expect(output.valueCount).toBe(4);
    expect(output.containsSecret).toBe(true);
    expect(output.text).toBe(
      ["secret-wif-0", "secret-tweaked-0", "secret-wif-1", "secret-tweaked-1"].join("\n"),
    );
  });

  it("creates a rectangular TSV for multi-row exports", () => {
    const output = formatSelectedRows(
      adapter,
      result,
      new Set([0, 1]),
      "advanced",
      "selected",
      "tsv",
    );
    const lines = output.text.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Index\tPath\tAddress\tBIP32 child WIF\tTapTweak\tTweaked output key");
    expect(lines[1]?.split("\t")).toHaveLength(6);
    expect(lines[2]?.split("\t")).toHaveLength(6);
  });

  it("neutralises spreadsheet formulas in TSV headers and cells", () => {
    const injected: DerivationResult = {
      ...result,
      rows: [
        {
          index: 0,
          path: "m/86'/0'/0'/0/0",
          title: "Address 0",
          basic: [field("address", "=Address", "=cmd|calc")],
          advanced: [],
        },
      ],
    };
    const tsv = formatSelectedRows(adapter, injected, new Set([0]), "basic", "selected", "tsv");
    const lines = tsv.text.split("\n");
    expect(lines[0]).toBe("Index\tPath\t'=Address");
    expect(lines[1]).toContain("'=cmd|calc");
    // Plain text is not opened by a spreadsheet, so values stay verbatim there.
    const plain = formatSelectedRows(
      adapter,
      injected,
      new Set([0]),
      "basic",
      "addresses",
      "plain",
    );
    expect(plain.text).toBe("=cmd|calc");
  });

  it("keeps field visibility protocol-neutral", () => {
    expect(displayedFields(result.rows[0]!, "basic")).toHaveLength(2);
    expect(displayedFields(result.rows[0]!, "advanced")).toHaveLength(4);
  });
});

describe("generic export formatter of grouped fields and chunks", () => {
  it("flattens grouped key fields while retaining their group labels in structured exports", () => {
    const grouped: DerivationResult = {
      id: "dash-identity",
      title: "Identity fixture",
      networkLabel: "Dash mainnet Platform",
      pathTemplate: "m/9'/5'/5'/0'/0'/identity_index'/key_id'",
      basicSummary: [],
      summary: [],
      notices: [],
      rows: [
        {
          index: 0,
          path: "m/9'/5'/5'/0'/0'/0'",
          title: "Identity candidate #0",
          basic: [],
          advanced: [field("identityId", "Identity ID", "Not available until registration")],
          groups: [
            {
              key: "key0",
              title: "Key 0 · MASTER AUTHENTICATION",
              basic: [
                field("key0PublicKey", "Compressed public key", "master-public"),
                field("key0PrivateKeyWif", "Private key (Dash WIF)", "master-private", true),
              ],
              advanced: [field("key0Path", "DIP13 derivation path", "m/9'/5'/5'/0'/0'/0'/0'")],
            },
            {
              key: "key1",
              title: "Key 1 · CRITICAL AUTHENTICATION",
              basic: [
                field("key1PublicKey", "Compressed public key", "critical-public"),
                field("key1PrivateKeyWif", "Private key (Dash WIF)", "critical-private", true),
              ],
              advanced: [field("key1Path", "DIP13 derivation path", "m/9'/5'/5'/0'/0'/0'/1'")],
            },
          ],
        },
      ],
    };
    const identityAdapter = getCoinAdapter("dash-identity");

    expect(displayedFields(grouped.rows[0]!, "basic")).toHaveLength(4);
    const publicKeys = formatSelectedRows(
      identityAdapter,
      grouped,
      new Set([0]),
      "basic",
      "publicKeys",
      "plain",
    );
    expect(publicKeys.text).toBe("master-public\ncritical-public");

    const structured = formatSelectedRows(
      identityAdapter,
      grouped,
      new Set([0]),
      "advanced",
      "allDisplayed",
      "structured",
    );
    expect(structured.text).toContain(
      "Key 0 · MASTER AUTHENTICATION · Compressed public key: master-public",
    );
    expect(structured.text).toContain(
      "Key 1 · CRITICAL AUTHENTICATION · DIP13 derivation path: m/9'/5'/5'/0'/0'/0'/1'",
    );
    expect(structured.containsSecret).toBe(true);
  });

  it("streams the exact same bytes in bounded row-sized chunks", () => {
    const selected = new Set([0, 1]);
    const expected = formatSelectedRows(
      adapter,
      result,
      selected,
      "advanced",
      "selected",
      "structured",
    );
    const chunks = [
      ...iterateSelectedRows(adapter, result, selected, "advanced", "selected", "structured"),
    ];
    expect(chunks.join("")).toBe(expected.text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThan(expected.text.length);
    expect(inspectSelectedRows(adapter, result, selected, "advanced", "selected")).toEqual({
      containsSecret: true,
      valueCount: 8,
      rowCount: 2,
    });
  });
});

describe("the TSV export of Zcash Sapling rows, some without an address", () => {
  const saplingAdapter = getCoinAdapter("zcash-sapling");
  // "abandon … about", account 0: index 2 has no Sapling address (zcash-sapling.test.ts).
  const seed = mnemonicToSeed(
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    "",
  );
  const derive = zcashDerivation("zcash-sapling");

  /** The TSV lines of every row from `start`, in `mode`. */
  function tsv(start: number, mode: "basic" | "advanced", action: "allDisplayed" | "addresses") {
    if (derive === undefined) throw new Error("Zcash's Sapling variant is not derived.");
    const rows = derive({
      seed: seed.slice(),
      network: "mainnet",
      account: 0,
      branch: 0,
      start,
      count: 2,
    });
    const all = new Set(rows.rows.map(({ index }) => index));
    return formatSelectedRows(saplingAdapter, rows, all, mode, action, "tsv").text.split("\n");
  }

  it.each(["basic", "advanced"] as const)(
    "has the same header in %s mode when the first row has no address, each column once",
    (mode) => {
      const [fromTwo, fromZero] = [
        tsv(2, mode, "allDisplayed")[0],
        tsv(0, mode, "allDisplayed")[0],
      ];
      expect(fromTwo).toBe(fromZero);
      const labels = fromTwo?.split("\t") ?? [];
      expect(new Set(labels).size).toBe(labels.length);
    },
  );

  it("writes the address of the row after one without an address under the address columns", () => {
    const lines = tsv(2, "basic", "allDisplayed");
    expect(lines[0]).toBe("Index\tPath\tSapling address\tUnified address (Sapling only)");
    // A row without an address has no value in Basic mode, so it is not exported.
    expect(lines).toHaveLength(2);
    expect(lines[1]?.split("\t").slice(0, 3)).toEqual([
      "3",
      "m/32'/133'/0' · diversifier index 3",
      "zs1c2wlrsejawrdxcmz4sn84ms5myyhs59ez9dpjfjh5rf674hkpwfqgj8qy95q6euj6p82w33psvr",
    ]);
  });

  it("keeps each Advanced column on its own field, with an empty address cell for an index without one", () => {
    const [header, none, first] = tsv(2, "advanced", "allDisplayed");
    expect(header?.split("\t")).toEqual([
      "Index",
      "Path",
      "Sapling address",
      "Unified address (Sapling only)",
      "Derivation path",
      "Unified address (Sapling and transparent)",
      "Its transparent receiver (t1, m/44'/133'/0'/0/j)",
      "Diversifier index j",
      "Diversifier d (hex)",
    ]);
    expect(none?.split("\t")).toEqual([
      "2",
      "m/32'/133'/0' · diversifier index 2",
      "",
      "",
      "m/32'/133'/0' · diversifier index 2",
      "",
      "",
      "2",
      "",
    ]);
    expect(first?.split("\t")[6]).toBe("t1M4FWL2VYmWy5qEuPUHrhEEcxsdkZ79xYn");
  });

  it("exports one address kind per column in the addresses TSV", () => {
    const [header, ...rows] = tsv(2, "advanced", "addresses");
    expect(header?.split("\t")).toEqual([
      "Index",
      "Path",
      "Sapling address",
      "Unified address (Sapling only)",
      "Unified address (Sapling and transparent)",
      "Its transparent receiver (t1, m/44'/133'/0'/0/j)",
    ]);
    expect(rows.map((row) => row.split("\t")[0])).toEqual(["3"]);
  });
});

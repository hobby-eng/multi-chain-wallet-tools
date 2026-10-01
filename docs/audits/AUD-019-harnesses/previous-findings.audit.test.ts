// AUD-019 regression probes of findings that earlier reports left open (AUD-017-API001,
// AUD-017-API003 and AUD-017-API004), through the production entry points. Public data only: an all-zero 16-byte
// secret, which is the entropy of "abandon ... about".
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// The SSKR module imports its WebAssembly as bytes, which the build embeds; here the committed
// file is read, as packages/recovery-backup/tests/sskr.test.ts does.
vi.mock("@ckd/recovery-sskr-wasm/recovery_sskr_wasm_bg.wasm", async () => ({
  default: readFileSync(
    new URL(
      "../../../packages/recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm",
      import.meta.url,
    ),
  ),
}));
import {
  createSskrShares,
  recoverSskrShares,
  type SskrShareEncoding,
} from "../../../packages/recovery-backup/src/sskr.ts";
import { createSlip39Shares } from "../../../packages/recovery-backup/src/slip39.ts";
import { createRecoveryExport } from "../../../apps/discovery-scanner/src/export.ts";
import type { RecoveryWalletResult } from "../../../apps/discovery-scanner/src/types.ts";

const SECRET = new Uint8Array(16);
const ONE_OF_ONE = [{ threshold: 1, count: 1 }];

describe("AUD-017-API001: SSKR encoding discriminant", () => {
  // Names that a plain object lookup finds on Object.prototype, plus near misses of the real names.
  const INVALID = ["toString", "constructor", "__proto__", "hasOwnProperty", "BYTEWORDS", "ur", ""];

  for (const encoding of INVALID) {
    it(`refuses "${encoding}" when creating shares`, () => {
      expect(() =>
        createSskrShares(SECRET, 1, ONE_OF_ONE, encoding as unknown as SskrShareEncoding),
      ).toThrow(/Unsupported SSKR share encoding/u);
    });

    it(`refuses "${encoding}" when recovering shares`, () => {
      const shares = createSskrShares(SECRET, 1, ONE_OF_ONE, "compact-ur");
      expect(() => recoverSskrShares(shares, encoding as unknown as SskrShareEncoding)).toThrow(
        /Unsupported SSKR share encoding/u,
      );
    });
  }
});

describe("AUD-017-API004: SLIP-39 random source length", () => {
  it("refuses a source that returns fewer bytes than requested", () => {
    expect(() =>
      createSlip39Shares(SECRET, {
        groupThreshold: 1,
        groups: [{ memberThreshold: 1, memberCount: 1 }],
        randomBytes: () => new Uint8Array(0),
      }),
    ).toThrow(/Random-byte source returned/u);
  });
});

describe("AUD-017-API003: Discovery CSV row of a section without findings", () => {
  /** Splits one CSV line of quoted cells; the export quotes every cell. */
  function cells(line: string): string[] {
    return [...line.matchAll(/"((?:[^"]|"")*)"/gu)].map((match) => match[1]!.replaceAll('""', '"'));
  }

  it("leaves metadata empty and names the section warning once", () => {
    const WARNING = "Provider page limit reached";
    const result = {
      inputId: "public-vector",
      label: "public vector",
      coinId: "dash",
      coinLabel: "Dash",
      network: "testnet",
      startedAt: "2026-10-01T00:00:00.000Z",
      completedAt: "2026-10-01T00:01:00.000Z",
      warnings: [],
      overview: [],
      sections: [
        {
          id: "core",
          title: "Dash Core · L1",
          description: "scan",
          state: "partial",
          warning: WARNING,
          metrics: [],
          scanned: 0,
          source: "fixture",
          proof: "none",
          findings: [],
        },
      ],
    } as unknown as RecoveryWalletResult;
    const [header, row] = createRecoveryExport([result], "csv").text.trim().split("\n");
    const columns = cells(header!);
    const values = cells(row!);
    expect(values).toHaveLength(columns.length);
    expect(values[columns.indexOf("metadata")]).toBe("");
    expect(values[columns.indexOf("warnings")]).toBe(WARNING);
    expect(values.filter((value) => value.includes(WARNING))).toHaveLength(1);
  });
});

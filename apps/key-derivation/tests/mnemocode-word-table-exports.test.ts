// Public dictionaries and canonical offline guide; no private inputs, rendering or derivation.
import { unzipSync, strFromU8 } from "fflate";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { MnemoCodeWordTableExports } from "../../../packages/recovery-backup/src/mnemocode-word-table.js";
import { MnemoCodeWordTableTab } from "../src/ui/recovery-mnemocode-word-table.js";
import type { RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";
import { RecoveryTestPage } from "./fake-recovery-page.js";

const downloads = vi.hoisted(() => ({ blob: vi.fn<(blob: Blob, fileName: string) => void>() }));
vi.mock("@ckd/export/download.js", () => ({ downloadBlob: downloads.blob }));

beforeAll(async () => {
  await loadMnemoCode();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function tablePage() {
  const page = new RecoveryTestPage();
  // Public export tests do not mutate lookup attributes; only the native observation edge is passive.
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  for (const id of ["mnemocode-table-value", "mnemocode-table-export-format"])
    page.add(id, id.endsWith("format") ? "select" : "input");
  for (const id of ["mnemocode-table-result", "mnemocode-table-export-status"]) page.add(id);
  for (const id of [
    "mnemocode-table-look-up",
    "mnemocode-table-save",
    "mnemocode-table-guide",
    "mnemocode-table-full-set",
  ])
    page.add(id, "button");
  const downloadText = vi.fn();
  new MnemoCodeWordTableTab({ downloadText } as unknown as RecoveryFeatureContext);
  return { page, downloadText };
}

describe("MnemoCode public reference exports", () => {
  it("downloads a complete ZIP from the page with no lookup input", async () => {
    const { page } = tablePage();
    page.require("mnemocode-table-value").value = "synthetic unrelated lookup input";
    page.require("mnemocode-table-full-set").click();
    expect(downloads.blob).toHaveBeenCalledTimes(1);
    const [blob, fileName] = downloads.blob.mock.calls[0]!;
    expect(fileName).toBe("mnemocode-recovery-reference-set.zip");
    expect(blob.type).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files)).toHaveLength(5);
    expect(
      Object.values(files).every(
        (bytes) => !strFromU8(bytes).includes(page.require("mnemocode-table-value").value),
      ),
    ).toBe(true);
  });
  it("packs all four shared dictionaries and the exact canonical guide as one public set", () => {
    const bytes = MnemoCodeWordTableExports.fullSet();
    try {
      const files = unzipSync(bytes);
      expect(Object.keys(files).sort()).toEqual([
        "bip39-chinese.txt",
        "bip39-english.txt",
        "bip39-mapping.txt",
        "bip39-unicode.txt",
        "manual-recovery.md",
      ]);
      for (const format of ["english", "chinese", "unicode", "mapping"] as const)
        expect(strFromU8(files[`bip39-${format}.txt`]!)).toBe(
          MnemoCodeWordTableExports.table(format).text,
        );
      expect(strFromU8(files["manual-recovery.md"]!)).toBe(
        MnemoCodeWordTableExports.recoveryGuide().text,
      );
    } finally {
      bytes.fill(0);
    }
  });
  it("exports the original table tab-separated, with every numbered row", () => {
    const result = MnemoCodeWordTableExports.table("legacy");
    const lines = result.text.trimEnd().split("\n");
    expect(lines).toHaveLength(2049);
    expect(lines[0]).toBe("index\tenglish\tunicode_hex");
    expect(lines[1]).toBe("1\tabandon\t7684");
    expect(lines.at(-1)).toBe("2048\tzoo\t6B47");
    expect(result.fileName).toBe("mnemocode-word-table.tsv");
    expect(result.mimeType).toBe("text/tab-separated-values;charset=utf-8");
  });

  // The first and the last word of each dictionary in every column, whichever columns a format has.
  const FIRST = { index: "1", english: "abandon", chinese: "的", unicode_hex: "7684" };
  const LAST = { index: "2048", english: "zoo", chinese: "歇", unicode_hex: "6B47" };
  it.each(["english", "chinese", "unicode", "mapping"] as const)(
    "exports %s as MnemoCode's lined-up text with its official endpoints and every row",
    (format) => {
      const result = MnemoCodeWordTableExports.table(format);
      const lines = result.text.trimEnd().split("\n");
      const cells = (line: string | undefined) => line?.trim().split(/\s+/u);
      const columns = (cells(lines[0]) ?? []) as (keyof typeof FIRST)[];
      expect(lines).toHaveLength(2049);
      expect(cells(lines[0])).toEqual(columns);
      expect(cells(lines[1])).toEqual(columns.map((column) => FIRST[column]));
      expect(cells(lines.at(-1))).toEqual(columns.map((column) => LAST[column]));
      expect(result.fileName).toBe(`mnemocode-word-table-${format}.txt`);
      expect(result.mimeType).toBe("text/plain;charset=utf-8");
    },
  );

  it("exports the exact embedded canonical guide independently of the lookup input", () => {
    const { page, downloadText } = tablePage();
    page.require("mnemocode-table-value").value = "synthetic unrelated lookup input";
    page.require("mnemocode-table-guide").click();
    // MnemoCode's own guide, from its recovery set.
    const canonical = MnemoCodeWordTableExports.recoveryGuide().text;
    expect(canonical).toMatch(/^# MnemoCode: recovery without MnemoCode/u);
    expect(downloadText).toHaveBeenCalledExactlyOnceWith(
      canonical,
      "mnemocode-manual-recovery.md",
      "text/markdown;charset=utf-8",
    );
    expect(canonical).not.toContain(page.require("mnemocode-table-value").value);
  });

  it("keeps the original TSV default and exports the chosen shared-library format", () => {
    const { page, downloadText } = tablePage();
    expect(page.require("mnemocode-table-export-format").value).toBe("legacy");
    page.require("mnemocode-table-save").click();
    expect(downloadText.mock.calls[0]?.[1]).toBe("mnemocode-word-table.tsv");
    page.require("mnemocode-table-export-format").value = "mapping";
    page.require("mnemocode-table-save").click();
    expect(downloadText.mock.calls[1]?.[0]).toBe(MnemoCodeWordTableExports.table("mapping").text);
    expect(downloadText.mock.calls[1]?.[1]).toBe("mnemocode-word-table-mapping.txt");
  });

  it("refuses an unknown selector without echoing it or creating a download", () => {
    const { page, downloadText } = tablePage();
    page.require("mnemocode-table-export-format").value = "synthetic invalid selector";
    page.require("mnemocode-table-save").click();
    expect(downloadText).not.toHaveBeenCalled();
    expect(page.require("mnemocode-table-export-status").textContent).toBe(
      "Select a word-table export format.",
    );
  });
});

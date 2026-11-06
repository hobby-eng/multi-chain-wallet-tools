import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecoveryExport } from "../apps/discovery-scanner/src/export.ts";
import { createViewerExport } from "../apps/activity-viewer/src/export-text.ts";
import { createPublicActivityExport } from "../apps/activity-viewer/src/export-public.ts";
import { queryCoreAddress } from "../packages/dash-network/src/public-address.ts";
import { DashScanCoreFixture } from "../test/support/dashscan-core-fixture.ts";

const GENERATED_AT = "2026-09-01T00:00:00.000Z";
afterEach(() => vi.restoreAllMocks());

async function subjects() {
  const fixture = new DashScanCoreFixture();
  const snapshot = await queryCoreAddress(
    DashScanCoreFixture.address,
    "mainnet",
    1,
    undefined,
    fixture.fetch,
  );
  const recovery = [
    {
      inputId: "public-1",
      label: "Synthetic public report",
      coinId: "dash",
      coinLabel: "Dash",
      network: "mainnet",
      startedAt: GENERATED_AT,
      completedAt: GENERATED_AT,
      overview: [],
      warnings: [],
      sections: [],
    },
  ];
  const viewer = { mode: "core", network: "mainnet", snapshot };
  const activity = {
    coin: "synthetic",
    asset: "UNIT",
    decimals: 8,
    network: "mainnet",
    mode: "single",
    results: [],
  };
  return [
    { name: "Discovery", fn: createRecoveryExport, value: recovery, formats: ["csv", "json"] },
    { name: "Viewer text", fn: createViewerExport, value: viewer, formats: ["csv", "json"] },
    {
      name: "Public activity",
      fn: createPublicActivityExport,
      value: activity,
      formats: ["csv", "json", "xlsx"],
    },
  ];
}

describe("Public report format admission", () => {
  it("refuses an empty Discovery report with a stable code after format admission", () => {
    expect(() => createRecoveryExport([], "csv", new Date(GENERATED_AT))).toThrow(
      expect.objectContaining({ code: "recovery.export.empty" }),
    );
  });

  it("refuses a bad choice before reading any report fields", async () => {
    for (const subject of await subjects()) {
      const read = vi.fn(() => {
        throw new Error("Synthetic report field read.");
      });
      const poisoned = new Proxy({}, { get: read });
      await expect(
        Promise.resolve().then(() =>
          Reflect.apply(subject.fn, undefined, [poisoned, "yaml", new Date(GENERATED_AT)]),
        ),
      ).rejects.toMatchObject({ code: "export.report.format" });
      expect(read).not.toHaveBeenCalled();
    }
  });

  for (const name of ["Discovery", "Viewer text", "Public activity"]) {
    it.each(["yaml", "", null, undefined, 42])(
      `${name} refuses unknown format %s before formatting the export timestamp`,
      async (format) => {
        const subject = (await subjects()).find((value) => value.name === name);
        expect(subject).toBeDefined();
        const date = new Date(GENERATED_AT);
        const clock = vi.spyOn(date, "toISOString");
        await expect(
          Promise.resolve().then(() =>
            Reflect.apply(subject.fn, undefined, [subject.value, format, date]),
          ),
        ).rejects.toMatchObject({ code: "export.report.format" });
        expect(clock).not.toHaveBeenCalled();
      },
    );
  }

  it("keeps the supported formats and their MIME types and suffixes in agreement", async () => {
    const mime = {
      csv: "text/csv",
      json: "application/json",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    for (const subject of await subjects())
      for (const format of subject.formats) {
        const result = await Reflect.apply(subject.fn, undefined, [
          subject.value,
          format,
          new Date(GENERATED_AT),
        ]);
        expect(result.filename.endsWith(`.${format}`)).toBe(true);
        expect((result.blob?.type ?? result.mimeType).split(";")[0]).toBe(mime[format]);
      }
  });
});

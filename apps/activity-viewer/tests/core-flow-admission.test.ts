import { describe, expect, it, vi } from "vitest";
import { queryCoreAddress } from "@ckd/dash-network/public-address.js";
import { assertPublicLookupInput } from "@ckd/secret-boundary/public-input-guard.js";
import { ActivityViewerFixture } from "../../../test/support/activity-viewer-fixture.js";
import { DashScanCoreFixture } from "../../../test/support/dashscan-core-fixture.js";
import { runDashCoreActivity } from "../src/dash-core-activity.js";
import {
  createViewerExport,
  createViewerWorkbookExport,
  type ViewerSingleExportState,
} from "../src/export.js";
import { createViewerExportController } from "../src/export-controller.js";
import { csvRecords, workbookRecords } from "./export-test-support.js";

function setup(fixture: DashScanCoreFixture) {
  const { page, view } = new ActivityViewerFixture();
  return {
    page,
    view,
    run: () =>
      runDashCoreActivity(
        {
          view,
          assertPublicLookupInput,
          cancelled: () => false,
          queryCoreAddress: (address, network, limit, signal) =>
            queryCoreAddress(address, network, limit, signal, fixture.fetch),
        },
        "mainnet",
        DashScanCoreFixture.address,
        new AbortController().signal,
      ),
  };
}

const generatedAt = new Date("2026-09-01T21:30:00.000Z");

describe("Core flow through the real viewer and exports", () => {
  it.each([
    [1000, "1000", "800", "Received"],
    [0, "0", "-200", "Sent / spent"],
  ] as const)(
    "preserves an exact output %s through the screen, JSON, CSV and XLSX",
    async (value, received, net, direction) => {
      const fixture = new DashScanCoreFixture();
      fixture.outputs[0]!.value = value;
      const { page, run } = setup(fixture);
      const state = await run();
      expect(page.querySelector("#viewer-activity")!.text).toContain(direction);
      expect(JSON.parse(createViewerExport(state, "json", generatedAt).text)).toMatchObject({
        data: {
          transactions: [{ receivedDuffs: received, spentInputDuffs: "200", netDuffs: net }],
        },
      });
      const csv = csvRecords(createViewerExport(state, "csv", generatedAt).text);
      const workbook = await createViewerWorkbookExport(state, generatedAt);
      for (const rows of [csv, await workbookRecords(workbook.blob, 2)]) {
        const row = rows.find((item) => item.record_type === "transaction")!;
        expect(row.amount_atomic).toBe(net);
        expect(row.metadata).toContain(`received_duffs=${received}`);
        expect(row.metadata).toContain("spent_input_duffs=200");
      }
      expect(fixture.urls).toHaveLength(4);
      expect(fixture.urls.every((url) => !url.includes("Xother"))).toBe(true);
    },
  );

  it.each(["bad", undefined, null, "1.5"])(
    "refuses a malformed amount %s before rendering or enabling a single export",
    async (value) => {
      const fixture = new DashScanCoreFixture();
      fixture.outputs[0]!.value = value;
      const { page, view, run } = setup(fixture);
      let state: ViewerSingleExportState | null = null;
      const downloadText = vi.fn();
      const downloadBlob = vi.fn();
      createViewerExportController({
        view,
        state: () => state,
        createTextExport: createViewerExport,
        createWorkbookExport: createViewerWorkbookExport,
        downloadText,
        downloadBlob,
      }).install();
      await expect(
        run().then((result) => {
          state = result;
        }),
      ).rejects.toMatchObject({ code: "core.transaction.amount" });
      expect(page.querySelector("#viewer-activity")!.children).toHaveLength(0);
      for (const id of ["viewer-export-csv", "viewer-export-json", "viewer-export-xlsx"])
        page.querySelector(`#${id}`)!.click();
      await Promise.resolve();
      expect(downloadText).not.toHaveBeenCalled();
      expect(downloadBlob).not.toHaveBeenCalled();
      expect(page.querySelector("#viewer-error")!.text).toBe("Run a query before exporting data.");
    },
  );
});

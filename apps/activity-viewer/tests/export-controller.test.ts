import { describe, expect, it, vi } from "vitest";
import { createViewerExportController } from "../src/export-controller.js";

// A workbook export belongs to the results it was started for: when they are cleared or replaced
// while it is built, nothing is saved and nothing is said (AUD-024-API004). Synthetic results and
// a deferred workbook builder; no real export.

function setup() {
  let current: object | null = { synthetic: "first results" };
  let finish!: (file: { blob: Blob; filename: string }) => void;
  let fail!: (cause: Error) => void;
  const clicks = new Map<string, () => void>();
  const button = (name: string) => ({
    addEventListener: (_event: string, handler: () => void) => clicks.set(name, handler),
  });
  const view = {
    exportCsvButton: button("csv"),
    exportXlsxButton: button("xlsx"),
    exportJsonButton: button("json"),
    setStatus: vi.fn(),
    showError: vi.fn(),
    setExportBusy: vi.fn(),
    setExportAvailable: vi.fn(),
  };
  const downloadBlob = vi.fn();
  createViewerExportController({
    view: view as never,
    state: () => current as never,
    createTextExport: vi.fn() as never,
    createWorkbookExport: (() =>
      new Promise((resolve, reject) => {
        finish = resolve;
        fail = reject;
      })) as never,
    downloadBlob,
    downloadText: vi.fn(),
  }).install();
  const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 0));
  return {
    view,
    downloadBlob,
    settle,
    start: () => clicks.get("xlsx")!(),
    replace: (results: object | null) => {
      current = results;
    },
    finish: () => finish({ blob: new Blob(["synthetic"]), filename: "synthetic.xlsx" }),
    fail: () => fail(new Error("synthetic failure")),
  };
}

describe("the Activity Viewer's workbook export", () => {
  it("saves and reports the workbook of the results still shown", async () => {
    const page = setup();
    page.start();
    page.finish();
    await page.settle();
    expect(page.downloadBlob).toHaveBeenCalledOnce();
    expect(page.view.setStatus).toHaveBeenLastCalledWith(
      "Exported synthetic.xlsx. No private or viewing-key input is included.",
    );
  });

  for (const replacement of [null, { synthetic: "newer results" }])
    it(`saves nothing for results ${replacement === null ? "cleared" : "replaced"} meanwhile`, async () => {
      const page = setup();
      page.start();
      page.replace(replacement);
      page.finish();
      await page.settle();
      expect(page.downloadBlob).not.toHaveBeenCalled();
      expect(page.view.setStatus).not.toHaveBeenCalledWith(expect.stringMatching(/^Exported/u));
    });

  it("reports no failure of an export of results replaced meanwhile", async () => {
    const page = setup();
    page.start();
    page.replace({ synthetic: "newer results" });
    page.fail();
    await page.settle();
    expect(page.view.showError).not.toHaveBeenCalled();
  });
});

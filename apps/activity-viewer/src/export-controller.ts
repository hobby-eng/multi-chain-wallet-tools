import { describeUnknownError } from "@ckd/core/error-handling.js";
import { PublicExportSession } from "@ckd/export/public-export-session.js";
import type { ViewerExportFormat, ViewerExportState } from "./export.js";
import type { ActivityViewerView } from "./view.js";

interface ViewerExportDependencies {
  view: ActivityViewerView;
  state(): ViewerExportState | null;
  session?: PublicExportSession;
  createTextExport: typeof import("./export.js").createViewerExport;
  createWorkbookExport: typeof import("./export.js").createViewerWorkbookExport;
  downloadBlob: typeof import("@ckd/export/download.js").downloadBlob;
  downloadText: typeof import("@ckd/export/download.js").downloadText;
}

export function createViewerExportController(dependencies: ViewerExportDependencies) {
  const session = dependencies.session ?? new PublicExportSession();

  async function download(format: ViewerExportFormat): Promise<void> {
    const state = dependencies.state();
    if (state === null) {
      dependencies.view.showError("Run a query before exporting data.");
      return;
    }
    // Standalone callers supply the visible state directly; integrated owners share the session.
    if (dependencies.session === undefined && !session.contains(state)) session.replace(state);
    const ticket = session.begin(state);
    if (ticket === null) return;
    try {
      if (format === "xlsx") {
        dependencies.view.setExportBusy(true);
        dependencies.view.setStatus("Building XLSX workbook locally…");
        const file = await dependencies.createWorkbookExport(state);
        // A workbook of results that were cleared or replaced meanwhile is neither saved nor
        // reported (AUD-024-API004).
        if (dependencies.state() !== state || !session.owns(ticket, state)) return;
        dependencies.downloadBlob(file.blob, file.filename);
        dependencies.view.setStatus(
          `Exported ${file.filename}. No private or viewing-key input is included.`,
        );
        return;
      }
      const file = dependencies.createTextExport(state, format);
      dependencies.downloadText(file.text, file.filename, file.mimeType);
      dependencies.view.setStatus(
        `Exported ${file.filename}. No private or viewing-key input is included.`,
      );
    } catch (cause) {
      if (dependencies.state() !== state || !session.owns(ticket, state)) return;
      dependencies.view.showError(`Export failed: ${describeUnknownError(cause)}`);
    } finally {
      if (session.finish(ticket, state) && dependencies.state() === state && format === "xlsx") {
        dependencies.view.setExportBusy(false);
        dependencies.view.setExportAvailable(dependencies.state() !== null);
      }
    }
  }

  return {
    install(): void {
      dependencies.view.exportCsvButton.addEventListener("click", () => void download("csv"));
      dependencies.view.exportXlsxButton.addEventListener("click", () => void download("xlsx"));
      dependencies.view.exportJsonButton.addEventListener("click", () => void download("json"));
    },
  };
}

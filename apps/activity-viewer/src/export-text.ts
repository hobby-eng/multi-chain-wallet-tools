import type {
  ViewerExportFile,
  ViewerExportState,
  ViewerTextExportFormat,
} from "./export-model.js";
import {
  exactJson,
  exportError,
  fileStamp,
  isBatchExportState,
  VIEWER_EXPORT_SCHEMA_VERSION,
} from "./export-common.js";
import { createViewerCsvText } from "./export-csv.js";
import { viewerJsonData } from "./export-json.js";
import { PublicReportFormat } from "@ckd/export/public-report-format.js";

/** Serializes exact public activity values and explicit batch failures to CSV or JSON. */
export class ViewerTextExport {
  /** Refuses unknown formats before timestamp formatting, file naming or report serialization. */
  static create(
    state: ViewerExportState,
    format: ViewerTextExportFormat,
    generatedAt = new Date(),
  ): ViewerExportFile {
    PublicReportFormat.text(format);
    const generatedAtIso = generatedAt.toISOString();
    const batch = isBatchExportState(state);
    const filename = `wallet-activity-viewer-${state.mode}${batch ? "-batch" : ""}-${state.network}-${fileStamp(generatedAt)}.${format}`;
    if (format === "json") {
      const data = batch
        ? {
            batch: {
              requested: state.items.length + state.errors.length,
              succeeded: state.items.length,
              failed: state.errors.length,
            },
            results: state.items.map((item) => ({
              id: item.id,
              label: item.label,
              mode: item.state.mode,
              data: viewerJsonData(item.state),
            })),
            errors: state.errors.map((error) => exportError(error, state.mode)),
          }
        : viewerJsonData(state);
      return {
        filename,
        mimeType: "application/json",
        text: `${JSON.stringify(
          {
            schema: "wallet-activity-viewer-export",
            version: VIEWER_EXPORT_SCHEMA_VERSION,
            generatedAt: generatedAtIso,
            mode: state.mode,
            network: state.network,
            data,
          },
          exactJson,
          2,
        )}
`,
      };
    }
    return { filename, mimeType: "text/csv", text: createViewerCsvText(state, generatedAtIso) };
  }
}

/** Compatibility entry point for public Activity text reports. */
export function createViewerExport(
  state: ViewerExportState,
  format: ViewerTextExportFormat,
  generatedAt = new Date(),
): ViewerExportFile {
  return ViewerTextExport.create(state, format, generatedAt);
}

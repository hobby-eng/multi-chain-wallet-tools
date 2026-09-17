import type { ViewerExportFile, ViewerExportState, ViewerTextExportFormat } from './export-model.js';
import { exactJson, exportError, fileStamp, isBatchExportState } from './export-common.js';
import { createViewerCsvText } from './export-csv.js';
import { viewerJsonData } from './export-json.js';

export function createViewerExport(
  state: ViewerExportState,
  format: ViewerTextExportFormat,
  generatedAt = new Date(),
): ViewerExportFile {
  const generatedAtIso = generatedAt.toISOString();
  const batch = isBatchExportState(state);
  const filename = `wallet-activity-viewer-${state.mode}${batch ? '-batch' : ''}-${state.network}-${fileStamp(generatedAt)}.${format}`;
  if (format === 'json') {
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
      mimeType: 'application/json',
      text: `${JSON.stringify(
        {
          schema: 'wallet-activity-viewer-export',
          version: 2,
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
  return { filename, mimeType: 'text/csv', text: createViewerCsvText(state, generatedAtIso) };
}

import { describeUnknownError } from '@ckd/core/error-handling.js';
import type { ViewerExportFormat, ViewerExportState } from './export.js';
import type { ActivityViewerView } from './view.js';

interface ViewerExportDependencies {
  view: ActivityViewerView;
  state(): ViewerExportState | null;
  createTextExport: typeof import('./export.js').createViewerExport;
  createWorkbookExport: typeof import('./export.js').createViewerWorkbookExport;
  downloadBlob: typeof import('@ckd/export/download.js').downloadBlob;
  downloadText: typeof import('@ckd/export/download.js').downloadText;
}

export function createViewerExportController(dependencies: ViewerExportDependencies) {
  let exportingWorkbook = false;

  async function download(format: ViewerExportFormat): Promise<void> {
    const state = dependencies.state();
    if (state === null) {
      dependencies.view.showError('Run a query before exporting data.');
      return;
    }
    try {
      if (format === 'xlsx') {
        if (exportingWorkbook) return;
        exportingWorkbook = true;
        dependencies.view.setExportBusy(true);
        dependencies.view.setStatus('Building XLSX workbook locally…');
        const file = await dependencies.createWorkbookExport(state);
        dependencies.downloadBlob(file.blob, file.filename);
        dependencies.view.setStatus(`Exported ${file.filename}. No private or viewing-key input is included.`);
        return;
      }
      const file = dependencies.createTextExport(state, format);
      dependencies.downloadText(file.text, file.filename, file.mimeType);
      dependencies.view.setStatus(`Exported ${file.filename}. No private or viewing-key input is included.`);
    } catch (cause) {
      dependencies.view.showError(`Export failed: ${describeUnknownError(cause)}`);
    } finally {
      if (format === 'xlsx') {
        exportingWorkbook = false;
        dependencies.view.setExportBusy(false);
        dependencies.view.setExportAvailable(dependencies.state() !== null);
      }
    }
  }

  return {
    install(): void {
      dependencies.view.exportCsvButton.addEventListener('click', () => void download('csv'));
      dependencies.view.exportXlsxButton.addEventListener('click', () => void download('xlsx'));
      dependencies.view.exportJsonButton.addEventListener('click', () => void download('json'));
    },
  };
}

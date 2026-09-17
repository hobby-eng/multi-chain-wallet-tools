import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult, DisplayMode } from '@ckd/core/types.js';
import {
  formatSelectedRows,
  inspectSelectedRows,
  iterateSelectedRows,
  type ExportAction,
  type ExportFormat,
} from '@ckd/export/formatter.js';

const CLIPBOARD_VALUE_LIMIT = 200_000;

export interface ResultExportContext {
  adapter: CoinAdapter;
  result: DerivationResult;
  selected: ReadonlySet<number>;
  mode: DisplayMode;
  format: ExportFormat;
}

interface ResultExportDependencies {
  secretsRevealed(): boolean;
  writeClipboard(text: string): Promise<void>;
  downloadBlob(blob: Blob, filename: string): void;
  flashCopied(button: HTMLButtonElement): void;
  setDownloadPreparing(button: HTMLButtonElement, preparing: boolean): void;
  showError(message: string): void;
  showStatus(message: string): void;
}

export function createResultExportController(dependencies: ResultExportDependencies) {
  async function copyText(button: HTMLButtonElement, text: string, containsSecret: boolean): Promise<void> {
    if (containsSecret && !dependencies.secretsRevealed()) {
      dependencies.showError('Reveal private and privacy-sensitive values before copying them.');
      return;
    }
    let temporary = text;
    try {
      await dependencies.writeClipboard(temporary);
      dependencies.flashCopied(button);
      dependencies.showStatus(
        containsSecret ? 'Sensitive values copied. Clear your clipboard when finished.' : 'Copied to clipboard.',
      );
    } catch (cause) {
      dependencies.showError(cause instanceof Error ? cause.message : 'Clipboard access failed.');
    } finally {
      temporary = '';
    }
  }

  async function copyRows(
    button: HTMLButtonElement,
    action: ExportAction,
    context: ResultExportContext,
  ): Promise<void> {
    if (context.selected.size === 0) {
      dependencies.showError('Select at least one result first.');
      return;
    }
    const inspection = inspectSelectedRows(context.adapter, context.result, context.selected, context.mode, action);
    if (inspection.valueCount === 0) {
      dependencies.showError('That field type does not apply to the selected protocol and display mode.');
      return;
    }
    if (inspection.valueCount > CLIPBOARD_VALUE_LIMIT) {
      dependencies.showError(
        `That selection holds ${inspection.valueCount.toLocaleString()} values, more than the clipboard can assemble safely. ` +
          'Use Download selected instead: it streams the same rows to a file.',
      );
      return;
    }
    const output = formatSelectedRows(
      context.adapter,
      context.result,
      context.selected,
      context.mode,
      action,
      context.format,
    );
    await copyText(button, output.text, output.containsSecret);
  }

  async function downloadRows(
    button: HTMLButtonElement,
    action: ExportAction,
    context: ResultExportContext,
    onFinished: () => void,
  ): Promise<void> {
    if (context.selected.size === 0) {
      dependencies.showError('Select at least one result first.');
      return;
    }
    const inspection = inspectSelectedRows(context.adapter, context.result, context.selected, context.mode, action);
    if (inspection.valueCount === 0) {
      dependencies.showError('That field type does not apply to the selected protocol and display mode.');
      return;
    }
    if (inspection.containsSecret && !dependencies.secretsRevealed()) {
      dependencies.showError('Reveal private and privacy-sensitive values before exporting them.');
      return;
    }

    dependencies.setDownloadPreparing(button, true);
    try {
      const chunks = iterateSelectedRows(
        context.adapter,
        context.result,
        context.selected,
        context.mode,
        action,
        context.format,
      );
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          const next = chunks.next();
          if (next.done) controller.close();
          else controller.enqueue(encoder.encode(next.value));
        },
      });
      const mime = context.format === 'tsv' ? 'text/tab-separated-values' : 'text/plain';
      const blob = await new Response(stream, { headers: { 'Content-Type': `${mime};charset=utf-8` } }).blob();
      const extension = context.format === 'tsv' ? 'tsv' : 'txt';
      const fileName = `${context.result.id}-${context.mode}-${inspection.rowCount}-rows.${extension}`;
      dependencies.downloadBlob(blob, fileName);
      dependencies.showStatus(`Streamed ${inspection.rowCount.toLocaleString()} selected rows into ${fileName}.`);
    } catch (cause) {
      dependencies.showError(cause instanceof Error ? cause.message : 'Export download failed.');
    } finally {
      dependencies.setDownloadPreparing(button, false);
      onFinished();
    }
  }

  return { copyText, copyRows, downloadRows };
}

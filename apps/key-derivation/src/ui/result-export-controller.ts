import { ClipboardAction, type ClipboardActionDependencies } from "@ckd/ui/clipboard-action.js";
import type { CoinAdapter } from "@ckd/coins/registry.js";
import type { DerivationResult, DisplayMode } from "@ckd/core/types.js";
import { ClipboardSelection, ClipboardSelectionError } from "@ckd/export/clipboard-selection.js";
import {
  ExportChoice,
  ExportChoiceError,
  formatSelectedRows,
  inspectSelectedRows,
  iterateSelectedRows,
  type ExportAction,
  type ExportFormat,
} from "@ckd/export/formatter.js";

/** One admitted row selection shared by the main and child-wallet export controls. */
export interface ResultExportContext {
  adapter: CoinAdapter;
  result: DerivationResult;
  selected: ReadonlySet<number>;
  mode: DisplayMode;
  /** Untrusted native control value, admitted by ExportChoice before any row is read. */
  format: unknown;
}

interface ResultExportDependencies extends ClipboardActionDependencies {
  downloadBlob(blob: Blob, filename: string): void;
  setDownloadPreparing(button: HTMLButtonElement, preparing: boolean): void;
}

/** Owns transient encoded chunks until native Blob assembly completes or its result is revoked. */
class ExportDownload implements Disposable {
  readonly #chunks: Uint8Array[] = [];
  readonly #iterator: Generator<string>;
  readonly #encoder = new TextEncoder();
  #closed = false;

  constructor(iterator: Generator<string>) {
    this.#iterator = iterator;
  }

  next(): Uint8Array | null {
    if (this.#closed) return null;
    const next = this.#iterator.next();
    if (next.done) return null;
    const bytes = this.#encoder.encode(next.value);
    this.#chunks.push(bytes);
    return bytes;
  }

  wipe(): void {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#iterator.return(undefined);
    } finally {
      for (const bytes of this.#chunks) bytes.fill(0);
      this.#chunks.length = 0;
    }
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** Owns pending native writes and downloads; invalidation revokes later publication and diagnostics. */
export class ResultExportController {
  readonly #dependencies: ResultExportDependencies;
  readonly #clipboard: ClipboardAction;
  readonly copyText: ClipboardAction["copy"];
  readonly #downloads = new Set<ExportDownload>();
  readonly #buttons = new Map<HTMLButtonElement, ExportDownload>();
  #revision = 0;

  constructor(dependencies: ResultExportDependencies) {
    this.#dependencies = dependencies;
    this.#clipboard = new ClipboardAction(dependencies);
    this.copyText = this.#clipboard.copy;
  }

  /** Cannot recall text already handed to the operating-system clipboard or a completed download. */
  invalidate(): void {
    this.#revision += 1;
    this.#clipboard.invalidate();
    for (const download of this.#downloads) download.wipe();
    this.#downloads.clear();
    for (const button of this.#buttons.keys())
      this.#dependencies.setDownloadPreparing(button, false);
    this.#buttons.clear();
  }

  readonly copyRows = (
    button: HTMLButtonElement,
    action: unknown,
    context: ResultExportContext,
  ): Promise<void> => {
    try {
      const inspection = this.#inspect(action, context);
      if (inspection === undefined || !this.#clipboard.allows(inspection.containsSecret))
        return Promise.resolve();
      ClipboardSelection.admit(inspection.valueCount);
      const output = formatSelectedRows(
        context.adapter,
        context.result,
        context.selected,
        context.mode,
        inspection.action,
        inspection.format,
      );
      return this.copyText(button, output.text, output.containsSecret);
    } catch (cause) {
      this.#refusal(cause, "Unable to prepare the selected values.");
      return Promise.resolve();
    }
  };

  readonly downloadRows = async (
    button: HTMLButtonElement,
    action: unknown,
    context: ResultExportContext,
    onFinished: () => void,
  ): Promise<void> => {
    const revision = this.#revision;
    let download: ExportDownload | undefined;
    try {
      const inspection = this.#inspect(action, context);
      if (inspection === undefined || !this.#mayExport(inspection.containsSecret)) return;
      download = new ExportDownload(
        iterateSelectedRows(
          context.adapter,
          context.result,
          context.selected,
          context.mode,
          inspection.action,
          inspection.format,
        ),
      );
      const previous = this.#buttons.get(button);
      if (previous !== undefined) {
        previous.wipe();
        this.#downloads.delete(previous);
      }
      this.#downloads.add(download);
      this.#buttons.set(button, download);
      this.#dependencies.setDownloadPreparing(button, true);
      const owner = download;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          const bytes = owner.next();
          if (bytes === null) controller.close();
          else controller.enqueue(bytes);
        },
      });
      const mime = context.format === "tsv" ? "text/tab-separated-values" : "text/plain";
      const blob = await new Response(stream, {
        headers: { "Content-Type": `${mime};charset=utf-8` },
      }).blob();
      if (
        revision !== this.#revision ||
        this.#buttons.get(button) !== download ||
        !this.#disclosed(inspection.containsSecret)
      )
        return;
      const extension = inspection.format === "tsv" ? "tsv" : "txt";
      const fileName = `${context.result.id}-${context.mode}-${inspection.rowCount}-rows.${extension}`;
      this.#dependencies.downloadBlob(blob, fileName);
      this.#dependencies.showStatus(
        `Streamed ${inspection.rowCount.toLocaleString()} selected rows into ${fileName}.`,
      );
    } catch (cause) {
      if (
        revision === this.#revision &&
        (download === undefined || this.#buttons.get(button) === download)
      )
        this.#refusal(cause, "Export download failed.");
    } finally {
      if (download !== undefined) {
        download.wipe();
        this.#downloads.delete(download);
        if (this.#buttons.get(button) === download) {
          this.#buttons.delete(button);
          this.#dependencies.setDownloadPreparing(button, false);
          onFinished();
        }
      } else {
        onFinished();
      }
    }
  };

  #disclosed(containsSecret: boolean): boolean {
    return !containsSecret || this.#dependencies.secretsRevealed();
  }

  #mayExport(containsSecret: boolean): boolean {
    if (this.#disclosed(containsSecret)) return true;
    this.#dependencies.showError(
      "Show private and privacy-sensitive values before exporting them.",
    );
    return false;
  }

  #inspect(
    action: unknown,
    context: ResultExportContext,
  ):
    | (ReturnType<typeof inspectSelectedRows> & { format: ExportFormat; action: ExportAction })
    | undefined {
    const admitted = ExportChoice.action(action);
    const format = ExportChoice.format(context.format);
    ExportChoice.mode(context.mode);
    if (context.selected.size === 0) {
      this.#dependencies.showError("Select at least one result first.");
      return undefined;
    }
    const inspection = inspectSelectedRows(
      context.adapter,
      context.result,
      context.selected,
      context.mode,
      admitted,
    );
    if (inspection.valueCount > 0) return { ...inspection, format, action: admitted };
    this.#dependencies.showError(
      "That field type does not apply to the selected protocol and display mode.",
    );
    return undefined;
  }

  #refusal(cause: unknown, fallback: string): void {
    if (cause instanceof ClipboardSelectionError) {
      this.#dependencies.showError(
        cause.code === "export.clipboard.limit"
          ? `That selection holds ${cause.valueCount.toLocaleString()} values, more than the clipboard can assemble safely. Use Save selected instead: it streams the same rows to a file.`
          : "This clipboard selection has an invalid size.",
      );
      return;
    }
    this.#dependencies.showError(cause instanceof ExportChoiceError ? cause.message : fallback);
  }
}

/** Compatibility factory for the existing main and child-wallet composition. */
export function createResultExportController(
  dependencies: ResultExportDependencies,
): ResultExportController {
  return new ResultExportController(dependencies);
}

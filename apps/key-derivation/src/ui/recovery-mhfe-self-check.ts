// MHFE's own self-checks as the panel shows them, as the browser package asks (mhfe
// docs/BROWSER-PACKAGE.md, "Before first use"): the quick check of every class the panel uses before
// any of its fields opens, closed for good when a part fails; the full check of every class in the
// page's full self-test and in MHFE's Self-test tab. The quick checks run when the panel is first
// opened rather than at the page's start, because the package's WebAssembly is compiled only for
// MHFE: a page that never uses MHFE does no work for it.
import { MhfeError, type MhfeComponentResult } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import type { MhfeClassName, MhfeClassReport, MhfeEngine } from "./recovery-mhfe-engine.js";
import { describe, selfCheckFailure, selfCheckPart } from "./recovery-mhfe-status.js";

/** How a part that did not pass is named, by the package's outcomes. */
const OUTCOME_TEXTS: Readonly<Record<Exclude<MhfeComponentResult["outcome"], "passed">, string>> = {
  warning: "works, with a limit",
  notAvailable: "not available in a browser",
  notRun: "not run",
  failed: "FAILED",
};

/** The mark of a part's outcome in a result table: a pass, a limit, or nothing checked. */
const OUTCOME_MARKS: Readonly<Record<MhfeComponentResult["outcome"], string>> = {
  passed: "✓",
  warning: "!",
  notAvailable: "–",
  notRun: "–",
  failed: "✗",
};

/** One part of a class's report as a row: its class and label, and its outcome unless a pass. */
export function componentRow(
  className: string,
  part: MhfeComponentResult,
): { readonly name: string; readonly detail?: string; readonly mark: string } {
  const name = `MHFE ${className}: ${part.label}`;
  const mark = OUTCOME_MARKS[part.outcome];
  if (part.outcome === "passed") return { name, mark };
  const reason = part.detail === undefined ? "" : `: ${part.detail}`;
  return { name, mark, detail: `${OUTCOME_TEXTS[part.outcome]}${reason}` };
}

/** The parts that failed in `reports`, each as "class: label: detail". */
export function failedParts(reports: readonly MhfeClassReport[]): string[] {
  return reports.flatMap(({ name, report }) =>
    report.components
      .filter((part) => part.outcome === "failed")
      .map((part) => `${name}: ${selfCheckPart(part)}`),
  );
}

/**
 * The quick checks of a panel: run once, when the panel is first opened. The panel is inert
 * while they run and stays so when a part fails; a worker that did not start may be tried again
 * the next time the panel opens. The MHFE panel checks every class, the MHFE wallet check of
 * Generate & Derive the wallet module (`only`).
 */
export class MhfePanelCheck {
  readonly #engine: MhfeEngine;
  readonly #panel: HTMLElement;
  readonly #status: HTMLElement;
  readonly #only: readonly MhfeClassName[] | undefined;
  #result: Promise<boolean> | undefined;
  #failed = false;

  constructor(
    engine: MhfeEngine,
    panel: HTMLElement,
    status: HTMLElement,
    only?: readonly MhfeClassName[],
  ) {
    this.#engine = engine;
    this.#panel = panel;
    this.#status = status;
    this.#only = only;
  }

  /** Whether MHFE passed its quick checks; starts them on the first call. */
  ensure(): Promise<boolean> {
    this.#result ??= this.#run();
    return this.#result;
  }

  /** A wrong answer closes the feature; failure to start a worker permits a later retry. */
  get failed(): boolean {
    return this.#failed;
  }

  async #run(): Promise<boolean> {
    this.#panel.inert = true;
    this.#show("Checking MHFE before its fields open…", false);
    try {
      const failed = failedParts(await this.#engine.startupChecks(this.#only));
      if (failed.length > 0) {
        this.#failed = true;
        this.#show(selfCheckFailure(failed), true);
        return false;
      }
      this.#engine.passed();
      this.#status.hidden = true;
      this.#panel.inert = false;
      return true;
    } catch (cause) {
      this.#show(`MHFE could not check itself: ${describe(cause, "the check did not run.")}`, true);
      // A worker that did not start gave no wrong answer: the next opening tries again.
      if (cause instanceof MhfeError && cause.code === "WORKER_FAILED") this.#result = undefined;
      else this.#failed = true;
      return false;
    }
  }

  #show(text: string, warning: boolean): void {
    this.#status.textContent = text;
    this.#status.classList.toggle("warning", warning);
    this.#status.hidden = false;
  }
}

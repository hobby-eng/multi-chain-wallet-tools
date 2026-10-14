// The Self-test tab of the MHFE panel, as `mhfe self-test`: the full check of every class of the
// browser package (seconds, at most 256 MiB), and with "Also run the published vectors" the
// package's selfTest(), which encrypts the public suite 3 vector and recovers the public suite 4
// vector at full cost (minutes, 2 GiB) and compares them with the published results. It runs only
// when the user presses its button. The page's full self-test runs the same full checks.
import { factsList } from "./recovery-mhfe-cards.js";
import type { MhfeClassReport, MhfeEngine } from "./recovery-mhfe-engine.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { componentRow, failedParts } from "./recovery-mhfe-self-check.js";
import { SELF_TEST_STAGES, selfCheckFailure, type StageProgress } from "./recovery-mhfe-status.js";
import { MhfeTask } from "./recovery-mhfe-task.js";
import { paragraph, required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";
import { fullSelfTestParts, type SelfTestRow } from "./full-self-test.js";

/** Every part of `reports` as a row of a result table. */
function reportRows(reports: readonly MhfeClassReport[]): SelfTestRow[] {
  return reports.flatMap(({ name, report }) =>
    report.components.map((part) => componentRow(name, part)),
  );
}

export class MhfeSelfTestTab {
  readonly #engine: MhfeEngine;
  readonly #task: MhfeTask;
  readonly #status = required<HTMLElement>("#mhfe-selftest-status");
  readonly #result = required<HTMLElement>("#mhfe-selftest-result");
  readonly #vectors = required<HTMLInputElement>("#mhfe-selftest-vectors");

  constructor(context: RecoveryFeatureContext, engine: MhfeEngine) {
    this.#engine = engine;
    this.#task = new MhfeTask(context, engine, {
      status: this.#status,
      cancel: required<HTMLButtonElement>("#mhfe-selftest-stop"),
      name: "The MHFE self-test",
      failure: "The self-test failed to run.",
    });
    required<HTMLButtonElement>("#mhfe-selftest").addEventListener("click", () => this.#start());
    // The page's full self-test runs the full checks; a failed part fails it.
    fullSelfTestParts.add(async () => {
      const reports = await engine.fullChecks();
      const failed = failedParts(reports);
      if (failed.length > 0) throw new Error(selfCheckFailure(failed));
      return reportRows(reports);
    });
    // MHFE's published vectors take minutes and 2 GiB, so the page's full self-test only points here.
    fullSelfTestParts.note(
      "MHFE replays its published vectors at full cost in its own Self-test tab, with “Also run the published vectors”: it takes minutes and 2 GiB of memory, so it starts only there.",
    );
  }

  #start(): void {
    this.#result.replaceChildren();
    void this.#task.run((run) => this.#run(run));
  }

  async #run(run: MhfeRun): Promise<void> {
    const progress = await run.step(() => this.#engine.progress(SELF_TEST_STAGES));
    const reports = await run.step(() =>
      this.#engine.fullChecks((name, progress) => {
        this.#status.textContent = progress.running
          ? `Checking MHFE ${name}: ${progress.label}…`
          : `MHFE ${name}: ${progress.label} done.`;
      }),
    );
    this.#result.append(this.#table(reportRows(reports)));
    const failed = failedParts(reports);
    if (failed.length > 0) {
      this.#status.classList.add("warning");
      this.#status.textContent = selfCheckFailure(failed);
      return;
    }
    if (!this.#vectors.checked) {
      this.#status.textContent = `Every part passed in ${progress.elapsed()}.`;
      return;
    }
    await this.#publishedVectors(run, progress);
  }

  /** The published vectors at full cost, as `mhfe self-test --vectors`. */
  async #publishedVectors(run: MhfeRun, progress: StageProgress): Promise<void> {
    const client = await run.step(() => this.#engine.client());
    const { version } = await run.step(() => client.parameters());
    const outcome = await run.step(() =>
      client.selfTest({
        onProgress: (report) => {
          this.#status.textContent = progress.line(report);
        },
      }),
    );
    this.#status.textContent = `Self-test complete in ${progress.elapsed()}.`;
    const verdict = (asPublished: boolean, action: string): string =>
      asPublished ? `${action} as published` : `${action} NOT as published`;
    this.#result.append(
      factsList([
        ["Suite 3", verdict(outcome.suite3.asPublished, "encrypts")],
        ["Suite 4", verdict(outcome.suite4.asPublished, "recovers")],
        [
          "Vectors",
          `${outcome.suite3.vector} (suite 3) and ${outcome.suite4.vector} (suite 4), public`,
        ],
        ["Package", `MHFE ${version}`],
      ]),
      outcome.passed
        ? paragraph("This program computes MHFE as the published vectors say.", "success-callout")
        : paragraph(
            // The package's own sentence says where it went wrong (fault.message).
            `This program does NOT compute MHFE as published: ${outcome.fault?.message ?? "a vector differs"}. ` +
              "Do NOT use it for a real phrase; try another computer or build, and report it.",
            "warning-callout",
          ),
    );
  }

  #table(rows: readonly SelfTestRow[]): HTMLTableElement {
    const table = document.createElement("table");
    table.className = "self-test-table";
    for (const row of rows) {
      const line = table.insertRow();
      line.insertCell().textContent = `${row.mark ?? "✓"} ${row.name}`;
      line.insertCell().textContent = row.detail ?? "";
    }
    return table;
  }
}

// The Self-test tab of the MnemoCode panel, as MnemoCode's menu offers "Check that this copy of
// MnemoCode works": every check of the library and of this build's parts, on the person's button
// press only. The other parts of the panel add their checks to the one run below when installed.
import { MnemoCodeSelfTestRun } from "@ckd/recovery-backup/mnemocode-self-test.js";
import { MNEMOCODE_PAGE_FEATURES } from "@ckd/recovery-backup/self-test-mnemocode.js";
import { webCryptoPbkdf2 } from "../workers/webcrypto-pbkdf2.js";
import { fullSelfTestParts } from "./full-self-test.js";
import { paragraph, required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";

/** The page's one self-test run, to which the shares and the card export add their checks. */
export const mnemoCodeSelfTest = new MnemoCodeSelfTestRun(webCryptoPbkdf2);
for (const feature of MNEMOCODE_PAGE_FEATURES) mnemoCodeSelfTest.addFeature(feature);

export class MnemoCodeSelfTestTab {
  readonly #context: RecoveryFeatureContext;
  readonly #status = required<HTMLElement>("#mnemocode-self-test-status");
  readonly #result = required<HTMLElement>("#mnemocode-self-test-result");

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    required<HTMLButtonElement>("#mnemocode-self-test").addEventListener("click", () =>
      this.#start(),
    );
    // The same checks run in the page's full self-test too.
    fullSelfTestParts.add(async () =>
      (await mnemoCodeSelfTest.run()).rows.map((row) => ({
        name: `MnemoCode: ${row.name}`,
        detail: row.detail,
        milliseconds: row.milliseconds,
      })),
    );
  }

  #start(): void {
    if (!this.#context.jobs.ready || this.#context.jobs.runningJob !== null) return;
    this.#result.replaceChildren();
    this.#status.classList.remove("warning");
    this.#status.textContent = "Running the self-test…";
    void this.#context.jobs
      .runHeavy("The MnemoCode self-test", () => this.#run())
      .catch((cause: unknown) => {
        this.#status.classList.add("warning");
        this.#status.textContent = `Failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      });
  }

  async #run(): Promise<void> {
    let report;
    try {
      report = await mnemoCodeSelfTest.run();
    } catch (cause) {
      this.#context.jobs.setReady(false);
      this.#context.selfTestFailed?.(cause);
      throw cause;
    }
    const table = document.createElement("table");
    table.className = "self-test-table";
    for (const row of report.rows) {
      const line = table.insertRow();
      for (const text of [`✓ ${row.name}`, row.detail, `${Math.round(row.milliseconds)} ms`])
        line.insertCell().textContent = text;
    }
    this.#result.append(
      table,
      paragraph(
        `${report.publicVectors} public vectors and ${report.roundTrips} round trips checked in ${Math.round(report.milliseconds)} ms.`,
        "field-note",
      ),
    );
    this.#status.textContent = "Every check passed: this copy of MnemoCode works.";
  }
}

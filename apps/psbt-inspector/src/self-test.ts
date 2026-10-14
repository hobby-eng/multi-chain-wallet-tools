// The Inspector's self-test: the known answers of the features in this build. The quick ones run
// at every start, before any workflow opens; the person's full self-test adds the slower ones
// (scrypt, the BIP-322 library). A failure at start keeps every workflow closed.
import type { InspectorCheck } from "./self-test-checks.js";
import { required } from "./ui-common.js";

/** The checks of the features built in: quick ones at start, slower ones in the full self-test. */
export interface SelectedSelfTests {
  readonly startup: readonly InspectorCheck[];
  readonly full: readonly InspectorCheck[];
}

async function runChecks(checks: readonly InspectorCheck[]): Promise<number> {
  const started = performance.now();
  for (const check of checks) await check.run();
  return Math.round(performance.now() - started);
}

export class InspectorSelfTest {
  readonly #checks: SelectedSelfTests;
  readonly #badge = required<HTMLElement>("psbt-self-test-status");
  readonly #details = required<HTMLElement>("psbt-self-test-details");
  readonly #button = required<HTMLButtonElement>("psbt-full-self-test");
  readonly #status = required<HTMLElement>("psbt-full-self-test-status");
  readonly #result = required<HTMLElement>("psbt-full-self-test-result");

  constructor(checks: SelectedSelfTests) {
    this.#checks = checks;
    this.#button.addEventListener("click", () => void this.#runFull());
  }

  /** The startup checks; true when every one passed. */
  async start(): Promise<boolean> {
    try {
      const milliseconds = await runChecks(this.#checks.startup);
      this.#badge.className = "self-test-badge passed";
      this.#badge.textContent = "Self-test passed";
      this.#details.textContent = `${this.#checks.startup.length} known-answer checks passed in ${milliseconds.toLocaleString("en-US")} ms: ${this.#checks.startup.map((check) => check.name).join(" · ")}.`;
      this.#button.disabled = false;
      return true;
    } catch (cause) {
      this.#badge.className = "self-test-badge failed";
      this.#badge.textContent = "Self-test failed";
      this.#details.textContent = `${cause instanceof Error ? cause.message : String(cause)} Every workflow stays closed: do not use this copy of the tool.`;
      return false;
    }
  }

  async #runFull(): Promise<void> {
    this.#button.disabled = true;
    this.#result.replaceChildren();
    this.#status.classList.remove("warning");
    this.#status.textContent = "Running the full self-test…";
    const checks = [...this.#checks.startup, ...this.#checks.full];
    const table = document.createElement("table");
    table.className = "self-test-table";
    try {
      for (const check of checks) {
        const started = performance.now();
        await check.run();
        const row = table.insertRow();
        row.insertCell().textContent = `✓ ${check.name}`;
        row.insertCell().textContent = `${Math.round(performance.now() - started)} ms`;
      }
      this.#status.textContent = `Every check passed: ${checks.length} checks.`;
    } catch (cause) {
      this.#status.classList.add("warning");
      this.#status.textContent = `✗ Failed: ${cause instanceof Error ? cause.message : String(cause)} Do not use this copy of the tool.`;
    } finally {
      // The rows that passed stay visible, so that it is clear where a failure stopped.
      this.#result.append(table);
      this.#button.disabled = false;
    }
  }
}

// The full self-test of the Deriver, started only by the person: the startup checks again, with
// the slower known answers of the features (BIP38's scrypt, the BIP-322 library), then the
// self-tests that the installed features add here (MnemoCode's vectors). A feature whose own test
// takes minutes, such as MHFE's, leaves a note that names its tab instead.

/** One row of the result: what was checked, and how long it took where that is known. */
export interface SelfTestRow {
  readonly name: string;
  readonly detail?: string;
  readonly milliseconds?: number;
  /** "✓" for a pass unless given: "!" a pass with a limit, "–" not available here or not run. */
  readonly mark?: string;
}

/** A self-test that a feature adds; it throws when a check fails. */
export type SelfTestPart = () => Promise<readonly SelfTestRow[]>;

/** The parts and notes that the installed features add, run after the startup checks. */
class FullSelfTestParts {
  readonly #parts: SelfTestPart[] = [];
  readonly #notes: string[] = [];

  add(part: SelfTestPart): void {
    this.#parts.push(part);
  }

  note(text: string): void {
    this.#notes.push(text);
  }

  get parts(): readonly SelfTestPart[] {
    return this.#parts;
  }

  get notes(): readonly string[] {
    return this.#notes;
  }
}

export const fullSelfTestParts = new FullSelfTestParts();

/** The startup checks with the slower known answers, as the controller runs them. */
export type StartupChecks = () => Promise<{
  readonly checks: readonly string[];
  readonly durationMs: number;
}>;

/**
 * The page's rule of one heavy job at a time (RecoveryJobGate in a build with Recover & Back Up):
 * the full self-test runs MnemoCode's scrypt and card drawing, so it never runs beside an MHFE
 * Argon2 job or another self-test.
 */
export interface HeavyJobs {
  readonly runningJob: string | null;
  runHeavy<T>(name: string, job: () => Promise<T>): Promise<T>;
  onChange(listener: () => void): void;
}

/** The name the job gate shows while the full self-test runs. */
const FULL_SELF_TEST_JOB = "The full self-test";

export class FullSelfTestSection {
  readonly #button: HTMLButtonElement;
  readonly #status: HTMLElement;
  readonly #result: HTMLElement;
  readonly #startupChecks: StartupChecks;
  readonly #jobs: HeavyJobs | undefined;
  readonly #failureListeners: ((cause: unknown) => void)[] = [];
  #ready = false;
  #running = false;

  constructor(startupChecks: StartupChecks, jobs?: HeavyJobs) {
    this.#startupChecks = startupChecks;
    this.#jobs = jobs;
    this.#button = required<HTMLButtonElement>("#full-self-test");
    this.#status = required<HTMLElement>("#full-self-test-status");
    this.#result = required<HTMLElement>("#full-self-test-result");
    this.#button.addEventListener("click", () => void this.#run());
    jobs?.onChange(() => this.#refreshButton());
  }

  /** The button works once the startup checks have passed. */
  set enabled(enabled: boolean) {
    this.#ready = enabled;
    this.#refreshButton();
  }

  /** Called with the cause when a full self-test fails, so that the page closes its controls. */
  onFailure(listener: (cause: unknown) => void): void {
    this.#failureListeners.push(listener);
  }

  #refreshButton(): void {
    const busy = this.#running || (this.#jobs?.runningJob ?? null) !== null;
    this.#button.disabled = !this.#ready || busy;
  }

  async #run(): Promise<void> {
    if (this.#running || !this.#ready) return;
    const otherJob = this.#jobs?.runningJob ?? null;
    if (otherJob !== null) {
      this.#status.classList.add("warning");
      this.#status.textContent = `${otherJob} is running. Run the full self-test when it ends.`;
      return;
    }
    this.#running = true;
    this.#refreshButton();
    this.#result.replaceChildren();
    this.#status.classList.remove("warning");
    this.#status.textContent = "Running the full self-test…";
    const rows: SelfTestRow[] = [];
    const started = performance.now();
    try {
      const checks = () => this.#runChecks(rows);
      await (this.#jobs === undefined ? checks() : this.#jobs.runHeavy(FULL_SELF_TEST_JOB, checks));
      this.#result.append(table(rows), ...fullSelfTestParts.notes.map(note));
      this.#status.textContent = `Every check passed: ${rows.length} checks in ${Math.round(performance.now() - started).toLocaleString("en-US")} ms.`;
    } catch (cause) {
      // The rows that passed stay visible above the failure, so that it is clear where it stopped.
      this.#result.append(table(rows));
      this.#status.classList.add("warning");
      this.#status.textContent = `✗ Failed: ${cause instanceof Error ? cause.message : String(cause)} Do not use this copy of the tool.`;
      for (const listener of this.#failureListeners) listener(cause);
    } finally {
      this.#running = false;
      this.#refreshButton();
    }
  }

  async #runChecks(rows: SelfTestRow[]): Promise<void> {
    const startup = await this.#startupChecks();
    rows.push(...startup.checks.map((name) => ({ name })));
    for (const part of fullSelfTestParts.parts) rows.push(...(await part()));
  }
}

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`The page is missing ${selector}.`);
  return element;
}

function table(rows: readonly SelfTestRow[]): HTMLTableElement {
  const element = document.createElement("table");
  element.className = "self-test-table";
  for (const row of rows) {
    const line = element.insertRow();
    line.insertCell().textContent = `${row.mark ?? "✓"} ${row.name}`;
    line.insertCell().textContent = row.detail ?? "";
    line.insertCell().textContent =
      row.milliseconds === undefined ? "" : `${Math.round(row.milliseconds)} ms`;
  }
  return element;
}

function note(text: string): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = "field-note";
  element.textContent = text;
  return element;
}

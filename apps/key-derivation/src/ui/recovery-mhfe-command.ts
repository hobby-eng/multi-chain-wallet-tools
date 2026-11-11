// Encode's settings that `mhfe encrypt` takes as options, read in one place for the browser's run
// and for the command line, and that command for the settings this page does not run at its
// defaults: a memory level above 0, which no browser can run, or a PIM other than 0, whose hours a
// person may rather spend in the native program. The command is built from the settings alone,
// never from a field's text: it holds no secret, and it is the same whether the phrase is shown or
// hidden. mhfe asks for the phrase and the password at its own prompts.
import {
  MhfeEncryptCommand,
  mhfeMemoryText,
  type MhfeEncryptChoices,
  type MhfeMemoryLevel,
} from "@ckd/recovery-backup/mhfe-encrypt-command.js";
import { MhfeRepairChoiceError } from "@ckd/recovery-backup/mhfe-repair-choices.js";
import type { MhfeParameters } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { PimField, selectedRepairCount } from "./recovery-mhfe-fields.js";
import type { NewPasswordChoice } from "./recovery-mhfe-new-password.js";
import { describe } from "./recovery-mhfe-status.js";
import { required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";

/** The memory level chosen until another is: the default, the one level a browser runs. */
const DEFAULT_LEVEL = 0;
/** The space before each option of the command line. */
const OPTION_START = / (?=--)/u;

/** What the settings use of the new password's choice: its kind, and a change of runsHere(). */
type NewPasswordKind = Pick<NewPasswordChoice, "kind" | "reconsider">;

/**
 * The settings of Encode that are not secret: the PIM, the memory level, the container length,
 * the kind of the new password and the repair words. The memory level offers the default alone
 * until the package's parameters give every level, and it decides whether the browser runs the
 * encryption at all (runsHere), which the new password's choice asks before it makes a password.
 */
export class EncryptSettings {
  readonly #pim = new PimField("encrypt");
  readonly #level = required<HTMLSelectElement>("#mhfe-encrypt-memory-level");
  readonly #sameLength = required<HTMLInputElement>("#mhfe-length-same");
  readonly #newPassword: NewPasswordKind;
  #command: MhfeEncryptCommand | undefined;

  constructor(newPassword: NewPasswordKind) {
    this.#newPassword = newPassword;
    this.#offerLevels([{ level: DEFAULT_LEVEL, memory: mhfeMemoryText(DEFAULT_LEVEL) }]);
    // A level the browser cannot run puts a password made away, and level 0 brings it back.
    for (const type of ["input", "change"])
      this.#level.addEventListener(type, () => this.#newPassword.reconsider());
  }

  /**
   * The PIM as typed and the memory level: the settings that decide whether the command is
   * offered. A ticked PIM field without a number reads as NaN here; read() refuses it.
   */
  get work(): Pick<MhfeEncryptChoices, "pim" | "memoryLevel"> {
    return { pim: this.#pim.value(), memoryLevel: Number(this.#level.value) };
  }

  /**
   * Whether the browser runs the encryption at the level chosen. Until the package's parameters
   * are read, only the default level is offered, which every browser runs.
   */
  runsHere(): boolean {
    return this.#command === undefined || this.#command.runsInBrowser(this.work.memoryLevel);
  }

  /**
   * Every setting; throws the PIM field's refusal (PimField.settled) for a PIM that cannot be used,
   * and MhfeRepairChoiceError while no offered repair choice is selected.
   */
  read(parameters: Pick<MhfeParameters, "repairWordCounts" | "maxPim">): MhfeEncryptChoices {
    return {
      pim: this.#pim.settled(parameters.maxPim),
      memoryLevel: this.work.memoryLevel,
      sameLength: this.#sameLength.checked,
      newPassword: this.#newPassword.kind,
      repairWords: selectedRepairCount("mhfe-repair-count", parameters),
    };
  }

  /**
   * The settings an encryption in the browser uses. Throws, before the caller reads any secret, for
   * a PIM that cannot be used (read) or a level the browser cannot run (MhfeEncryptCommand),
   * whatever the state of the Encrypt button.
   */
  forBrowser(parameters: MhfeParameters): MhfeEncryptChoices {
    const choices = this.read(parameters);
    new MhfeEncryptCommand(parameters).assertRunsInBrowser(choices);
    return choices;
  }

  /** Takes the levels the package's parameters give, through the command that knows them. */
  offer(command: MhfeEncryptCommand): void {
    this.#command = command;
    this.#offerLevels(command.levels());
    this.#newPassword.reconsider();
  }

  /** Offers `levels`, each with its memory; a level chosen before stays chosen if offered. */
  #offerLevels(levels: readonly Pick<MhfeMemoryLevel, "level" | "memory">[]): void {
    const previous = this.#level.value;
    this.#level.replaceChildren(
      ...levels.map(({ level, memory }) => {
        const option = document.createElement("option");
        option.value = String(level);
        option.textContent = `${level} · ${memory}${level === DEFAULT_LEVEL ? " (default)" : ""}`;
        return option;
      }),
    );
    const kept = levels.some(({ level }) => String(level) === previous);
    this.#level.value = kept ? previous : String(DEFAULT_LEVEL);
  }
}

/**
 * The command line under Encode's settings with its Copy button, shown for a PIM or memory level
 * other than 0, and Encrypt closed at a level the browser cannot run.
 */
export class EncryptCommandView {
  readonly #context: Pick<RecoveryFeatureContext, "jobs" | "writeClipboard">;
  readonly #settings: EncryptSettings;
  readonly #encrypt = required<HTMLButtonElement>("#mhfe-encrypt");
  readonly #block = required<HTMLElement>("#mhfe-encrypt-command");
  readonly #text = required<HTMLElement>("#mhfe-encrypt-command-text");
  readonly #copyButton = required<HTMLButtonElement>("#mhfe-encrypt-command-copy");
  readonly #status = required<HTMLElement>("#mhfe-encrypt-command-status");
  readonly #lengthNote = required<HTMLElement>("#mhfe-encrypt-command-length");
  readonly #madeNote = required<HTMLElement>("#mhfe-encrypt-command-made");
  #loaded: { parameters: MhfeParameters; command: MhfeEncryptCommand } | undefined;
  /** The command shown: the only text Copy writes. Undefined while none is shown. */
  #line: string | undefined;

  constructor(
    context: Pick<RecoveryFeatureContext, "jobs" | "writeClipboard">,
    engine: MhfeEngine,
    settings: EncryptSettings,
  ) {
    this.#context = context;
    this.#settings = settings;
    const panel = required<HTMLElement>("#mhfe-create-panel");
    for (const type of ["input", "change"]) panel.addEventListener(type, () => this.#render());
    this.#copyButton.addEventListener("click", () => void this.#copy());
    // The job gate sets Encrypt on each of its changes, and this listener comes after the gate's
    // own (bindJobGate runs before the panels install), so Encrypt stays closed above level 0.
    context.jobs.onChange(() => this.#gateEncrypt());
    engine.whenPassed(() => void this.#load(engine));
  }

  async #load(engine: MhfeEngine): Promise<void> {
    let parameters: MhfeParameters;
    try {
      parameters = await engine.coreParameters();
    } catch {
      // The panel's repair choices already say that the parameters could not be loaded; the form
      // keeps level 0, which the browser runs, and offers no command.
      return;
    }
    const command = new MhfeEncryptCommand(parameters);
    this.#loaded = { parameters, command };
    this.#settings.offer(command);
    this.#render();
  }

  /** Closes Encrypt at a level the browser cannot run; Encode's run refuses it too (forBrowser). */
  #gateEncrypt(): void {
    this.#encrypt.disabled = !this.#context.jobs.acceptsHeavyJob || !this.#settings.runsHere();
  }

  #render(): void {
    if (this.#loaded === undefined) return;
    const { parameters, command } = this.#loaded;
    this.#gateEncrypt();
    this.#line = undefined;
    this.#status.textContent = "";
    this.#block.hidden = !command.offered(this.#settings.work);
    if (!this.#block.hidden) this.#show(parameters, command);
    this.#text.replaceChildren(...this.#parts());
    this.#copyButton.disabled = this.#line === undefined;
  }

  /**
   * The command shown in parts, an option with its value in each, so that a narrow screen breaks
   * the line between options rather than inside one such as --new-password. Copy writes #line.
   */
  #parts(): (HTMLElement | string)[] {
    const parts = this.#line?.split(OPTION_START) ?? [];
    return parts.flatMap((text, at) => {
      const part = document.createElement("span");
      part.textContent = text;
      return at === 0 ? [part] : [" ", part];
    });
  }

  /**
   * Builds the command, or says which setting cannot be used: the PIM field's refusal, or a repair
   * choice not offered. The level comes from the list of the package's levels, which line() takes.
   */
  #show(parameters: MhfeParameters, command: MhfeEncryptCommand): void {
    try {
      const choices = this.#settings.read(parameters);
      this.#line = command.line(choices);
      this.#lengthNote.hidden = choices.sameLength;
      this.#madeNote.hidden = choices.newPassword === "own";
    } catch (cause) {
      if (PimField.refused(cause) || cause instanceof MhfeRepairChoiceError)
        this.#status.textContent = cause.message;
      else throw cause;
    }
  }

  async #copy(): Promise<void> {
    const line = this.#line;
    if (line === undefined) return;
    try {
      await this.#context.writeClipboard(line);
      this.#status.textContent = "Copied to clipboard.";
    } catch (cause) {
      this.#status.textContent = describe(cause, "Clipboard access failed.");
    }
  }
}

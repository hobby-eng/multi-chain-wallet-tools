// The mhfe command under the settings of every MHFE tab, for the settings this page does not run at
// its defaults: a memory level above 0, which no browser can run, or a PIM other than 0, whose hours
// a person may rather spend in the native program. One view shows each tab's command with its Copy
// button; each tab's source (recovery-mhfe-command-sources.ts) builds it from the tab's settings
// alone, never from a field's text: it holds no secret, and it is the same whether a phrase is
// shown or hidden. mhfe asks for every secret at its own prompts.
import {
  MhfeCommand,
  mhfeMemoryText,
  type MhfeCommandOperation,
  type MhfeMemoryLevel,
  type MhfeWork,
} from "@ckd/recovery-backup/mhfe-command.js";
import { MhfeRepairChoiceError } from "@ckd/recovery-backup/mhfe-repair-choices.js";
import type { MhfeParameters } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { PimField } from "./recovery-mhfe-fields.js";
import { AddressPathChoice } from "./recovery-mhfe-reference.js";
import { describe } from "./recovery-mhfe-status.js";
import { required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";

/** The memory level chosen until another is: the default, the one level a browser runs. */
const DEFAULT_LEVEL = 0;
/** The space before each option of the command line. */
const OPTION_START = / (?=--)/u;

/**
 * A memory level choice, `#mhfe-{prefix}-memory-level`. It offers the default alone until the
 * package's parameters give every level, and it knows whether the browser runs the level chosen.
 */
export class MemoryLevelField {
  readonly #select: HTMLSelectElement;
  #command: MhfeCommand | undefined;

  constructor(prefix: string) {
    this.#select = required<HTMLSelectElement>(`#mhfe-${prefix}-memory-level`);
    this.#offerLevels([{ level: DEFAULT_LEVEL, memory: mhfeMemoryText(DEFAULT_LEVEL) }]);
  }

  /** The level chosen. */
  get value(): number {
    return Number(this.#select.value);
  }

  set disabled(disabled: boolean) {
    this.#select.disabled = disabled;
  }

  /** Calls `listener` when another level is chosen. */
  onChange(listener: () => void): void {
    for (const type of ["input", "change"]) this.#select.addEventListener(type, listener);
  }

  /**
   * Whether the browser runs the level chosen. Until the package's parameters are read, only the
   * default level is offered, which every browser runs.
   */
  runsHere(): boolean {
    return this.#command === undefined || this.#command.runsInBrowser(this.value);
  }

  /**
   * Refuses, before a tab reads any secret, a level the browser cannot run (MhfeCommand). Until
   * the parameters are read the field offers level 0 alone, which every browser runs.
   */
  assertRunsHere(operation: MhfeCommandOperation): void {
    this.#command?.assertLevelRunsInBrowser(this.value, operation);
  }

  /** Takes the levels the package's parameters give, through the command that knows them. */
  offer(command: MhfeCommand): void {
    this.#command = command;
    this.#offerLevels(command.levels());
  }

  /** Offers `levels`, each with its memory; a level chosen before stays chosen if offered. */
  #offerLevels(levels: readonly Pick<MhfeMemoryLevel, "level" | "memory">[]): void {
    const previous = this.#select.value;
    this.#select.replaceChildren(
      ...levels.map(({ level, memory }) => {
        const option = document.createElement("option");
        option.value = String(level);
        option.textContent = `${level} · ${memory}${level === DEFAULT_LEVEL ? " (default)" : ""}`;
        return option;
      }),
    );
    const kept = levels.some(({ level }) => String(level) === previous);
    this.#select.value = kept ? previous : String(DEFAULT_LEVEL);
  }
}

/** What a tab gives the command view: its settings, its command and the notes beside it. */
export interface MhfeCommandSource {
  /** The operation the tab runs, which names it in a refusal of its memory level. */
  readonly operation: MhfeCommandOperation;
  /** The memory level fields of the tab, which take the package's levels. */
  readonly levelFields: readonly MemoryLevelField[];
  /**
   * The settings of the tab's work as typed, which decide whether the command is offered. A ticked
   * PIM field without a number reads as NaN here; line() refuses it.
   */
  works(): readonly MhfeWork[];
  /** The command; throws a refusal (commandRefused) for a setting that cannot be used. */
  line(command: MhfeCommand, parameters: MhfeParameters): string;
  /** The notes beside the command, `#mhfe-{prefix}-command-{name}`, and whether each shows. */
  notes(): Readonly<Record<string, boolean>>;
}

/** Whether the browser runs every memory level of `source`. */
export function runsHere(source: Pick<MhfeCommandSource, "levelFields">): boolean {
  return source.levelFields.every((field) => field.runsHere());
}

/**
 * Refuses, before a tab reads any secret, a memory level of `source` that the browser cannot run,
 * whatever the state of the tab's buttons. The tabs that open a container pass no level to the
 * package, which would then work at level 0 and give another phrase than the container's own.
 */
export function assertRunsHere(source: Pick<MhfeCommandSource, "levelFields" | "operation">): void {
  for (const field of source.levelFields) field.assertRunsHere(source.operation);
}

/**
 * Whether `cause` is a refusal of a setting that the view says instead of a command: a PIM field's
 * (PimField.settled), a repair choice not offered, a path field ticked and empty, or the command's
 * own. Their texts name no secret.
 */
export function commandRefused(cause: unknown): cause is Error {
  return (
    PimField.refused(cause) ||
    cause instanceof MhfeRepairChoiceError ||
    AddressPathChoice.refused(cause) ||
    MhfeCommand.refused(cause)
  );
}

/** Where a tab's command view sits, and the buttons that run its work in the browser. */
export interface MhfeCommandPlace {
  /** Names the block, as in `#mhfe-{prefix}-command`. */
  readonly prefix: string;
  /** The tab's panel, whose edits change the command. */
  readonly panel: HTMLElement;
  /** The buttons of heavy work, closed at a level the browser cannot run. */
  readonly gated: readonly HTMLButtonElement[];
}

/**
 * A tab's command with its Copy button, shown for a PIM or memory level other than 0, and the tab's
 * heavy work closed at a level the browser cannot run; the work refuses it too (assertRunsHere).
 */
export class MhfeCommandView {
  readonly #context: Pick<RecoveryFeatureContext, "jobs" | "writeClipboard">;
  readonly #source: MhfeCommandSource;
  readonly #prefix: string;
  readonly #gated: readonly HTMLButtonElement[];
  readonly #block: HTMLElement;
  readonly #text: HTMLElement;
  readonly #copyButton: HTMLButtonElement;
  readonly #status: HTMLElement;
  #loaded: { parameters: MhfeParameters; command: MhfeCommand } | undefined;
  /** The command shown: the only text Copy writes. Undefined while none is shown. */
  #line: string | undefined;

  constructor(
    context: Pick<RecoveryFeatureContext, "jobs" | "writeClipboard">,
    engine: MhfeEngine,
    source: MhfeCommandSource,
    place: MhfeCommandPlace,
  ) {
    this.#context = context;
    this.#source = source;
    this.#prefix = `mhfe-${place.prefix}-command`;
    this.#gated = place.gated;
    this.#block = required<HTMLElement>(`#${this.#prefix}`);
    this.#text = required<HTMLElement>(`#${this.#prefix}-text`);
    this.#copyButton = required<HTMLButtonElement>(`#${this.#prefix}-copy`);
    this.#status = required<HTMLElement>(`#${this.#prefix}-status`);
    for (const type of ["input", "change"])
      place.panel.addEventListener(type, () => this.refresh());
    this.#copyButton.addEventListener("click", () => void this.#copy());
    // The job gate sets the buttons on each of its changes, and this listener comes after the
    // gate's own (bindJobGate runs before the panels install), so they stay closed above level 0.
    context.jobs.onChange(() => this.#gate());
    engine.whenPassed(() => void this.#load(engine));
  }

  /** Shows the command for the settings as they are now, after a change no event announces. */
  refresh(): void {
    if (this.#loaded === undefined) return;
    const { parameters, command } = this.#loaded;
    this.#gate();
    this.#line = undefined;
    this.#status.textContent = "";
    this.#block.hidden = !command.offered(this.#source.works());
    if (!this.#block.hidden) this.#show(parameters, command);
    this.#text.replaceChildren(...this.#parts());
    this.#copyButton.disabled = this.#line === undefined;
  }

  async #load(engine: MhfeEngine): Promise<void> {
    let parameters: MhfeParameters;
    try {
      parameters = await engine.coreParameters();
    } catch {
      // The panel already says that the parameters could not be loaded; the form keeps level 0,
      // which the browser runs, and offers no command.
      return;
    }
    const command = new MhfeCommand(parameters);
    this.#loaded = { parameters, command };
    for (const field of this.#source.levelFields) field.offer(command);
    this.refresh();
  }

  /** Closes the heavy work at a level the browser cannot run; the work refuses it too. */
  #gate(): void {
    const runs = runsHere(this.#source);
    for (const button of this.#gated)
      button.disabled = !this.#context.jobs.acceptsHeavyJob || !runs;
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

  /** Builds the command and its notes, or says which setting cannot be used. */
  #show(parameters: MhfeParameters, command: MhfeCommand): void {
    try {
      this.#line = this.#source.line(command, parameters);
      for (const [name, shown] of Object.entries(this.#source.notes()))
        required<HTMLElement>(`#${this.#prefix}-${name}`).hidden = !shown;
    } catch (cause) {
      if (commandRefused(cause)) this.#status.textContent = cause.message;
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

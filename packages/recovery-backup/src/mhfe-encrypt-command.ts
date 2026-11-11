// The `mhfe encrypt` command line for the settings of the Deriver's Encode form, where the browser
// cannot or should not run them: a memory level above the browser's, or a PIM whose extra hours a
// person may rather spend natively. Every option and value is mhfe 0.8.0's (src/bin/mhfe/encrypt.rs,
// settings.rs, made_password.rs and container_repair.rs, and docs/CLI.md of hobby-eng/mhfe): a
// change there goes here too. The command carries settings only. mhfe takes no argument for the
// phrase or the password; it asks for both at its own prompts, so neither reaches a shell history.
import type { MhfeParameters } from "@ckd/recovery-mhfe-wasm/core/client.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import type { MhfeRepairWordCount } from "./mhfe-repair-choices.js";

/** How the new container password comes, named as the Encode form's answers name the kinds. */
export type MhfeNewPasswordKind = "own" | "words" | "checkWord" | "characters";

/** The settings of one encryption that are not secret: everything the command line can carry. */
export interface MhfeEncryptChoices {
  readonly pim: number;
  readonly memoryLevel: number;
  /** A container as long as a 12- to 21-word phrase instead of 24 words. */
  readonly sameLength: boolean;
  readonly newPassword: MhfeNewPasswordKind;
  /** 0 for none. */
  readonly repairWords: 0 | MhfeRepairWordCount;
}

/** One memory level a container takes, with its memory as mhfe writes it. */
export interface MhfeMemoryLevel {
  readonly level: number;
  /** "2 GiB", "1536 GiB", "3 TiB". */
  readonly memory: string;
  readonly runsInBrowser: boolean;
}

/** The parts of the package's parameters that bound the command's settings. */
export type MhfeCommandLimits = Pick<
  MhfeParameters,
  "maxPim" | "maxMemoryLevel" | "highestBrowserMemoryLevel"
>;

const ERRORS = new ErrorCatalog("mhfe.command", {
  pim: { kind: "range", text: (most: number) => `The PIM is a whole number from 0 to ${most}.` },
  "memory-level": {
    kind: "range",
    text: (most: number) => `The memory level is a whole number from 0 to ${most}.`,
  },
  "browser-level": {
    kind: "range",
    text: (level: number, highest: number) =>
      `A browser runs memory level ${highest} only: encrypt at level ${level} with the mhfe command.`,
  },
});

/** The value of `--new-password` for each kind (mhfe's PasswordKind, written in kebab case). */
const NEW_PASSWORD_VALUES = {
  own: "own",
  words: "words",
  checkWord: "check-word",
  characters: "chars",
} as const satisfies Record<MhfeNewPasswordKind, string>;

/** A size from 1 TiB on that is a whole number of tebibytes is written in them, as mhfe does. */
const GIB_IN_TIB = 1024;

/**
 * The memory of every Argon2 call at `level`, as mhfe writes it: 2 GiB at level 0, doubling every
 * two levels, 3 GiB at level 1 (mhfe_core's WorkFactor::memory_kib, `(2 + level % 2) << (20 +
 * level / 2)` KiB, written by mhfe's memory_text in whole gibibytes, or tebibytes where whole).
 * The browser package exposes no size per level, so this is the page's one copy of that rule.
 */
export function mhfeMemoryText(level: number): string {
  const gib = (2 + (level % 2)) * 2 ** Math.floor(level / 2);
  return gib >= GIB_IN_TIB && gib % GIB_IN_TIB === 0 ? `${gib / GIB_IN_TIB} TiB` : `${gib} GiB`;
}

/** Whether `value` is a whole number from 0 to `most`. */
function inRange(value: number, most: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= most;
}

/**
 * The command line of an encryption, with the levels it takes and the one rule of when a page
 * offers it. The limits come from the package's parameters, never from a second list.
 */
export class MhfeEncryptCommand {
  readonly #limits: MhfeCommandLimits;

  constructor(limits: MhfeCommandLimits) {
    this.#limits = {
      maxPim: limits.maxPim,
      maxMemoryLevel: limits.maxMemoryLevel,
      highestBrowserMemoryLevel: limits.highestBrowserMemoryLevel,
    };
  }

  /** Every memory level a container takes, from 0 up, with its memory. */
  levels(): MhfeMemoryLevel[] {
    return Array.from({ length: this.#limits.maxMemoryLevel + 1 }, (_, level) => ({
      level,
      memory: mhfeMemoryText(level),
      runsInBrowser: this.runsInBrowser(level),
    }));
  }

  /** Whether a browser can run `level`: only up to the package's highest, level 0. */
  runsInBrowser(level: number): boolean {
    return level <= this.#limits.highestBrowserMemoryLevel;
  }

  /**
   * Whether a page offers the command: for a PIM or a memory level other than 0. At the defaults the
   * browser runs the encryption in minutes and the command adds nothing.
   */
  offered(settings: Pick<MhfeEncryptChoices, "pim" | "memoryLevel">): boolean {
    return settings.pim !== 0 || settings.memoryLevel !== 0;
  }

  /**
   * `mhfe encrypt` with every setting stated, in the order of mhfe's docs/CLI.md: `--pim` and
   * `--mem` always, so that mhfe asks no settings question; `--same-length` only for the same
   * length, since 24 words has no option (mhfe asks for a 12- to 21-word phrase, and Enter keeps
   * 24 words); `--new-password` and `--repair-words`, 0 for none. Refuses, with the codes
   * mhfe.command.pim and mhfe.command.memory-level, a PIM or level that mhfe would refuse.
   */
  line(choices: MhfeEncryptChoices): string {
    this.#check(choices);
    return [
      "mhfe encrypt",
      `--pim ${choices.pim}`,
      `--mem ${choices.memoryLevel}`,
      ...(choices.sameLength ? ["--same-length"] : []),
      `--new-password ${NEW_PASSWORD_VALUES[choices.newPassword]}`,
      `--repair-words ${choices.repairWords}`,
    ].join(" ");
  }

  /**
   * Refuses, before a page reads any secret, settings it cannot encrypt with: a PIM or level that
   * line() refuses, or a level above the browser's (code mhfe.command.browser-level).
   */
  assertRunsInBrowser(settings: Pick<MhfeEncryptChoices, "pim" | "memoryLevel">): void {
    this.#check(settings);
    if (!this.runsInBrowser(settings.memoryLevel))
      throw ERRORS.create("browser-level", [
        settings.memoryLevel,
        this.#limits.highestBrowserMemoryLevel,
      ]);
  }

  /** Refuses a PIM or a memory level that mhfe refuses. */
  #check(settings: Pick<MhfeEncryptChoices, "pim" | "memoryLevel">): void {
    if (!inRange(settings.pim, this.#limits.maxPim))
      throw ERRORS.create("pim", [this.#limits.maxPim]);
    if (!inRange(settings.memoryLevel, this.#limits.maxMemoryLevel))
      throw ERRORS.create("memory-level", [this.#limits.maxMemoryLevel]);
  }
}

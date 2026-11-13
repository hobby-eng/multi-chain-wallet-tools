// The mhfe command lines for the settings of the Deriver's MHFE tabs, where the browser cannot or
// should not run them: a memory level above the browser's, or a PIM whose extra hours a person may
// rather spend natively. Every option and value is mhfe 0.8.0's (src/bin/mhfe/encrypt.rs,
// decrypt.rs, check.rs, rekey.rs, settings.rs, made_password.rs and container_repair.rs, and
// docs/CLI.md of hobby-eng/mhfe): a change there goes here too. A command carries settings only.
// mhfe takes no argument for a phrase, a container, a password, a BIP39 passphrase, an address or a
// fingerprint; it asks for each at its own prompts, so none of them reaches a shell history. No
// choice type below has a field for one, and `--passphrase-used`, whether a wallet has a BIP39
// passphrase, is never written either (owner's decision of 2026-11-13): mhfe asks it instead.
import type { MhfeCoin, MhfeParameters, WordCount } from "@ckd/recovery-mhfe-wasm/core/client.js";
import { MAX_BIP32_DEPTH, MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import type { MhfeRepairWordCount } from "./mhfe-repair-choices.js";

/** How the new container password comes, named as the Encode form's answers name the kinds. */
export type MhfeNewPasswordKind = "own" | "words" | "checkWord" | "characters";

/** The settings of one MHFE work: a container is opened only with those it was made with. */
export interface MhfeWork {
  readonly pim: number;
  readonly memoryLevel: number;
}

/** The settings of one encryption that are not secret: everything the command line can carry. */
export interface MhfeEncryptChoices extends MhfeWork {
  /** A container as long as a 12- to 21-word phrase instead of 24 words. */
  readonly sameLength: boolean;
  readonly newPassword: MhfeNewPasswordKind;
  /** 0 for none. */
  readonly repairWords: 0 | MhfeRepairWordCount;
}

/** The length of the original seed phrase, or detection, as `--words` takes it. */
export type MhfeLength = WordCount | "auto";

/** A recovery: its settings and the length, "auto" being mhfe decrypt's default. */
export interface MhfeDecryptChoices {
  readonly work: MhfeWork;
  readonly words: MhfeLength;
}

/**
 * What a rehearsal compares with, as far as the command carries it: an address with its coin and
 * one path (the address itself is typed at mhfe's prompt), the fingerprint (typed there too), the
 * built-in check of a length or detection, or the phrase + passphrase check, which has no option
 * and is chosen from mhfe's list.
 */
export type MhfeCheckReference =
  | { readonly kind: "address"; readonly coin?: MhfeCoin; readonly path?: string }
  | { readonly kind: "fingerprint" }
  | { readonly kind: "builtInCheck"; readonly words: MhfeLength }
  | { readonly kind: "walletCheck" };

/** A rehearsal: its settings and, once chosen, what it compares with. */
export interface MhfeCheckChoices {
  readonly work: MhfeWork;
  readonly reference?: MhfeCheckReference;
}

/** How a rekey confirms the recovered phrase where a choice is asked (mhfe's `--confirm`). */
export type MhfeRekeyConfirmation = "address" | "fingerprint" | "show";

/** A password change: the old container's settings and the new one's, with what is chosen. */
export interface MhfeRekeyChoices {
  readonly old: MhfeWork;
  readonly new: MhfeWork;
  /** Left out while none is chosen: mhfe rekey asks then. */
  readonly words?: MhfeLength;
  /** Left out for the built-in check, which mhfe takes unasked, and while none is chosen. */
  readonly confirm?: MhfeRekeyConfirmation;
  readonly newPassword: MhfeNewPasswordKind;
  /** 0 for none. */
  readonly repairWords: 0 | MhfeRepairWordCount;
}

/** The operation a tab runs, which names it in a refusal of its memory level. */
export type MhfeCommandOperation = "encrypt" | "decrypt" | "check" | "rekey" | "wallets";

/** One memory level a container takes, with its memory as mhfe writes it. */
export interface MhfeMemoryLevel {
  readonly level: number;
  /** "2 GiB", "1536 GiB", "3 TiB". */
  readonly memory: string;
  readonly runsInBrowser: boolean;
}

/** The parts of the package's parameters that bound the commands' settings. */
export type MhfeCommandLimits = Pick<
  MhfeParameters,
  | "maxPim"
  | "maxMemoryLevel"
  | "highestBrowserMemoryLevel"
  | "wordCounts"
  | "builtInCheckWordCounts"
>;

/** What a refusal of the browser's level says the person would do, by operation. */
const OPERATION_TEXT = {
  encrypt: "encrypt",
  decrypt: "recover",
  check: "rehearse",
  rekey: "change the password",
  wallets: "open hidden wallets",
} as const satisfies Record<MhfeCommandOperation, string>;

const ERRORS = new ErrorCatalog("mhfe.command", {
  pim: { kind: "range", text: (most: number) => `The PIM is a whole number from 0 to ${most}.` },
  "memory-level": {
    kind: "range",
    text: (most: number) => `The memory level is a whole number from 0 to ${most}.`,
  },
  "browser-level": {
    kind: "range",
    text: (level: number, highest: number, operation: string) =>
      `A browser runs memory level ${highest} only: ${operation} at level ${level} with the mhfe command.`,
  },
  words: {
    kind: "range",
    text: (lengths: string) => `The word count is one of ${lengths}, or auto.`,
  },
  path: () =>
    "mhfe takes a derivation path such as m/84'/0'/0'/0/5: m, then at most 255 numbers below " +
    "2147483648 after slashes, each hardened with ' or h where needed.",
  // Named by no example: the Dash Community edition names no other coin.
  coin: () => "The coin is one of mhfe's coin identifiers, in lowercase letters and hyphens.",
});

/** The value of `--new-password` for each kind (mhfe's PasswordKind, written in kebab case). */
const NEW_PASSWORD_VALUES = {
  own: "own",
  words: "words",
  checkWord: "check-word",
  characters: "chars",
} as const satisfies Record<MhfeNewPasswordKind, string>;

/**
 * The form of a path that mhfe parses (src/wallet.rs, DerivationPath::from_str): m, then steps of
 * decimal digits after slashes, each hardened with ' or h. This form is what makes the path safe to
 * quote in a shell; mhfe's two limits, a step below 2^31 and at most 255 steps, are checked apart.
 */
const PATH_FORM = /^m(?:\/\d{1,10}['h]?)*$/u;
/** One step of a path: its index, without the hardened mark. */
const PATH_STEP = /\/(\d+)/gu;
/** The form of mhfe's coin identifiers (src/wallet.rs, Coin::id): lowercase words with hyphens. */
const COIN_FORM = /^[a-z]+(?:-[a-z]+)*$/u;

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

/** One option of a command line: its name, and its value where it takes one. */
type CommandOption = readonly [name: string, value?: string | number];

/**
 * The command lines of every MHFE operation, with the levels a container takes and the one rule of
 * when a page offers a command. The limits come from the package's parameters, never from a second
 * list. Options come in the order of mhfe's docs/CLI.md; `--pim` and `--mem` (and a rekey's
 * `--new-pim` and `--new-mem`) are always stated, so that mhfe asks no settings question.
 */
export class MhfeCommand {
  readonly #limits: MhfeCommandLimits;

  constructor(limits: MhfeCommandLimits) {
    this.#limits = {
      maxPim: limits.maxPim,
      maxMemoryLevel: limits.maxMemoryLevel,
      highestBrowserMemoryLevel: limits.highestBrowserMemoryLevel,
      wordCounts: [...limits.wordCounts],
      builtInCheckWordCounts: [...limits.builtInCheckWordCounts],
    };
  }

  /** Whether `error` is one of this module's refusals, whose message a page shows as it is. */
  static refused(error: unknown): error is Error {
    return ERRORS.matches(error, ["pim", "memory-level", "browser-level", "words", "path", "coin"]);
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
   * Whether a page offers the command: for a PIM or a memory level other than 0 in any of the
   * works. At the defaults the browser runs the work in minutes and the command adds nothing. A PIM
   * that is no number (a ticked, empty field) offers it too, where the page then says why no
   * command can be made.
   */
  offered(works: readonly MhfeWork[]): boolean {
    return works.some(({ pim, memoryLevel }) => pim !== 0 || memoryLevel !== 0);
  }

  /** `mhfe encrypt`: `--same-length` only for the same length, since 24 words has no option. */
  encrypt(choices: MhfeEncryptChoices): string {
    return this.#line("encrypt", [
      ...this.#work("", choices),
      ...(choices.sameLength ? [["--same-length"] as const] : []),
      ["--new-password", NEW_PASSWORD_VALUES[choices.newPassword]],
      ["--repair-words", choices.repairWords],
    ]);
  }

  /**
   * `mhfe decrypt`: `--words` only for a stated length, since detection is its default and asks
   * nothing. Hidden wallets take this same command: mhfe 0.8.0 opens them in decrypt, and a command
   * of their own would tell a shell history that hidden wallets were opened.
   */
  decrypt(choices: MhfeDecryptChoices): string {
    return this.#line("decrypt", [
      ...this.#work("", choices.work),
      ...(choices.words === "auto" ? [] : [this.#words(choices.words, this.#limits.wordCounts)]),
    ]);
  }

  /**
   * `mhfe check`: `--address` with an optional `--coin` and `--path`, `--fingerprint`, or `--words`
   * for the built-in check; nothing for the phrase + passphrase check, or while nothing is chosen,
   * where mhfe asks what to compare with from a list.
   */
  check(choices: MhfeCheckChoices): string {
    return this.#line("check", [
      ...this.#work("", choices.work),
      ...this.#reference(choices.reference),
    ]);
  }

  /**
   * `mhfe rekey`: the old container's settings, the length and the confirmation where chosen, then
   * the new container's settings, its password kind and its repair words, which mhfe asks for
   * when they are not given.
   */
  rekey(choices: MhfeRekeyChoices): string {
    return this.#line("rekey", [
      ...this.#work("", choices.old),
      ...(choices.words === undefined ? [] : [this.#words(choices.words, this.#limits.wordCounts)]),
      ...(choices.confirm === undefined ? [] : [["--confirm", choices.confirm] as const]),
      ...this.#work("new-", choices.new),
      ["--new-password", NEW_PASSWORD_VALUES[choices.newPassword]],
      ["--repair-words", choices.repairWords],
    ]);
  }

  /**
   * Refuses, before a page reads any secret, settings it cannot run: a PIM or level that a command
   * refuses, or a level above the browser's (code mhfe.command.browser-level).
   */
  assertRunsInBrowser(work: MhfeWork, operation: MhfeCommandOperation): void {
    this.#check(work);
    this.assertLevelRunsInBrowser(work.memoryLevel, operation);
  }

  /**
   * Refuses, before a page reads any secret, a memory level a command refuses or one above the
   * browser's. A page that never passes the level to the package checks it here: it would
   * otherwise work at level 0 and give another phrase than the container's at its own level.
   */
  assertLevelRunsInBrowser(level: number, operation: MhfeCommandOperation): void {
    if (!inRange(level, this.#limits.maxMemoryLevel))
      throw ERRORS.create("memory-level", [this.#limits.maxMemoryLevel]);
    if (!this.runsInBrowser(level))
      throw ERRORS.create("browser-level", [
        level,
        this.#limits.highestBrowserMemoryLevel,
        OPERATION_TEXT[operation],
      ]);
  }

  /** The options of a reference, as mhfe check takes them. */
  #reference(reference: MhfeCheckReference | undefined): CommandOption[] {
    switch (reference?.kind) {
      case "address":
        return [
          ["--address"],
          ...(reference.coin === undefined ? [] : [this.#coin(reference.coin)]),
          ...(reference.path === undefined ? [] : [this.#path(reference.path)]),
        ];
      case "fingerprint":
        return [["--fingerprint"]];
      case "builtInCheck":
        return [this.#words(reference.words, this.#limits.builtInCheckWordCounts)];
      default:
        return [];
    }
  }

  /** `--pim` and `--mem`, or `--new-pim` and `--new-mem`, after refusing what mhfe refuses. */
  #work(prefix: "" | "new-", work: MhfeWork): CommandOption[] {
    this.#check(work);
    return [
      [`--${prefix}pim`, work.pim],
      [`--${prefix}mem`, work.memoryLevel],
    ];
  }

  /** `--words`: one of `lengths` or auto, refused otherwise. */
  #words(words: MhfeLength, lengths: readonly number[]): CommandOption {
    if (words !== "auto" && !lengths.includes(words))
      throw ERRORS.create("words", [lengths.join(", ")]);
    return ["--words", words];
  }

  /**
   * `--path` in double quotes, as mhfe's docs/CLI.md writes it, only as mhfe parses it: in its
   * form, every step below 2^31 and at most 255 steps (a key keeps its depth in one byte).
   */
  #path(path: string): CommandOption {
    if (!PATH_FORM.test(path)) throw ERRORS.create("path", []);
    const steps = [...path.matchAll(PATH_STEP)].map(([, index]) => Number(index));
    if (steps.length > MAX_BIP32_DEPTH || steps.some((index) => index > MAX_BIP32_INDEX))
      throw ERRORS.create("path", []);
    return ["--path", `"${path}"`];
  }

  /** `--coin`, only in the form of mhfe's identifiers. */
  #coin(coin: string): CommandOption {
    if (!COIN_FORM.test(coin)) throw ERRORS.create("coin", []);
    return ["--coin", coin];
  }

  /** Refuses a PIM or a memory level that mhfe refuses. */
  #check(work: MhfeWork): void {
    if (!inRange(work.pim, this.#limits.maxPim)) throw ERRORS.create("pim", [this.#limits.maxPim]);
    if (!inRange(work.memoryLevel, this.#limits.maxMemoryLevel))
      throw ERRORS.create("memory-level", [this.#limits.maxMemoryLevel]);
  }

  #line(command: string, options: readonly CommandOption[]): string {
    return [`mhfe ${command}`, ...options.map((option) => option.join(" "))].join(" ");
  }
}

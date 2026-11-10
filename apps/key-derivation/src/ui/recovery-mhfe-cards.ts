import { RenderedSecrets } from "./secrets.js";
// Result cards of the MHFE panel: a new container with its state, what to keep and its repair card;
// a repaired container phrase with every change; a recovered or new phrase with its fingerprint;
// and the lines that say what a fingerprint is of.
import { MhfeError, type MhfeSealed } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfeRepaired } from "@ckd/recovery-mhfe-wasm/repair/repair.js";
import { createQrAction } from "@ckd/ui/payment-qr.js";
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";
import { QrActionLifecycle } from "@ckd/ui/qr-action-lifecycle.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { keepLine, listed, sealedNotes } from "./recovery-mhfe-status.js";
import {
  paragraph,
  renderRecoveredMnemonic,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

/** What a master key fingerprint is of; the page shows each kind openly, with this note. */
export type FingerprintOf = "container" | "withoutPassphrase" | "withPassphrase" | "noPassphrase";

/** The two host permissions used by a secret result card. */
type SecretAccess = Pick<RecoveryFeatureContext, "jobs" | "writeClipboard">;

const FINGERPRINT_NOTES: Record<FingerprintOf, string> = {
  container: "of the container itself, not your wallet",
  withoutPassphrase: "if the wallet has no BIP39 passphrase",
  withPassphrase: "with your BIP39 passphrase",
  noPassphrase: "no BIP39 passphrase",
};

export function fingerprintLine(fingerprint: string, of: FingerprintOf): string {
  return `Master key fingerprint ${fingerprint} (${FINGERPRINT_NOTES[of]}). It does not reveal the phrase.`;
}

/** A list of labelled facts, the page form of the command-line tool's summary lines. */
export function factsList(facts: readonly (readonly [string, string])[]): HTMLDListElement {
  const list = document.createElement("dl");
  list.className = "result-facts";
  for (const [label, value] of facts) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    list.append(term, detail);
  }
  return list;
}

/**
 * Show, Copy (only while shown; left out when `copyEnabled` is false) and an optional QR action for a
 * secret shown in `concealed`, which carries the "concealed" class until Show. `copied` is the
 * text Copy and QR give.
 */
function secretActions(
  concealed: HTMLElement,
  copied: string,
  labels: { subject: string; qrHeading?: string; qrDescription?: string },
  access: SecretAccess,
  copyEnabled = true,
): HTMLElement {
  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "danger-outline compact";
  reveal.textContent = `Show ${labels.subject}`;
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "secret-action compact";
  copyButton.textContent = "Copy";
  copyButton.setAttribute("aria-label", `Copy ${labels.subject}`);
  copyButton.disabled = true;
  const permitted = access.jobs.captureReadiness();
  const current = (): boolean => permitted() && concealed.isConnected;
  const revealed = (): boolean => current() && !concealed.classList.contains("concealed");
  const show = (visible: boolean): void => {
    concealed.classList.toggle("concealed", !visible);
    reveal.textContent = `${visible ? "Hide" : "Show"} ${labels.subject}`;
    reveal.setAttribute("aria-pressed", String(visible));
    copyButton.disabled = !visible;
    if (!visible) QrActionLifecycle.hideWithin(actions);
  };
  reveal.addEventListener("click", () => {
    if (current()) show(!revealed());
  });
  RecoverySecretLifecycle.register(reveal, () => show(false));
  copyButton.addEventListener("click", () => {
    if (revealed()) void access.writeClipboard(copied);
  });
  const actions = document.createElement("div");
  actions.className = "share-secret-actions";
  actions.append(reveal);
  if (copyEnabled) actions.append(copyButton);
  if (labels.qrHeading !== undefined)
    actions.append(
      createQrAction(document, copied, labels.subject, copied, {
        heading: labels.qrHeading,
        description: labels.qrDescription ?? "Sensitive payload:",
        ecc: "M",
        current: revealed,
      }),
    );
  return actions;
}

/**
 * Concealed with `output`: shown and hidden with it by the first button of `actions`, its Show.
 * For what shows words of a secret beside it, such as the words a repair changed.
 */
export function concealedWith(
  element: HTMLElement,
  output: HTMLElement,
  actions: HTMLElement,
): void {
  element.classList.add("concealed");
  const reveal = actions.querySelector("button");
  const synchronize = (): void => {
    element.classList.toggle("concealed", output.classList.contains("concealed"));
  };
  reveal?.addEventListener("click", synchronize);
  if (reveal !== null) RecoverySecretLifecycle.onConceal(reveal, synchronize);
}

/**
 * A secret in a concealed field with Show, optional Copy, and an optional QR action.
 * Access ends when the host gate closes or the field leaves the page.
 */
export function concealedValue(
  value: string,
  labels: { subject: string; qrHeading?: string; qrDescription?: string },
  access: SecretAccess,
  copyEnabled = true,
): { output: HTMLTextAreaElement; actions: HTMLElement } {
  const output = document.createElement("textarea");
  output.rows = 4;
  output.readOnly = true;
  output.className = "concealed share-secret";
  output.value = value;
  return { output, actions: secretActions(output, value, labels, access, copyEnabled) };
}

/** The words of a container phrase, which the package always writes out one space apart. */
function wordCount(container: string): number {
  return container.split(" ").length;
}

/** A container phrase in its concealed field, with Show, Copy and its QR code. */
export function concealedContainer(
  container: string,
  qrHeading: string,
  access: SecretAccess,
): { output: HTMLTextAreaElement; actions: HTMLElement } {
  return concealedValue(
    container,
    {
      subject: "container",
      qrHeading,
      qrDescription: `Checksum-valid ${wordCount(container)}-word BIP39 container:`,
    },
    access,
  );
}

/**
 * The card of a new container. It appears as soon as the first 12 rounds are done, so that writing
 * the container down overlaps the check, and its state line says clearly that it is not verified
 * until the check ends. Repair words and what to keep follow only once the check has passed.
 */
export class ContainerCard {
  readonly #card: HTMLElement;
  readonly #state: HTMLElement;
  readonly #access: SecretAccess;

  constructor(
    target: HTMLElement,
    result: { container: string; containerFingerprint: string },
    access: SecretAccess,
    title = "Encrypted MHFE container",
  ) {
    this.#access = access;
    this.#card = document.createElement("article");
    const heading = document.createElement("strong");
    heading.textContent = `${title}, ${wordCount(result.container)} words`;
    this.#state = document.createElement("div");
    this.#show(
      "warning-callout",
      "Not verified yet. MHFE now decrypts the container again to make sure that no memory error or other fault " +
        "changed it. You can start writing it down, but wait for the result before you rely on it.",
    );
    const { output, actions } = concealedContainer(
      result.container,
      "Encrypted MHFE container QR",
      access,
    );
    // A container is itself a BIP39 phrase; its fingerprint lets Decode catch a miscopied word
    // before the long recovery starts.
    const fingerprint = paragraph(
      `${fingerprintLine(result.containerFingerprint, "container")} Note it with the container: Decode ` +
        "shows the fingerprint of the words you type before the recovery starts, so a miscopied word is " +
        "caught at once.",
      "field-note",
    );
    this.#card.append(heading, this.#state, output, actions, fingerprint);
    RenderedSecrets.replace(target, this.#card);
  }

  /**
   * The check passed: what to keep, the repair card, and what comes next. `oldBackup` says what the
   * old container still does after a change of password; `sameLength` whether the container is as
   * long as its phrase.
   */
  seal(sealed: MhfeSealed, texts: SealTexts, sameLength: boolean): void {
    this.#show("success-callout", texts.verified);
    this.#card.append(
      factsList([
        ["Format", sealed.suiteId],
        ["Keep", keepLine(sealed.keep)],
        // How a password made by MHFE was made, never its words.
        ...(texts.password === undefined ? [] : [["Password", texts.password] as const]),
        ...(texts.oldBackup === undefined ? [] : [["Old backup", texts.oldBackup] as const]),
        ["Next", texts.next],
      ]),
      ...sealedNotes(sealed, sameLength).map((note) => paragraph(note, "field-note")),
    );
    if (sealed.repairWords !== null && sealed.repairProfile !== null)
      this.#card.append(repairCard(sealed.repairWords, sealed.repairProfile, this.#access));
  }

  /** The check found that the container does not turn back into the phrase. */
  markWrong(): void {
    this.#show(
      "warning-callout",
      "This container is WRONG: it did not turn back into your phrase. Do not use it; cross it out if you " +
        "wrote it down, and encrypt again.",
    );
  }

  /** The check stopped before it ended, by Cancel or an error. */
  markUnfinished(): void {
    this.#show(
      "warning-callout",
      "The check did not finish: this container is NOT verified. Do not rely on it; encrypt again.",
    );
  }

  #show(className: string, text: string): void {
    this.#state.className = className;
    this.#state.textContent = text;
  }
}

/**
 * Repair words as a card is written: a grid of "i/k word" cells, concealed until shown. Copy and QR
 * give the written form on one line, which the Repair tab reads back.
 */
export function repairCard(words: string, profile: string, access: SecretAccess): HTMLElement {
  const list = words.split(" ");
  const cells = list.map((word, index) => `${index + 1}/${list.length} ${word}`);
  const written = `${profile} ${cells.join(" ")}`;
  const card = document.createElement("section");
  card.className = "mhfe-repair-card";
  const heading = document.createElement("strong");
  heading.textContent = `Repair card ${profile}`;
  const grid = document.createElement("div");
  grid.className = "mhfe-repair-grid concealed share-secret";
  for (const cell of cells) {
    const element = document.createElement("span");
    element.textContent = cell;
    grid.append(element);
  }
  const actions = secretActions(
    grid,
    written,
    { subject: "repair words", qrHeading: "MHFE repair words QR", qrDescription: "Repair card:" },
    access,
  );
  card.append(
    heading,
    grid,
    actions,
    paragraph(
      "Write it on a card as shown, and keep the card apart from the container phrase.",
      "field-note",
    ),
  );
  return card;
}

/** What the card of a sealed container says, besides what the package's result gives. */
export interface SealTexts {
  readonly verified: string;
  readonly next: string;
  readonly oldBackup?: string;
  /** How a password made by MHFE was made, never its words. */
  readonly password?: string;
}

/**
 * The result of an operation that makes a container (Encode, Change password): its
 * card appears with the unverified container (the package's onUnverified), is sealed once the
 * check passed, and is marked wrong or unfinished when the operation fails.
 */
export class NewContainerResult {
  readonly #target: HTMLElement;
  readonly #engine: MhfeEngine;
  readonly #access: SecretAccess;
  readonly #title: string | undefined;
  #card: ContainerCard | undefined;

  constructor(target: HTMLElement, engine: MhfeEngine, access: SecretAccess, title?: string) {
    this.#target = target;
    this.#engine = engine;
    this.#access = access;
    this.#title = title;
  }

  /** Removes the card of an earlier operation. */
  reset(): void {
    this.#card = undefined;
    RenderedSecrets.replace(this.#target);
  }

  /** The package's onUnverified: the container is shown before its check ends. */
  readonly unverified = (result: { container: string; containerFingerprint: string }): void => {
    this.#card = this.#cardFor(result);
  };

  /** The check passed: the card says what to keep and what comes next. */
  async seal(sealed: MhfeSealed, texts: SealTexts, run: MhfeRun): Promise<void> {
    const { sameLengthSuiteId } = await run.step(() => this.#engine.coreParameters());
    this.#card ??= this.#cardFor(sealed);
    this.#card.seal(sealed, texts, sealed.suiteId === sameLengthSuiteId);
  }

  /** The operation failed: a container shown before its check is wrong or not verified. */
  failed(cause: unknown): void {
    if (cause instanceof MhfeError && cause.code === "VERIFICATION_FAILED") this.#card?.markWrong();
    else this.#card?.markUnfinished();
  }

  #cardFor(result: { container: string; containerFingerprint: string }): ContainerCard {
    return new ContainerCard(this.#target, result, this.#access, this.#title);
  }
}

/** "word 3" or "words 3, 5 and 17" of `where`, as the command-line tool names repaired words. */
function repairedWords(positions: readonly number[], where: string): string {
  return `${positions.length === 1 ? "word" : "words"} ${listed(positions)} of ${where}`;
}

/** What was repaired, as the command-line tool's `what_was_repaired` says it. */
export function whatWasRepaired(repaired: MhfeRepaired): string {
  if (repaired.unchanged)
    return "The container phrase and its repair words agree: nothing to repair.";
  const parts: string[] = [];
  if (repaired.containerWords.length > 0)
    parts.push(repairedWords(repaired.containerWords, "the container phrase"));
  if (repaired.cardWords.length > 0) parts.push(repairedWords(repaired.cardWords, "the card"));
  return `Repaired ${parts.join(" and ")}.`;
}

/**
 * A repaired container phrase as the Repair tab and a marked container show it: what was
 * repaired, the container concealed with Show, Copy and QR, and every repaired word with what was
 * read there, container phrase first, concealed with the container: a repair is never silent.
 */
export function repairedContainer(
  repaired: MhfeRepaired,
  access: SecretAccess,
): { said: HTMLElement; output: HTMLTextAreaElement; actions: HTMLElement; changes: HTMLElement } {
  const { output, actions } = concealedContainer(
    repaired.container,
    "Repaired MHFE container QR",
    access,
  );
  const changes = document.createElement("ul");
  changes.className = "mhfe-changes";
  for (const change of repaired.changes) {
    const item = document.createElement("li");
    const where = change.onCard ? "Card" : "Container phrase";
    item.textContent = `${where} word ${change.position} · ${change.read ?? "unreadable"} → ${change.word}`;
    changes.append(item);
  }
  concealedWith(changes, output, actions);
  return {
    said: paragraph(whatWasRepaired(repaired), "success-callout"),
    output,
    actions,
    changes,
  };
}

/** The heading of a container phrase shown as a result: "Repaired container phrase, 24 words". */
export function containerHeading(title: string, container: string): HTMLHeadingElement {
  const heading = document.createElement("h3");
  heading.textContent = `${title}, ${wordCount(container)} words`;
  return heading;
}

/** A recovered or new phrase with its fingerprint line above it. */
export function renderPhrase(
  target: HTMLElement,
  phrase: string,
  fingerprint: string,
  of: FingerprintOf,
  context: RecoveryFeatureContext,
  options: { passphrase?: string; copy?: boolean } = {},
): void {
  target.append(paragraph(fingerprintLine(fingerprint, of), "field-note mhfe-fingerprint"));
  renderRecoveredMnemonic(
    target,
    phrase,
    options.copy === false ? undefined : context.writeClipboard,
    (value) => context.useMnemonicInDeriver(value, options.passphrase),
    context.mnemonicToSeed,
    options.passphrase ?? "",
  );
}

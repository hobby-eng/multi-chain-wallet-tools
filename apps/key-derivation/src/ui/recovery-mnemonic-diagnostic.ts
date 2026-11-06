import { diagnoseMnemonic } from "@ckd/core/bip39.js";
import { MnemonicFingerprint } from "@ckd/core/mnemonic-fingerprint.js";
import { requireQueryElement } from "@ckd/ui/dom.js";
import type { RecoveryFeatureContext } from "./recovery-workspace-shared.js";
import type { RecoverySourceTarget } from "./recovery-source-link.js";
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";
import { SeedDiagnosticView } from "./seed-diagnostic-view.js";
import { Bip39InputText } from "./bip39-input-text.js";
import { SELF_TEST_NOT_PASSED } from "./crypto-self-test-gate.js";

type DiagnosticContext = Pick<
  RecoveryFeatureContext,
  "jobs" | "linkedValue" | "linkedSourceRevealed" | "mnemonicToSeed"
>;

/** Owns the diagnostic's native bindings, disclosure and readiness for one recovery source field. */
export class RecoveryMnemonicDiagnostic {
  readonly #context: DiagnosticContext;
  readonly #target: Exclude<RecoverySourceTarget, "matcher">;
  readonly #input: HTMLTextAreaElement;
  readonly #passphrase: HTMLInputElement | null;
  readonly #root: HTMLElement;
  #revision = 0;

  /** Bind native events; neither a closed gate nor concealment may start a fingerprint KDF. */
  constructor(
    context: DiagnosticContext,
    target: Exclude<RecoverySourceTarget, "matcher">,
    inputSelector: string,
    revealButtonSelector: string,
    passphraseSelector?: string,
  ) {
    this.#context = context;
    this.#target = target;
    this.#input = requireQueryElement<HTMLTextAreaElement>(document, inputSelector);
    const reveal = requireQueryElement<HTMLButtonElement>(document, revealButtonSelector);
    this.#passphrase =
      passphraseSelector === undefined
        ? null
        : requireQueryElement<HTMLInputElement>(document, passphraseSelector);
    this.#root = RecoveryMnemonicDiagnostic.create();
    this.#input.after(this.#root);
    this.#input.addEventListener("input", this.#update);
    this.#passphrase?.addEventListener("input", this.#update);
    reveal.addEventListener("click", () => queueMicrotask(this.#update));
    RecoverySecretLifecycle.onConceal(reveal, this.#update);
    for (const type of ["recovery-source-change", "recovery-source-visibility"])
      document.addEventListener(type, (event) => {
        if (event instanceof CustomEvent && event.detail === target) this.#update();
      });
    context.jobs.onChange((change) => {
      if (change === "ready") this.#update();
    });
    this.#update();
  }

  readonly #update = (): void => {
    const revision = ++this.#revision;
    const context = this.#context;
    if (!context.jobs.ready) {
      SeedDiagnosticView.unavailable(document, this.#root, SELF_TEST_NOT_PASSED);
      return;
    }
    const ready = context.jobs.captureReadiness();
    const current = (): boolean => ready() && revision === this.#revision;
    let linked: ReturnType<DiagnosticContext["linkedValue"]>;
    try {
      linked = context.linkedValue(this.#target);
    } catch {
      if (!current()) return;
      SeedDiagnosticView.unavailable(
        document,
        this.#root,
        "The linked recovery source is unavailable. Choose it again to inspect it.",
      );
      return;
    }
    if (!current()) return;
    const revealed =
      linked === null
        ? !this.#input.classList.contains("concealed")
        : context.linkedSourceRevealed(this.#target);
    RecoveryMnemonicDiagnostic.render(
      this.#root,
      linked?.mnemonic ?? this.#input.value,
      revealed ? (linked?.passphrase ?? this.#passphrase?.value ?? "") : "",
      revealed,
      context.mnemonicToSeed,
      current,
    );
  };

  /** A new native panel with one retained, non-secret heading. */
  static create(): HTMLElement {
    const diagnostic = document.createElement("section");
    diagnostic.className = "seed-diagnostic recovered-seed-diagnostic";
    const heading = document.createElement("div");
    heading.className = "seed-diagnostic-head";
    const title = document.createElement("h3");
    title.textContent = "Seed Diagnostic";
    const scope = document.createElement("span");
    scope.textContent = "Local · no network";
    heading.append(title, scope);
    diagnostic.append(heading);
    return diagnostic;
  }

  /** Inspect bounded phrase input; seed bytes end before rendering, including failed rendering. */
  static render(
    root: HTMLElement,
    mnemonic: string,
    passphrase: string,
    revealed: boolean,
    mnemonicToSeed: RecoveryFeatureContext["mnemonicToSeed"],
    current: () => boolean = () => true,
  ): void {
    if (!current()) return;
    try {
      using report = diagnoseMnemonic(mnemonic);
      let fingerprint: string | null = null;
      if (report.checksumValid && revealed && current()) {
        fingerprint = MnemonicFingerprint.fromPhrase(report.normalized, passphrase, mnemonicToSeed);
      }
      if (!current()) return;
      SeedDiagnosticView.render(root.ownerDocument, root, report, fingerprint, revealed);
    } catch (cause) {
      if (!current()) return;
      const message = Bip39InputText.of(cause);
      if (message === undefined) throw cause;
      SeedDiagnosticView.unavailable(root.ownerDocument, root, message);
    }
  }

  /** Compatibility installer for each recovery feature's source controls. */
  static install(
    context: DiagnosticContext,
    target: Exclude<RecoverySourceTarget, "matcher">,
    inputSelector: string,
    revealButtonSelector: string,
    passphraseSelector?: string,
  ): void {
    new RecoveryMnemonicDiagnostic(
      context,
      target,
      inputSelector,
      revealButtonSelector,
      passphraseSelector,
    );
  }
}

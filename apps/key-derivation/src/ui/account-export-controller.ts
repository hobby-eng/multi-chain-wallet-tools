import type { DerivationResult } from "@ckd/core/types.js";
import {
  AccountExportChoice,
  AccountExportError,
  type AccountExportErrorCode,
} from "@ckd/export/account-export.js";

interface AccountExportDependencies {
  document: Document;
  buttons: Readonly<Record<string, HTMLButtonElement>>;
  formatSelector?: string;
  result(): DerivationResult | null;
  secretsRevealed(): boolean;
  /** Handles native failures and cancellation itself, as ClipboardAction.copy does. */
  copyText(button: HTMLButtonElement, text: string, containsSecret: boolean): Promise<void>;
  downloadText(text: string, filename: string, mimeType: string): void;
  showError(message: string): void;
  showStatus(message: string): void;
}

const FAILURE_TEXT = "Unable to prepare account export.";
const ERROR_TEXT: Readonly<Record<AccountExportErrorCode, string>> = {
  "account-export.action": "Choose a supported account export action.",
  "account-export.format": "Choose a supported account export format.",
  "account-export.disclosure": "Show sensitive values before exporting private descriptors.",
  "account-export.descriptors": "Expected generated receive and change descriptors.",
};

/** One browser binding for main and child account exports; all admission and conversion is shared. */
export class AccountExportController {
  readonly #dependencies: AccountExportDependencies;

  constructor(dependencies: AccountExportDependencies) {
    this.#dependencies = dependencies;
    for (const [action, button] of Object.entries(dependencies.buttons)) this.bind(button, action);
  }

  /** Bind a native action attribute; unknown values are refused when the person requests it. */
  bind(button: HTMLButtonElement, action: unknown): void {
    button.addEventListener("click", () => this.#export(button, action));
  }

  #export(button: HTMLButtonElement, action: unknown): void {
    const dependencies = this.#dependencies;
    let text = "";
    try {
      const format = dependencies.document.querySelector<HTMLSelectElement>(
        dependencies.formatSelector ?? "#account-export-format",
      )?.value;
      const choice = new AccountExportChoice(action, format);
      const bundle = dependencies.result()?.accountDescriptors;
      if (bundle === undefined) return;
      text = choice.text(bundle, dependencies.secretsRevealed());
      if (choice.download) {
        const filename = choice.filename(bundle.fileStem);
        dependencies.downloadText(text, filename, "text/plain");
        dependencies.showStatus(
          choice.containsSecret
            ? `Created ${filename}. Contains unencrypted account private keys.`
            : `Created ${filename}. Public account data; cannot spend.`,
        );
      } else void dependencies.copyText(button, text, choice.containsSecret);
    } catch (cause) {
      dependencies.showError(AccountExportController.#message(cause));
    } finally {
      // Native edges own their temporary string views; this binding retains none across a wait.
      text = "";
    }
  }

  /** Both account panels use the library's permission and one refusal label before a click. */
  static updateButton(
    button: HTMLButtonElement,
    action: unknown,
    available: boolean,
    revealed: boolean,
  ): void {
    try {
      const permitted = AccountExportChoice.permits(action, revealed);
      button.disabled = !available || !permitted;
      button.title = permitted ? "" : ERROR_TEXT["account-export.disclosure"];
    } catch (cause) {
      button.disabled = true;
      button.title = AccountExportController.#message(cause);
    }
  }

  static #message(cause: unknown): string {
    return cause instanceof AccountExportError ? ERROR_TEXT[cause.code] : FAILURE_TEXT;
  }

  /** Compatibility installer used by the main Deriver. */
  static install(dependencies: AccountExportDependencies): void {
    new AccountExportController(dependencies);
  }
}

/** Compatibility entry sharing the same binding as child-wallet exports. */
export const installAccountExportController =
  AccountExportController.install.bind(AccountExportController);

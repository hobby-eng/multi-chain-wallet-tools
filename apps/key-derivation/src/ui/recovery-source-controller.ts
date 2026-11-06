import {
  RecoverySourceRoute,
  RecoverySourceRouteError,
  type RecoverySourceProviders,
  type RecoverySourceReference,
  type RecoverySourceRouteErrorCode,
  type RecoverySourceTarget,
} from "@ckd/recovery/recovery-source.js";

interface RecoverySourceControllerOptions extends RecoverySourceProviders {
  document: Document;
  open: (reference: RecoverySourceReference, target: RecoverySourceTarget) => void;
  showError: (message: string) => void;
}

const ROUTE_MESSAGES: Record<RecoverySourceRouteErrorCode, string> = {
  "recovery.source.kind": "Select the original phrase or a BIP85 child phrase.",
  "recovery.source.target": "Select a supported recovery workflow.",
  "recovery.source.child-missing":
    "Derive a BIP39 child phrase before sending it to Recover & Back Up.",
  "recovery.source.original-phrase": "Enter a checksum-valid English BIP39 recovery phrase first.",
};

/** Routes native actions through library admission, without an OS clipboard copy. */
export class RecoverySourceController {
  readonly #options: RecoverySourceControllerOptions;

  /** Installs the native event edge; library refusal and native failure receive input-free text. */
  constructor(options: RecoverySourceControllerOptions) {
    this.#options = options;
    options.document.addEventListener("click", (event) => this.#click(event.target));
  }

  #click(target: EventTarget | null): void {
    const button =
      target instanceof Element
        ? target.closest<HTMLButtonElement>("[data-recovery-source]")
        : null;
    if (button === null) return;
    try {
      const route = new RecoverySourceRoute(
        button.dataset.recoverySource,
        button.dataset.recoveryTarget,
      );
      this.#options.open(route.resolve(this.#options), route.target);
      button.closest("details")?.removeAttribute("open");
    } catch (cause) {
      this.#options.showError(
        cause instanceof RecoverySourceRouteError
          ? ROUTE_MESSAGES[cause.code]
          : "The recovery source could not be opened.",
      );
    }
  }
}

/** Compatibility installer for existing Deriver compositions. */
export function installRecoverySourceController(options: RecoverySourceControllerOptions): void {
  new RecoverySourceController(options);
}

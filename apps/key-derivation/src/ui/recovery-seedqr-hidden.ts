// The SeedQR tab's hidden form, the part of the tab that needs
// MnemoCode and comes only with it (recovery-seedqr-hidden-selection.ts): Encode can keep a
// Standard SeedQR as the hidden record of MnemoCode's hidden QR behind a decoy that ordinary
// scanners show, and Decode's image import reads such a record before the visible text.
import { HiddenSeedQr, readHiddenSeedQr } from "@ckd/recovery-backup/hidden-seedqr.js";
import { HIDDEN_SEEDQR_CHECK } from "@ckd/recovery-backup/hidden-seedqr-self-test.js";
import { HIDDEN_QR_NOTE_WITHOUT_DATES } from "@ckd/recovery-backup/mnemocode-hidden-qr.js";
import type { HiddenQrReader } from "@ckd/ui/qr-image-import.js";
import type { InputRevision } from "./recovery-input-revision.js";
import { MnemoCodeDownload } from "./recovery-mnemocode-download.js";
import { mnemoCodeSelfTest } from "./recovery-mnemocode-self-test.js";
import { DecoyFields } from "./recovery-seedqr-decoy-fields.js";
import { paragraph, required } from "./recovery-workspace-shared.js";

/** Encode's hidden SeedQR: the choice of QR form, the decoy, and the one PNG shown. */
export class HiddenSeedQrEncode {
  readonly #hidden = required<HTMLInputElement>("#seedqr-qr-form-hidden");
  readonly #format = required<HTMLSelectElement>("#seedqr-format");
  readonly #compact = required<HTMLOptionElement>('#seedqr-format option[value="compact"]');
  readonly #decoy = required<HTMLElement>("#seedqr-decoy");
  readonly #fields = new DecoyFields();
  #shown: HiddenSeedQr | undefined;

  /** Installs the choice and the decoy's fields; `inputs` counts their edits as the tab's. */
  constructor(inputs: InputRevision) {
    required<HTMLElement>("#seedqr-hidden-note").textContent = HIDDEN_QR_NOTE_WITHOUT_DATES;
    const form = required<HTMLElement>("#seedqr-qr-form");
    inputs.watch(form);
    inputs.watch(this.#decoy);
    form.addEventListener("change", () => this.#synchronize());
    this.#synchronize();
    mnemoCodeSelfTest.addCheck(HIDDEN_SEEDQR_CHECK);
  }

  /** Whether Encode makes a SeedQR hidden in a decoy QR rather than an ordinary one. */
  get chosen(): boolean {
    return this.#hidden.checked;
  }

  /**
   * Shows the Standard SeedQR of `mnemonic` hidden behind the decoy in `result`, with Save PNG
   * while `current` holds and the record is shown. Refuses as the decoy and HiddenSeedQr refuse:
   * a field left empty or malformed, or a decoy too long to share one QR with the SeedQR.
   */
  show(result: HTMLElement, mnemonic: string, current: () => boolean): void {
    this.wipe();
    const kind = this.#fields.kind;
    const shown = new HiddenSeedQr(mnemonic, this.#fields.text());
    this.#shown = shown;
    const card = document.createElement("article");
    const title = document.createElement("strong");
    title.textContent = "Standard SeedQR in a decoy QR";
    const record = paragraph(shown.record, "concealed share-secret");
    const save = document.createElement("button");
    save.type = "button";
    save.className = "secret-action compact secret-copy-action";
    save.textContent = "Save PNG";
    save.setAttribute("aria-label", "Save the decoy QR as PNG");
    save.disabled = true;
    save.addEventListener("click", () => {
      if (
        this.#shown === shown &&
        current() &&
        card.isConnected &&
        !record.classList.contains("concealed")
      )
        MnemoCodeDownload.bytes(shown.png, "image/png", `${kind.id}-qr.png`);
    });
    const actions = document.createElement("div");
    actions.className = "share-secret-actions";
    actions.append(save);
    card.append(
      title,
      paragraph(`Decoy: ${kind.label}. Ordinary scanners show:`, "field-note"),
      paragraph(shown.visible, "decoy-text"),
      paragraph("Hidden record, the Standard SeedQR:", "field-note"),
      record,
      actions,
    );
    result.append(card);
  }

  /** Wipes the PNG shown, as far as the runtime allows; its card goes with the tab's result. */
  wipe(): void {
    this.#shown?.wipe();
    this.#shown = undefined;
  }

  /** Only a Standard SeedQR is hidden: CompactSeedQR closes while the hidden form is chosen. */
  #synchronize(): void {
    this.#decoy.hidden = !this.chosen;
    this.#compact.disabled = this.chosen;
    if (this.chosen) this.#format.value = "standard";
  }
}

/** What the SeedQR tab takes from its hidden form. */
export interface SeedQrHiddenForm {
  /** Decode's image import: the Standard SeedQR digits that a PNG keeps hidden. */
  readonly readHidden: HiddenQrReader;
  /** Installs Encode's part; `inputs` is the tab's count of edits. */
  install(inputs: InputRevision): HiddenSeedQrEncode;
}

/** The hidden form of the SeedQR tab. */
export const hiddenSeedQr: SeedQrHiddenForm = {
  readHidden: readHiddenSeedQr,
  install: (inputs) => new HiddenSeedQrEncode(inputs),
};

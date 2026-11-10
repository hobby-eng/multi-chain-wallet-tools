// The Photo or MP3 tab: MnemoCode's steganography task, "Hide or open contents in JPEG and MP3
// files" (MnemoCode docs/STEGANOGRAPHY.md). Encode, Re-encode and a cross-stitch pattern hand their
// result over to it, as MnemoCode's menu offers "A photo or MP3 file" among their destinations;
// what it opens goes on to Decode.
import { STEGO_EXACT_COPIES } from "@ckd/recovery-backup/mnemocode-stego-words.js";
import { MnemoCodeStegoHide } from "./recovery-mnemocode-stego-hide.js";
import { MnemoCodeStegoOpen } from "./recovery-mnemocode-stego-open.js";
import { required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";

/** The event that carries a result to hide from another tab. */
const HIDE_EVENT = "mnemocode-stego-hide";

/** What another tab hands over: a backup record, or a text such as a legend line. */
export interface StegoHandover {
  readonly kind: "backup" | "message";
  readonly text: string;
}

/** Offers `contents` to the Photo or MP3 tab, which shows them; false in a build without it. */
export function offerToStego(contents: StegoHandover): boolean {
  const event = new CustomEvent<StegoHandover>(HIDE_EVENT, { detail: contents, cancelable: true });
  return !document.dispatchEvent(event);
}

/** A button that hands `contents` over, as the other result actions are: shown with the result. */
export function stegoHandoverButton(contents: () => StegoHandover): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secret-action compact secret-copy-action";
  button.textContent = "Hide in a photo or MP3";
  button.disabled = true;
  button.addEventListener("click", () => offerToStego(contents()));
  return button;
}

export class MnemoCodeStegoTab {
  constructor(context: RecoveryFeatureContext) {
    required<HTMLElement>("#mnemocode-stego-copies-note").textContent = STEGO_EXACT_COPIES;
    const hide = new MnemoCodeStegoHide(context);
    new MnemoCodeStegoOpen(context);
    const tasks = [
      ...document.querySelectorAll<HTMLInputElement>('input[name="mnemocode-stego-task"]'),
    ];
    const show = (): void => {
      const task = tasks.find((radio) => radio.checked)?.value ?? "hide";
      required<HTMLElement>("#mnemocode-stego-hide").hidden = task !== "hide";
      required<HTMLElement>("#mnemocode-stego-open").hidden = task !== "open";
    };
    for (const radio of tasks) radio.addEventListener("change", show);
    show();
    document.addEventListener(HIDE_EVENT, (event) => {
      if (!(event instanceof CustomEvent)) return;
      event.preventDefault();
      for (const radio of tasks) radio.checked = radio.value === "hide";
      show();
      hide.take(event.detail as StegoHandover);
      required<HTMLButtonElement>(
        '[data-operation-tab][aria-controls="mnemocode-stego-panel"]',
      ).click();
    });
  }
}

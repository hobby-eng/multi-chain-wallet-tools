// The card of a new MHFE container. It appears as soon as the first 12 rounds are done, so that
// writing the container down overlaps the check, and its state line says clearly that it is not
// verified until the check ends.
import { createQrAction } from "@ckd/ui/payment-qr.js";
import { paragraph } from "./recovery-workspace-shared.js";

export class ContainerCard {
  readonly #state: HTMLElement;
  readonly #keepNote: HTMLParagraphElement;

  constructor(
    target: HTMLElement,
    container: string,
    containerWords: number,
    fingerprint: string,
    copy: (value: string) => Promise<void>,
  ) {
    const card = document.createElement("article");
    const title = document.createElement("strong");
    title.textContent = `Encrypted ${containerWords}-word MHFE container`;
    this.#state = document.createElement("div");
    this.#show(
      "warning-callout",
      "Not verified yet. MHFE now decrypts the container again to make sure that no memory error or other fault " +
        "changed it. You can start writing it down, but wait for the result before you rely on it.",
    );
    // A container is itself a BIP39 phrase; its fingerprint lets Decode catch a miscopied word
    // before the long recovery starts.
    const fingerprintNote = paragraph(
      `Container fingerprint ${fingerprint} (BIP32 master key fingerprint of these words). Note it with the ` +
        "container: Decode shows the fingerprint of the words you type before the recovery starts, so a " +
        "miscopied word is caught at once.",
      "field-note",
    );
    this.#keepNote = paragraph("", "field-note");
    const { output, actions } = concealedContainer(container, containerWords, copy);
    card.append(title, this.#state, output, actions, fingerprintNote, this.#keepNote);
    target.replaceChildren(card);
  }

  /** What to keep besides the container; set once the suite is known. */
  set keepNote(text: string) {
    this.#keepNote.textContent = text;
  }

  markVerified(): void {
    this.#show("success-callout", "Verified: the container turns back into your original phrase.");
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

/** The container in a concealed field, with Show, Copy (only while shown) and QR. */
function concealedContainer(
  container: string,
  containerWords: number,
  copy: (value: string) => Promise<void>,
): { output: HTMLTextAreaElement; actions: HTMLElement } {
  const output = document.createElement("textarea");
  output.rows = 4;
  output.readOnly = true;
  output.className = "concealed share-secret";
  output.value = container;
  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "danger-outline compact";
  reveal.textContent = "Show container";
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "secret-action compact";
  copyButton.textContent = "Copy";
  copyButton.setAttribute("aria-label", "Copy encrypted container");
  copyButton.disabled = true;
  reveal.addEventListener("click", () => {
    const visible = output.classList.contains("concealed");
    output.classList.toggle("concealed", !visible);
    reveal.textContent = visible ? "Hide container" : "Show container";
    reveal.setAttribute("aria-pressed", String(visible));
    copyButton.disabled = !visible;
  });
  copyButton.addEventListener("click", () => void copy(container));
  const qr = createQrAction(document, container, "MHFE encrypted container", container, {
    heading: "Encrypted MHFE container QR",
    description: `Checksum-valid ${containerWords}-word BIP39 container:`,
    ecc: "M",
  });
  const actions = document.createElement("div");
  actions.className = "share-secret-actions";
  actions.append(reveal, copyButton, qr);
  return { output, actions };
}

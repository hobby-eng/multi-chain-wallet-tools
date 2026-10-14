/** Places a recovered wallet's captured factors in the primary Deriver fields together. */
export class RecoveryDeriverHandoff {
  readonly #document: Document;
  readonly #openDeriver: () => void;

  constructor(document: Document, openDeriver: () => void) {
    this.#document = document;
    this.#openDeriver = openDeriver;
  }

  use(mnemonic: string, passphrase = ""): void {
    const mnemonicInput = this.#document.querySelector<HTMLTextAreaElement>("#mnemonic");
    const passphraseInput = this.#document.querySelector<HTMLInputElement>("#passphrase");
    if (mnemonicInput === null || passphraseInput === null) {
      throw new Error("The primary recovery source fields are unavailable.");
    }
    this.#openDeriver();
    mnemonicInput.value = mnemonic;
    passphraseInput.value = passphrase;
    // Observers must see the complete wallet, even during the first input event.
    mnemonicInput.dispatchEvent(new Event("input", { bubbles: true }));
    passphraseInput.dispatchEvent(new Event("input", { bubbles: true }));
    mnemonicInput.focus({ preventScroll: true });
    this.#document
      .querySelector<HTMLElement>(".input-panel")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

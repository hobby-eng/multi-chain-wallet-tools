// "Import a MnemoCode candidate list" in the seed batch panel: shows this page's Scanner key, opens
// a list file with it or with the list passphrase that its header asks for, and says how many
// candidates the scan checks in place of the typed phrases. It only translates the page; the list
// itself is CandidateListImport's.
import { FileChoice } from "@ckd/ui/file-choice.js";
import type { CandidateListImport, CandidateSource } from "./candidate-list-import.js";

/** The button that chooses the list file; Open then opens it. */
const CHOOSE_LIST_FILE = "Choose the list file";

const PASSPHRASE_NOTES = {
  none: "no BIP39 passphrase",
  list: "the BIP39 passphrase stored in the list",
  records: "the BIP39 passphrase of each candidate, stored in the list",
} as const;

export class CandidateListPanel {
  readonly #ListImport: typeof CandidateListImport;
  readonly #lists: CandidateListImport;
  readonly #onChange: () => void;
  readonly #key: HTMLInputElement;
  readonly #keyNote: HTMLElement;
  readonly #file: FileChoice;
  readonly #passphraseField: HTMLElement;
  readonly #passphrase: HTMLInputElement;
  readonly #plaintext: HTMLInputElement;
  readonly #remove: HTMLButtonElement;
  readonly #showKeyButton: HTMLButtonElement;
  readonly #openButton: HTMLButtonElement;
  readonly #status: HTMLElement;
  /** The phrases typed by hand, hidden while a list stands in for them. */
  readonly #typed: HTMLElement;
  #loaded = false;
  /** Whether the startup self-test has passed and no scan runs; until then nothing opens. */
  #enabled = false;

  /**
   * `ListImport` is the seed-discovery capability of the build; `onChange` runs when a list is
   * opened or removed, so that the estimate follows it.
   */
  constructor(
    ListImport: typeof CandidateListImport,
    required: <T extends HTMLElement>(selector: string) => T,
    onChange: () => void,
  ) {
    this.#ListImport = ListImport;
    this.#lists = new ListImport();
    this.#onChange = onChange;
    this.#key = required<HTMLInputElement>("#candidate-list-key");
    this.#keyNote = required<HTMLElement>("#candidate-list-key-note");
    this.#file = new FileChoice(
      required<HTMLInputElement>("#candidate-list-file"),
      CHOOSE_LIST_FILE,
      {
        showName: true,
      },
    );
    this.#passphraseField = required<HTMLElement>("#candidate-list-passphrase-field");
    this.#passphrase = required<HTMLInputElement>("#candidate-list-passphrase");
    this.#plaintext = required<HTMLInputElement>("#candidate-list-plaintext");
    this.#plaintext.addEventListener("change", () => void this.#fileChosen());
    this.#remove = required<HTMLButtonElement>("#candidate-list-remove");
    this.#status = required<HTMLElement>("#candidate-list-status");
    this.#typed = required<HTMLElement>("#batch-input .batch-grid");
    this.#showKeyButton = required<HTMLButtonElement>("#candidate-list-show-key");
    this.#showKeyButton.addEventListener("click", () => void this.#showKey());
    this.#file.onChoose(() => void this.#fileChosen());
    this.#openButton = required<HTMLButtonElement>("#candidate-list-open");
    this.#openButton.addEventListener("click", () => void this.#open());
    this.#remove.addEventListener("click", () => this.clear());
    this.setEnabled(false);
  }

  /**
   * Opens the panel once the startup self-test has passed and while no scan runs; closed, it shows
   * no key and opens no list. A list already opened stays for the scan that uses it.
   */
  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    for (const control of [
      this.#showKeyButton,
      this.#file,
      this.#passphrase,
      this.#plaintext,
      this.#openButton,
    ])
      control.disabled = !enabled;
  }

  /** After a failed self-test: the list and the key of this copy of the page are dropped. */
  close(): void {
    this.setEnabled(false);
    this.clear();
    this.#key.value = "";
    this.#key.hidden = true;
    this.#keyNote.hidden = true;
  }

  /** The opened list, which the scan checks in place of the typed phrases; none without one. */
  get source(): CandidateSource | undefined {
    return this.#loaded ? this.#lists : undefined;
  }

  /** Removes the list and wipes its candidates, as clearing the input does. */
  clear(): void {
    this.#plaintext.checked = false;
    this.#file.clear();
    this.#discard();
  }

  async #showKey(): Promise<void> {
    if (!this.#enabled) return;
    try {
      this.#key.value = await this.#lists.recipient();
      this.#key.hidden = false;
      this.#keyNote.hidden = false;
    } catch (cause) {
      this.#status.textContent = cause instanceof Error ? cause.message : String(cause);
    }
  }

  /** Removes the opened list, and any list still being read or opened, from the page. */
  #discard(): void {
    this.#lists.clear();
    this.#passphrase.value = "";
    this.#passphraseField.hidden = true;
    this.#show(false, "");
  }

  /** A list saved under a passphrase asks for it before it is opened. */
  async #fileChosen(): Promise<void> {
    // Another file replaces the list opened from the one before, and an open still running.
    this.#discard();
    const file = this.#file.file;
    if (file === undefined || !this.#enabled) return;
    // Clear or another file may come while the header is read: then this file decides nothing.
    const stillChosen = (): boolean => this.#file.file === file;
    try {
      if (this.#plaintext.checked) {
        this.#ListImport.inspectPlaintext(file);
        return;
      }
      const lock = await this.#ListImport.inspect(file);
      if (stillChosen()) this.#passphraseField.hidden = lock !== "passphrase";
    } catch (cause) {
      if (stillChosen())
        this.#status.textContent = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async #open(): Promise<void> {
    if (!this.#enabled) return;
    const file = this.#file.file;
    if (file === undefined) {
      // As opening another list does, this removes the list before it.
      this.#lists.clear();
      this.#show(false, "Choose the candidate list file first.");
      return;
    }
    const passphrase = this.#passphraseField.hidden ? undefined : this.#passphrase.value;
    this.#status.textContent = "Opening the list…";
    // One list opens at a time; Remove, Clear or another file during it means nothing is kept.
    this.#openButton.disabled = true;
    try {
      const opened = await (this.#plaintext.checked
        ? this.#lists.openPlaintext(file, true)
        : this.#lists.open(file, passphrase));
      // Dropped by Remove, Clear or another file, which have already reset the page.
      if (opened === undefined) return;
      this.#passphrase.value = "";
      this.#show(
        true,
        `${opened.count.toLocaleString("en-US")} candidate${opened.count === 1 ? "" : "s"} from the list, with ${PASSPHRASE_NOTES[opened.passphrases]}. They are checked in place of the phrases typed above.`,
      );
    } catch (cause) {
      this.#show(false, cause instanceof Error ? cause.message : String(cause));
    } finally {
      this.#openButton.disabled = !this.#enabled;
    }
  }

  #show(loaded: boolean, status: string): void {
    this.#loaded = loaded;
    this.#typed.hidden = loaded;
    this.#remove.hidden = !loaded;
    this.#status.textContent = status;
    this.#onChange();
  }
}

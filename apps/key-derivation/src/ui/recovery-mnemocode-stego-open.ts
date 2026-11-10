// Open hidden contents, as MnemoCode's stego task does it: a file, or the files of a set, and the
// container password, which opens its own record, the original message or a decoy, and never says
// which. A backup record or a text goes on to Decode as MnemoCode's Decode reads a carrier; other
// bytes are saved as a file.
import type { StegoOpened, StegoProgress } from "@ckd/recovery-backup/mnemocode-stego.js";
import { STEGO_NO_RECORD, stegoProgressLine } from "@ckd/recovery-backup/mnemocode-stego-words.js";
import type { MnemoCodeSearchRequest } from "../workers/mnemocode-search-worker.js";
import { MnemoCodeDownload } from "./recovery-mnemocode-download.js";
import {
  clearShownResult,
  clearWithPage,
  failureText,
  SectionRevision,
  startSectionJob,
} from "./recovery-mnemocode-section-run.js";
import { readStegoCarriers } from "./recovery-mnemocode-stego-files.js";
import { MnemoCodeWorkerJob } from "./recovery-mnemocode-worker-job.js";
import {
  paragraph,
  renderSensitiveShares,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

declare const __MNEMOCODE_SEARCH_WORKER_SOURCE__: string;

const PREFIX = "mnemocode-stego-open";
const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true });

/** The open section of the Photo or MP3 tab. */
export class MnemoCodeStegoOpen {
  readonly #context: RecoveryFeatureContext;
  readonly #carriers = required<HTMLInputElement>(`#${PREFIX}-carriers`);
  readonly #password = required<HTMLInputElement>(`#${PREFIX}-password`);
  readonly #status = required<HTMLElement>(`#${PREFIX}-status`);
  readonly #result = required<HTMLElement>(`#${PREFIX}-result`);
  readonly #toggle = required<HTMLButtonElement>("#toggle-mnemocode-stego-opened");
  readonly #job: MnemoCodeWorkerJob<MnemoCodeSearchRequest, StegoOpened, StegoProgress>;
  /** Opened bytes shown, wiped with the result. */
  #opened: Uint8Array | undefined;
  readonly #revision = new SectionRevision();

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    this.#job = new MnemoCodeWorkerJob(__MNEMOCODE_SEARCH_WORKER_SOURCE__, {
      button: required<HTMLButtonElement>(`#${PREFIX}-run`),
      cancel: required<HTMLButtonElement>(`#${PREFIX}-stop`),
      status: this.#status,
    });
    for (const field of [this.#carriers, this.#password])
      for (const type of ["input", "change"]) field.addEventListener(type, () => this.#clear());
    clearWithPage(() => this.#clear(), [this.#carriers, this.#password]);
    required<HTMLButtonElement>(`#${PREFIX}-run`).addEventListener("click", () => this.#start());
  }

  #clear(): void {
    this.#revision.next();
    this.#job.revise();
    this.#opened?.fill(0);
    this.#opened = undefined;
    clearShownResult(this.#status, this.#result, this.#toggle);
  }

  #start(): void {
    startSectionJob({
      label: "Opening a photo or MP3",
      context: this.#context,
      revision: this.#revision,
      status: this.#status,
      clear: () => this.#clear(),
      work: (current) => this.#open(current),
      say: (cause) => failureText(cause, "MnemoCode could not open the file."),
    });
  }

  async #open(current: () => boolean): Promise<void> {
    const files = [...(this.#carriers.files ?? [])];
    if (files.length === 0) throw new Error("Choose a JPEG or MP3 file with hidden data.");
    if (this.#password.value === "") throw new Error("Type the container password.");
    const password = this.#password.value;
    const carriers = await readStegoCarriers(files, this.#status, current);
    if (carriers === undefined) return;
    const done = await this.#job.run(
      { type: "stego-open", carriers, password },
      (progress) => stegoProgressLine(progress, carriers.length),
      "Opening the hidden record…",
      carriers.map((carrier) => carrier.bytes.buffer),
    );
    if (done === undefined) return;
    if (!current()) {
      if (done.outcome.kind === "opaque") done.outcome.bytes.fill(0);
      return;
    }
    this.#show(done.outcome, done.elapsed, files.length);
  }

  #show(opened: StegoOpened, elapsed: string, files: number): void {
    if (opened.kind === "no-record") {
      this.#status.classList.add("warning");
      this.#status.textContent =
        files > 1 && opened.files.length < files
          ? `${STEGO_NO_RECORD} Files without a record for it: ${opened.files.join(", ")}.`
          : STEGO_NO_RECORD;
      return;
    }
    if (opened.kind === "too-few") {
      this.#status.classList.add("warning");
      this.#status.textContent = `These ${opened.available} compatible files need ${opened.needed} files to recover the contents.`;
      return;
    }
    this.#status.textContent = `Opened in ${elapsed}.`;
    if (opened.kind === "backup") {
      this.#showText(opened.record, "MnemoCode backup record", "backup-record.mnc");
      return;
    }
    this.#opened = opened.bytes;
    let text: string | undefined;
    try {
      text = STRICT_UTF8.decode(opened.bytes);
    } catch (cause) {
      if (!(cause instanceof TypeError)) throw cause;
    }
    if (text !== undefined) {
      this.#showText(text, "Hidden message", "hidden-message.txt");
      return;
    }
    this.#result.append(
      paragraph(
        `The hidden contents are ${opened.bytes.byteLength} bytes, not text.`,
        "field-note",
      ),
    );
    const save = document.createElement("button");
    save.type = "button";
    save.className = "secondary compact";
    save.textContent = "Save as a file";
    save.addEventListener("click", () => {
      if (this.#opened !== undefined)
        MnemoCodeDownload.bytes(this.#opened, "application/octet-stream", "hidden-contents.bin");
    });
    this.#result.append(save);
  }

  /** A record or a text: shown concealed, copied, saved, or read on in Decode. */
  #showText(text: string, label: string, fileName: string): void {
    const actions = renderSensitiveShares(
      this.#result,
      [text],
      this.#context.writeClipboard,
      [label],
      [],
      () => this.#context.jobs.ready,
    );
    const button = (caption: string, run: () => void): HTMLButtonElement => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "secret-action compact secret-copy-action";
      element.textContent = caption;
      element.disabled = true;
      element.addEventListener("click", run);
      return element;
    };
    actions.append(
      button("Decode it", () => readInTab(text, "#mnemocode-input", "mnemocode-decode-panel")),
      button("Re-encode it", () =>
        readInTab(text, "#mnemocode-reencode-input", "mnemocode-reencode-panel"),
      ),
      button("Save", () => MnemoCodeDownload.text(this.#context, text, fileName, "text/plain")),
    );
    this.#result.append(
      paragraph(
        "Decode and Re-encode read a backup record or a legend line with its dates, as from any record.",
        "field-note",
      ),
    );
  }
}

/**
 * Puts `text` into the field of another tab and shows that tab, as MnemoCode's Decode and Re-encode
 * read a record from a carrier.
 */
function readInTab(text: string, field: string, panel: string): void {
  const input = required<HTMLTextAreaElement>(field);
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  required<HTMLButtonElement>(`[data-operation-tab][aria-controls="${panel}"]`).click();
}

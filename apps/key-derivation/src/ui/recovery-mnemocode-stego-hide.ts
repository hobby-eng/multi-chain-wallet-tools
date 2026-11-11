// Hide new contents, as MnemoCode's stego task does it (MnemoCode docs/STEGANOGRAPHY.md): the
// carrier files, what to hide, an optional decoy under its own password, the container password,
// then the guaranteed space at every density for those files and passwords, a density where the
// contents fit, and a new file whose saved bytes MnemoCode has opened again with every password.
// MnemoCode's worker does all the work: Argon2id takes a blocking 128 MiB step.
import { mnemocode } from "@ckd/recovery-backup/mnemocode-engine.js";
import {
  stegoContentBytes,
  type StegoAnalysis,
  type StegoCarrier,
  type StegoContents,
  type StegoHidden,
  type StegoProgress,
} from "@ckd/recovery-backup/mnemocode-stego.js";
import {
  STEGO_CAPACITY_HINT,
  STEGO_CAPACITY_TITLE,
  STEGO_CLEAN_SOURCE,
  STEGO_DECOY_PASSWORDS_DIFFER,
  STEGO_DENSITY_QUESTION,
  STEGO_KEEP_SOURCE_PRIVATE,
  STEGO_PASSWORDS_DIFFER,
  STEGO_UNAVAILABLE_LEVELS,
  stegoBytesText,
  stegoNoticeText,
  stegoPairAccepted,
  stegoPairRefusal,
  stegoProgressLine,
} from "@ckd/recovery-backup/mnemocode-stego-words.js";
import type { MnemoCodeSearchRequest } from "../workers/mnemocode-search-worker.js";
import { MnemoCodeDownload } from "./recovery-mnemocode-download.js";
import {
  clearWithPage,
  failureText,
  SectionRevision,
  startSectionJob,
} from "./recovery-mnemocode-section-run.js";
import { readStegoCarriers } from "./recovery-mnemocode-stego-files.js";
import { MnemoCodeWorkerJob } from "./recovery-mnemocode-worker-job.js";
import {
  installSecretToggle,
  paragraph,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

declare const __MNEMOCODE_SEARCH_WORKER_SOURCE__: string;

const PREFIX = "mnemocode-stego";
const ENCODER = new TextEncoder();

type Kind = "backup" | "message" | "file";

/** What a kind of contents is called above its field. */
const TEXT_LABELS: Readonly<Record<Exclude<Kind, "file">, string>> = {
  backup: "MNC1 backup record",
  message: "Message to hide",
};

/** The hide section of the Photo or MP3 tab. */
export class MnemoCodeStegoHide {
  readonly #context: RecoveryFeatureContext;
  readonly #carriers = required<HTMLInputElement>(`#${PREFIX}-carriers`);
  readonly #quorumRow = required<HTMLElement>(`#${PREFIX}-quorum-row`);
  readonly #quorum = required<HTMLInputElement>(`#${PREFIX}-quorum`);
  readonly #text = required<HTMLTextAreaElement>(`#${PREFIX}-text`);
  readonly #textRow = required<HTMLElement>(`#${PREFIX}-text-row`);
  readonly #textLabel = required<HTMLElement>(`#${PREFIX}-text-label`);
  readonly #file = required<HTMLInputElement>(`#${PREFIX}-file`);
  readonly #fileRow = required<HTMLElement>(`#${PREFIX}-file-row`);
  readonly #size = required<HTMLElement>(`#${PREFIX}-size`);
  readonly #decoyRow = required<HTMLElement>(`#${PREFIX}-decoy-row`);
  readonly #decoyEnabled = required<HTMLInputElement>(`#${PREFIX}-decoy-enabled`);
  readonly #decoyBlock = required<HTMLElement>(`#${PREFIX}-decoy`);
  readonly #decoyText = required<HTMLTextAreaElement>(`#${PREFIX}-decoy-text`);
  readonly #decoySize = required<HTMLElement>(`#${PREFIX}-decoy-size`);
  readonly #decoyPassword = required<HTMLInputElement>(`#${PREFIX}-decoy-password`);
  readonly #decoyAgain = required<HTMLInputElement>(`#${PREFIX}-decoy-password-again`);
  readonly #password = required<HTMLInputElement>(`#${PREFIX}-password`);
  readonly #again = required<HTMLInputElement>(`#${PREFIX}-password-again`);
  readonly #hideButton = required<HTMLButtonElement>(`#${PREFIX}-hide-run`);
  readonly #status = required<HTMLElement>(`#${PREFIX}-hide-status`);
  readonly #capacity = required<HTMLElement>(`#${PREFIX}-capacity`);
  readonly #result = required<HTMLElement>(`#${PREFIX}-hide-result`);
  readonly #analyzeJob: MnemoCodeWorkerJob<MnemoCodeSearchRequest, StegoAnalysis, StegoProgress>;
  readonly #hideJob: MnemoCodeWorkerJob<MnemoCodeSearchRequest, StegoHidden, StegoProgress>;
  /** The space of the files and passwords as typed; undefined until checked, or after a change. */
  #analysis: StegoAnalysis | undefined;
  /** The files written, until the inputs change. */
  #written: StegoHidden | undefined;
  /** Counts the changes of the inputs, which reading the files may straddle. */
  readonly #revision = new SectionRevision();

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    const elements = {
      cancel: required<HTMLButtonElement>(`#${PREFIX}-hide-stop`),
      status: this.#status,
    };
    this.#analyzeJob = new MnemoCodeWorkerJob(__MNEMOCODE_SEARCH_WORKER_SOURCE__, {
      ...elements,
      button: required<HTMLButtonElement>(`#${PREFIX}-analyze`),
    });
    this.#hideJob = new MnemoCodeWorkerJob(__MNEMOCODE_SEARCH_WORKER_SOURCE__, {
      ...elements,
      button: this.#hideButton,
    });
    required<HTMLElement>(`#${PREFIX}-clean-note`).textContent = STEGO_CLEAN_SOURCE;
    installSecretToggle(`#toggle-${PREFIX}-text`, `#${PREFIX}-text`, "Show", "Hide", "contents");
    installSecretToggle(
      `#toggle-${PREFIX}-decoy-text`,
      `#${PREFIX}-decoy-text`,
      "Show",
      "Hide",
      "decoy",
    );
    // A change of the files or a password asks for the space again; contents only re-check fits.
    for (const field of [
      this.#carriers,
      this.#quorum,
      this.#decoyEnabled,
      this.#decoyPassword,
      this.#password,
    ])
      for (const type of ["input", "change"]) field.addEventListener(type, () => this.#changed());
    for (const field of [this.#text, this.#decoyText, this.#file, this.#again, this.#decoyAgain])
      for (const type of ["input", "change"])
        field.addEventListener(type, () => this.#contentsChanged());
    for (const radio of this.#kinds())
      radio.addEventListener("change", () => this.#contentsChanged());
    clearWithPage(() => {
      this.#clear();
      this.#decoyEnabled.checked = this.#decoyEnabled.defaultChecked;
      this.#show();
    }, [
      this.#carriers,
      this.#text,
      this.#file,
      this.#decoyText,
      this.#password,
      this.#again,
      this.#decoyPassword,
      this.#decoyAgain,
    ]);
    required<HTMLButtonElement>(`#${PREFIX}-analyze`).addEventListener("click", () =>
      this.#start("Checking the space", (current) => this.#analyze(current)),
    );
    this.#hideButton.addEventListener("click", () =>
      this.#start("Hiding in a photo or MP3", (current) => this.#hide(current)),
    );
    this.#show();
  }

  /** Takes contents handed over by another tab: a backup record, or a legend line as text. */
  take(contents: { readonly kind: "backup" | "message"; readonly text: string }): void {
    for (const radio of this.#kinds()) radio.checked = radio.value === contents.kind;
    this.#text.value = contents.text;
    this.#contentsChanged();
  }

  #kinds(): HTMLInputElement[] {
    return [...document.querySelectorAll<HTMLInputElement>(`input[name="${PREFIX}-kind"]`)];
  }

  #kind(): Kind {
    return (this.#kinds().find((radio) => radio.checked)?.value as Kind | undefined) ?? "backup";
  }

  #files(): File[] {
    return [...(this.#carriers.files ?? [])];
  }

  /** Shows the fields of the chosen kind, the quorum of a set and the decoy of one file. */
  #show(): void {
    const kind = this.#kind();
    this.#textRow.hidden = kind === "file";
    this.#fileRow.hidden = kind !== "file";
    if (kind !== "file") this.#textLabel.textContent = TEXT_LABELS[kind];
    const count = this.#files().length;
    this.#quorumRow.hidden = count < 2;
    this.#quorum.max = String(Math.max(2, count));
    this.#decoyRow.hidden = count > 1;
    this.#decoyBlock.hidden = count > 1 || !this.#decoyEnabled.checked;
    this.#size.textContent = this.#sizeLine();
    this.#decoySize.textContent = this.#decoyLine();
    const parameters = mnemocodeParameters();
    if (parameters !== undefined)
      required<HTMLElement>(`#${PREFIX}-password-note`).textContent =
        `At least ${parameters.passwordMinBytes} bytes after Unicode normalization; case and spaces matter. ` +
        "Several independently chosen random words are best.";
  }

  #sizeLine(): string {
    const kind = this.#kind();
    if (kind === "file") {
      const file = this.#file.files?.item(0);
      return file === null || file === undefined ? "" : `${file.size} bytes`;
    }
    if (kind === "backup") return "";
    return `${ENCODER.encode(this.#text.value).byteLength} bytes`;
  }

  #decoyLine(): string {
    return this.#decoyText.value === ""
      ? ""
      : `${ENCODER.encode(this.#decoyText.value).byteLength} bytes`;
  }

  #decoyWanted(): boolean {
    return this.#decoyEnabled.checked && this.#files().length === 1;
  }

  /** The files or a password changed: the space is asked again, and a written file is dropped. */
  #changed(): void {
    this.#clear();
    this.#show();
  }

  /** Only what is hidden changed: the space stands, and the densities where it fits are shown. */
  #contentsChanged(): void {
    this.#revision.next();
    this.#hideJob.revise();
    this.#dropWritten();
    this.#show();
    this.#renderCapacity();
  }

  #clear(): void {
    this.#revision.next();
    this.#analyzeJob.revise();
    this.#hideJob.revise();
    this.#analysis = undefined;
    this.#dropWritten();
    this.#capacity.replaceChildren();
    this.#hideButton.disabled = true;
    this.#status.classList.remove("warning");
    this.#status.textContent = "";
  }

  #dropWritten(): void {
    this.#written = undefined;
    this.#result.replaceChildren();
  }

  #start(label: string, work: (current: () => boolean) => Promise<void>): void {
    startSectionJob({
      context: this.#context,
      status: this.#status,
      revision: this.#revision,
      label,
      work,
      say: (cause) => failureText(cause, "MnemoCode could not finish the work."),
    });
  }

  /** The carrier files read, after MnemoCode admitted their sizes before any is read. */
  #readCarriers(current: () => boolean): Promise<StegoCarrier[] | undefined> {
    const files = this.#files();
    if (files.length === 0) throw new Error("Choose a JPEG or MP3 carrier file.");
    return readStegoCarriers(files, this.#status, current);
  }

  /** The container password, typed twice alike. */
  #passwordTyped(): string {
    if (this.#password.value === "") throw new Error("Type the container password.");
    if (this.#password.value !== this.#again.value) throw new Error(STEGO_PASSWORDS_DIFFER);
    return this.#password.value;
  }

  #decoyPasswordTyped(): string | undefined {
    if (!this.#decoyWanted()) return undefined;
    if (this.#decoyPassword.value === "") throw new Error("Type the decoy password.");
    if (this.#decoyPassword.value !== this.#decoyAgain.value)
      throw new Error(STEGO_DECOY_PASSWORDS_DIFFER);
    return this.#decoyPassword.value;
  }

  async #analyze(current: () => boolean): Promise<void> {
    const password = this.#passwordTyped();
    const decoyPassword = this.#decoyPasswordTyped();
    const carriers = await this.#readCarriers(current);
    if (carriers === undefined) return;
    const done = await this.#analyzeJob.run(
      {
        type: "stego-analyze",
        carriers,
        password,
        ...(decoyPassword === undefined ? {} : { decoyPassword }),
      },
      (progress) => stegoProgressLine(progress, carriers.length),
      "Analyzing available space…",
      carriers.map((carrier) => carrier.bytes.buffer),
    );
    if (done === undefined || !current()) return;
    const minimum = mnemocodeParameters()?.passwordDifferencePercent ?? 0;
    if (done.outcome.pair !== undefined && !done.outcome.pair.accepted) {
      this.#status.classList.add("warning");
      this.#status.textContent = stegoPairRefusal(done.outcome.pair, minimum);
      return;
    }
    this.#analysis = done.outcome;
    this.#status.textContent =
      done.outcome.pair === undefined
        ? `Space checked in ${done.elapsed}.`
        : `Space checked in ${done.elapsed}. ${stegoPairAccepted(done.outcome.pair, minimum)}`;
    this.#renderCapacity();
  }

  /** What is hidden as typed or chosen; a file is read after MnemoCode admitted its size. */
  async #contents(): Promise<StegoContents> {
    const kind = this.#kind();
    if (kind === "backup") {
      const record = this.#text.value.trim();
      if (record === "") throw new Error("Paste the MNC1 backup record.");
      return { kind: "backup", record };
    }
    if (kind === "message") {
      if (this.#text.value === "") throw new Error("Type the message to hide.");
      return { kind: "opaque", bytes: ENCODER.encode(this.#text.value) };
    }
    const file = this.#file.files?.item(0) ?? null;
    if (file === null) throw new Error("Choose the file to hide.");
    mnemocode().checkStegoMessageSize(file.size);
    return { kind: "opaque", bytes: new Uint8Array(await file.arrayBuffer()) };
  }

  /** The bytes the contents take, as far as the page knows them before reading a file. */
  #neededBytes(): number | undefined {
    const kind = this.#kind();
    const own =
      kind === "file"
        ? this.#file.files?.item(0)?.size
        : kind === "backup"
          ? this.#text.value.trim() === ""
            ? undefined
            : stegoContentBytes({ kind: "backup", record: this.#text.value })
          : ENCODER.encode(this.#text.value).byteLength;
    if (own === undefined) return undefined;
    return this.#decoyWanted()
      ? Math.max(own, ENCODER.encode(this.#decoyText.value).byteLength)
      : own;
  }

  /** The table of the space at every density, a choice where the contents fit. */
  #renderCapacity(): void {
    this.#capacity.replaceChildren();
    const analysis = this.#analysis;
    if (analysis === undefined) {
      this.#hideButton.disabled = true;
      return;
    }
    const files = this.#files().length;
    const title =
      files > 1
        ? STEGO_CAPACITY_TITLE.set
        : this.#decoyWanted()
          ? STEGO_CAPACITY_TITLE.decoy
          : STEGO_CAPACITY_TITLE.one;
    const needed = this.#neededBytes();
    const fieldset = document.createElement("fieldset");
    fieldset.className = "choice-group";
    const legend = document.createElement("legend");
    legend.textContent = STEGO_DENSITY_QUESTION;
    fieldset.append(legend, paragraph(title, "field-note"));
    let chosen = false;
    let unavailable = false;
    for (const row of analysis.rows) {
      const fits = row.bytes > 0 && (needed === undefined || needed <= row.bytes);
      unavailable ||= !fits;
      const label = document.createElement("label");
      label.className = "checkbox-row";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `${PREFIX}-density`;
      radio.value = row.density;
      radio.disabled = !fits;
      if (fits && !chosen) {
        radio.checked = true;
        chosen = true;
      }
      const note = document.createElement("span");
      note.className = "answer-note";
      note.textContent = stegoBytesText(row.bytes);
      label.append(radio, ` ${row.density} `, note);
      fieldset.append(label);
    }
    if (unavailable) fieldset.append(paragraph(STEGO_UNAVAILABLE_LEVELS, "field-note"));
    fieldset.append(paragraph(STEGO_CAPACITY_HINT, "field-note"));
    for (const [index, notices] of analysis.notices.entries())
      for (const code of notices)
        fieldset.append(
          paragraph(
            files > 1 ? `File ${index + 1}: ${stegoNoticeText(code)}` : stegoNoticeText(code),
            "field-note",
          ),
        );
    this.#capacity.append(fieldset);
    this.#hideButton.disabled = !chosen;
  }

  #density(): string | undefined {
    return this.#capacity.querySelector<HTMLInputElement>(`input[name="${PREFIX}-density"]:checked`)
      ?.value;
  }

  async #hide(current: () => boolean): Promise<void> {
    const density = this.#density();
    if (this.#analysis === undefined || density === undefined)
      throw new Error("Check the space first, then choose a density.");
    const password = this.#passwordTyped();
    const decoyPassword = this.#decoyPasswordTyped();
    const contents = await this.#contents();
    const decoy =
      decoyPassword === undefined
        ? undefined
        : {
            password: decoyPassword,
            contents: { kind: "opaque", bytes: ENCODER.encode(this.#decoyText.value) } as const,
          };
    if (decoy !== undefined && decoy.contents.bytes.byteLength === 0)
      throw new Error("Type the decoy to hide.");
    const carriers = await this.#readCarriers(current);
    if (carriers === undefined) return;
    const quorum = Number(this.#quorum.value);
    if (
      carriers.length > 1 &&
      (!Number.isInteger(quorum) || quorum < 2 || quorum > carriers.length)
    )
      throw new Error("Choose a quorum from 2 to the selected file count.");
    const done = await this.#hideJob.run(
      {
        type: "stego-hide",
        carriers,
        password,
        contents,
        ...(decoy === undefined ? {} : { decoy }),
        density,
        ...(carriers.length > 1 ? { quorum } : {}),
      },
      (progress) => stegoProgressLine(progress, carriers.length),
      "Writing and verifying the hidden record…",
      carriers.map((carrier) => carrier.bytes.buffer),
    );
    if (contents.kind === "opaque") contents.bytes.fill(0);
    decoy?.contents.bytes.fill(0);
    if (done === undefined || !current()) return;
    this.#written = done.outcome;
    this.#status.textContent = `Hidden in ${done.elapsed}.`;
    this.#renderWritten(done.outcome, carriers.length > 1);
  }

  #renderWritten(hidden: StegoHidden, set: boolean): void {
    this.#result.replaceChildren(
      paragraph(
        set
          ? "Every saved carrier passed exact password-authenticated readback. Save every file of the set."
          : "The saved file passed exact password-authenticated readback with every password.",
        "field-note",
      ),
    );
    // Once a carrier is saved, its source must stay private; the notice stays while this result does,
    // until an input changes or the next hide replaces it.
    const keepSourcePrivate = paragraph(STEGO_KEEP_SOURCE_PRIVATE, "warning-callout");
    keepSourcePrivate.hidden = true;
    hidden.files.forEach((file, index) => {
      const name = set ? setMemberName(index, file.name) : file.name;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary compact";
      button.textContent = `Save ${name}`;
      button.addEventListener("click", () => {
        if (this.#written !== hidden) return;
        MnemoCodeDownload.blob(file.blob, name);
        keepSourcePrivate.hidden = false;
      });
      this.#result.append(button);
      for (const code of file.notices)
        this.#result.append(paragraph(`${name}: ${stegoNoticeText(code)}`, "field-note"));
    });
    this.#result.append(
      paragraph(
        "A browser download is not a check of the disk: open the saved files again before you rely on them.",
        "field-note",
      ),
      keepSourcePrivate,
    );
  }
}

/** The parameters of MnemoCode's steganography, once MnemoCode is loaded. */
function mnemocodeParameters():
  { readonly passwordMinBytes: number; readonly passwordDifferencePercent: number } | undefined {
  try {
    using parameters = mnemocode().stegoParameters();
    return {
      passwordMinBytes: parameters.passwordMinBytes,
      passwordDifferencePercent: parameters.passwordDifferencePercent,
    };
  } catch {
    return undefined;
  }
}

/** A set's file name as MnemoCode names it: carrier-01.jpg, with the extension of its source. */
function setMemberName(index: number, source: string): string {
  const extension = /\.(jpe?g|mp3)$/iu.exec(source)?.[0]?.toLowerCase() ?? "";
  return `carrier-${String(index + 1).padStart(2, "0")}${extension}`;
}

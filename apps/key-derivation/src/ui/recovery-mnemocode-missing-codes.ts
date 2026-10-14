// Decode's codes marked with ?, as MnemoCode's decode searches them: the page reads the codes
// (BackupReading, MissingCodes), offers the ways of MissingCodesSearch with their words (the
// encoded fingerprint, the wallet with the dates, every candidate listed where they are few), and
// runs the chosen way in the search worker. The rules, sizes, questions and texts are MnemoCode's.
import type { MissingCodesOutcome, SearchQuestion } from "@ckd/recovery-backup/mnemocode-search.js";
import {
  readMnemoCodeBackup,
  type MnemoCodeFormat,
  type MnemoCodeMode,
  type MnemoCodePhraseWords,
} from "@ckd/recovery-backup/mnemocode.js";
import type { EncodedFormat } from "../../../../packages/recovery-mnemocode/source/core/encoded-backup.js";
import type { MaskingMode } from "../../../../packages/recovery-mnemocode/source/core/types.js";
import {
  MISSING_CODES_TEXTS,
  MissingCodesSearch,
  type MissingCodesWay,
} from "../../../../packages/recovery-mnemocode/source/core/missing-codes-search.js";
import type { MnemoCodeSearchRequest } from "../workers/mnemocode-search-worker.js";
import { WalletEvidenceField } from "./recovery-mnemocode-evidence.js";
import { MnemoCodeWorkerJob } from "./recovery-mnemocode-worker-job.js";
import { MnemoCodeSearchSettingsFields } from "./recovery-mnemocode-search-settings.js";
import { required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";
import { FieldEdits } from "./field-edits.js";

declare const __MNEMOCODE_SEARCH_WORKER_SOURCE__: string;

const PREFIX = "mnemocode-decode";
/** The codes of one search: as typed, in their form and mode, and the search for their ways. */
interface MarkedCodes {
  readonly text: string;
  readonly format: EncodedFormat;
  readonly mode: MaskingMode;
  /** Keep the admitted length: printed backups may end with decoy codes. */
  readonly words: MnemoCodePhraseWords;
  readonly search: MissingCodesSearch;
}

/**
 * What a search found that the Decode tab shows, found codes or a list, with the form and mode of
 * the codes, which decode the codes found; a search that found none says so itself.
 */
export type MissingCodesFound = Extract<MissingCodesOutcome, { kind: "found" | "list" }> & {
  readonly format: EncodedFormat;
  readonly mode: MaskingMode;
  /** BIP39 factor captured by the successful wallet request, never reread at handoff. */
  readonly passphrase?: string;
};

export class MnemoCodeMissingCodes {
  readonly #context: RecoveryFeatureContext;
  readonly #block = required<HTMLElement>(`#${PREFIX}-missing`);
  readonly #summary = required<HTMLElement>(`#${PREFIX}-missing-summary`);
  readonly #ways = required<HTMLElement>(`#${PREFIX}-missing-way-list`);
  readonly #fingerprintField = required<HTMLElement>(`#${PREFIX}-encoded-fingerprint-field`);
  readonly #fingerprint = required<HTMLInputElement>(`#${PREFIX}-encoded-fingerprint`);
  readonly #wallet = required<HTMLElement>(`#${PREFIX}-missing-wallet`);
  readonly #datesNote = required<HTMLElement>(`#${PREFIX}-missing-dates-note`);
  readonly #status = required<HTMLElement>(`#${PREFIX}-missing-status`);
  readonly #evidence = new WalletEvidenceField(PREFIX);
  readonly #settings = new MnemoCodeSearchSettingsFields(PREFIX, "missing-codes");
  readonly #job = new MnemoCodeWorkerJob<
    MnemoCodeSearchRequest,
    MissingCodesOutcome | SearchQuestion
  >(__MNEMOCODE_SEARCH_WORKER_SOURCE__, {
    button: required<HTMLButtonElement>(`#${PREFIX}-missing-search`),
    cancel: required<HTMLButtonElement>(`#${PREFIX}-missing-stop`),
    status: this.#status,
  });
  readonly #dates: () => string;
  readonly #found: (found: MissingCodesFound) => void;
  readonly #capture: () => () => boolean;
  #codes: MarkedCodes | undefined;

  /**
   * `dates` reads Decode's dates field, where a ? stands for a forgotten digit for the wallet way;
   * `found` shows what a search found; `capture` revokes older Decode actions and owns publication.
   */
  constructor(
    context: RecoveryFeatureContext,
    dates: () => string,
    found: (found: MissingCodesFound) => void,
    capture: () => () => boolean,
  ) {
    this.#context = context;
    this.#dates = dates;
    this.#found = found;
    this.#capture = capture;
    // Without the wallet way the question has no "It cannot".
    this.#evidence.optional = false;
    const edits = new FieldEdits();
    for (const type of ["input", "change"])
      this.#block.addEventListener(type, (event) => {
        if (edits.isNew(event)) this.#job.revise();
      });
    required<HTMLButtonElement>(`#${PREFIX}-missing-search`).addEventListener("click", () =>
      this.#start(),
    );
  }

  /**
   * Shows the search for `text` when it marks codes that cannot be read, read in the selected form
   * and mode unless a record names its own; false when it marks none. Throws why such codes
   * cannot be read, such as several forms that fit.
   */
  offer(
    text: string,
    format: MnemoCodeFormat | "auto",
    mode: MnemoCodeMode,
    words?: MnemoCodePhraseWords,
  ): boolean {
    const reading = readMnemoCodeBackup(text, false, words);
    if (!reading.marked) {
      this.hide();
      return false;
    }
    const formats = reading.markedFormats(format === "auto" ? undefined : format);
    if (formats.length > 1)
      throw new Error(
        "These marked codes fit several representations: choose theirs in Representation, then press the button again.",
      );
    const codes = reading.missingCodes(formats[0]!).withMode(reading.mode(mode) ?? mode);
    // The page's own search object only tells the ways; the worker searches with its own.
    const search = new MissingCodesSearch(codes, () => "");
    this.#codes = { text, format: codes.format, mode: codes.mode, words, search };
    this.#summary.textContent = search.many
      ? `${search.unreadable} ${MISSING_CODES_TEXTS.many}`
      : search.unreadable;
    this.#renderWays(search);
    this.#datesNote.textContent = search.needsDates
      ? "Type the dates in the Seedshift dates field above. For the wallet, a ? stands for each forgotten digit, and the dates are searched with the codes."
      : "";
    this.#datesNote.hidden = !search.needsDates;
    this.#status.textContent = "";
    this.#job.revise();
    this.#block.hidden = false;
    return true;
  }

  hide(): void {
    this.#codes = undefined;
    this.#block.hidden = true;
    this.#job.revise();
  }

  /** An external Decode field or its page lifetime changed while this request was pending. */
  revise(): void {
    this.#job.revise();
  }

  #renderWays(search: MissingCodesSearch): void {
    this.#ways.replaceChildren(
      ...search.ways.map(({ way, label, note }) => {
        const row = document.createElement("label");
        row.className = "checkbox-row";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `${PREFIX}-missing-way`;
        radio.value = way;
        radio.addEventListener("change", () => this.#showWay());
        const hint = document.createElement("span");
        hint.className = "answer-note";
        hint.textContent = note;
        row.append(radio, ` ${label} `, hint);
        return row;
      }),
    );
    this.#showWay();
  }

  #way(): MissingCodesWay | undefined {
    return this.#ways.querySelector<HTMLInputElement>("input:checked")?.value as
      MissingCodesWay | undefined;
  }

  #showWay(): void {
    const way = this.#way();
    this.#fingerprintField.hidden = way !== "encoded";
    this.#wallet.hidden = way !== "wallet";
    this.#settings.available = way === "encoded" || way === "wallet";
  }

  #start(): void {
    const codes = this.#codes;
    if (codes === undefined) return;
    const current = this.#capture();
    this.#status.classList.remove("warning");
    void this.#context.jobs
      .runHeavy("A MnemoCode search of codes", () => this.#search(codes, current))
      .catch((cause: unknown) => this.#job.fail(cause, "The search failed.", current));
  }

  async #search(codes: MarkedCodes, current: () => boolean): Promise<void> {
    const way = this.#way();
    if (way === undefined) throw new Error(MISSING_CODES_TEXTS.question);
    const wallet = way === "wallet" ? this.#evidence.request() : undefined;
    if (way === "wallet" && wallet === undefined)
      throw new Error("Choose how MnemoCode can recognise the wallet.");
    const request = {
      type: "missing-codes" as const,
      text: codes.text,
      format: codes.format,
      mode: codes.mode,
      ...(codes.words === undefined ? {} : { words: codes.words }),
      ...(way === "list" ? {} : this.#settings.request),
      way,
      ...(way === "encoded" ? { encodedFingerprint: this.#fingerprint.value } : {}),
      ...(wallet === undefined ? {} : { wallet }),
      ...(codes.search.needsDates ? { dates: this.#dates() } : {}),
    };
    const inputs = JSON.stringify(request);
    const done = await this.#job.run(
      { ...request, confirmed: this.#job.confirmed(inputs) },
      (progress, elapsed) =>
        `Checked ${progress.checked.toLocaleString("en-US")} of about ${progress.total.toLocaleString("en-US")}; ${progress.found} found · ${elapsed}`,
      "Searching the codes…",
    );
    // The Decode owner also covers edits between the worker's verdict and this continuation.
    if (done === undefined || !current()) return;
    const { outcome, elapsed } = done;
    if ("question" in outcome) {
      this.#job.ask(`${outcome.question} This page must stay open.`, inputs);
      return;
    }
    this.#job.revise();
    if (outcome.kind === "none" || outcome.kind === "several") {
      this.#status.classList.add("warning");
      this.#status.textContent = outcome.message;
      return;
    }
    this.#status.textContent = `Search complete in ${elapsed}.`;
    this.#found({
      ...outcome,
      format: codes.format,
      mode: codes.mode,
      ...(wallet === undefined ? {} : { passphrase: wallet.passphrase }),
    });
  }
}

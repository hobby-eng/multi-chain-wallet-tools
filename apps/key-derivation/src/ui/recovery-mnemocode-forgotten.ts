// The Forgotten tab of the MnemoCode panel, as MnemoCode's command line asks "What is forgotten?":
// a word of the seed phrase (or several, or a missing one), a digit of a date of a Seedshift
// phrase, or a code of a Shamir share (recovery-mnemocode-shares.ts). Word and date searches run
// in a worker of their own, compare each candidate with the wallet if the person can say how, and
// can write a candidate list for the Discovery Scanner. Sizes come from MnemoCode's library before
// anything starts.
import {
  LEGACY_REPLACEMENTS_NOTE,
  type MnemoCodeWordSearchKind,
  type SearchOutcome,
  type SearchProgress,
  type SearchQuestion,
} from "@ckd/recovery-backup/mnemocode-search.js";
import { recoverMnemoCodeLegacyLastWords } from "@ckd/recovery-backup/mnemocode.js";
import { WordCandidateSearch } from "../../../../packages/recovery-mnemocode/source/core/candidates.js";
import { BackupReading } from "../../../../packages/recovery-mnemocode/source/core/backup-reading.js";
import { PHRASE_WORDS } from "../../../../packages/recovery-mnemocode/source/core/masking.js";
import { WordList } from "../../../../packages/recovery-mnemocode/source/core/word-hints.js";
import { walletNeeded } from "../../../../packages/recovery-mnemocode/source/core/date-search.js";
import type { MnemoCodeSearchRequest } from "../workers/mnemocode-search-worker.js";
import { renderCandidates } from "./recovery-mnemocode-candidates.js";
import { WalletEvidenceField } from "./recovery-mnemocode-evidence.js";
import { CandidateListField } from "./recovery-mnemocode-list.js";
import { MnemoCodeForgottenDates } from "./recovery-mnemocode-forgotten-dates.js";
import { renderMissingWordCandidates } from "./recovery-mnemocode-results.js";
import { MnemoCodeWorkerJob } from "./recovery-mnemocode-worker-job.js";
import {
  installFieldImports,
  installSecretToggle,
  paragraph,
  PHRASE_FILE_IMPORT,
  required,
  type RecoveryFeatureContext,
  RESERVED_NOTE_LINE,
} from "./recovery-workspace-shared.js";
import { FieldEdits } from "./field-edits.js";
import { attachMnemoCodeWordHints } from "./recovery-mnemocode-word-hints.js";

type Forgotten = "word" | "code" | "date" | "share";
type Where = "places" | "missing" | "legacy";

/** Pause after typing before the size of a search is worked out. */
const SIZE_DELAY_MS = 150;
const PREFIX = "mnemocode-forgotten";
/** What the wallet was compared with, for the summary line. */
const EVIDENCE_NAMES: Record<string, string> = {
  fingerprint: "the fingerprint",
  address: "the address",
  key: "the key",
  coin: "the address",
};

const grouped = (count: number): string => count.toLocaleString("en-US");

/**
 * Codes typed where words are asked for: Decode reads them. A copy of MnemoCode's CODES_NOT_WORDS
 * (cli/recover-word-command.ts), which only its command line holds, with the tab's name for its
 * menu entry; keep the two alike until the core holds the sentence.
 */
const CODES_NOT_WORDS =
  "These are the codes of an encoded seed phrase, not its words: Decode reads them, with ? for each unread code.";

// The search worker's script, bundled and embedded by build-key-derivation-html.mjs.
declare const __MNEMOCODE_SEARCH_WORKER_SOURCE__: string;

export class MnemoCodeForgottenTab {
  readonly #context: RecoveryFeatureContext;
  readonly #phrase = required<HTMLTextAreaElement>(`#${PREFIX}-phrase`);
  readonly #count = required<HTMLElement>(`#${PREFIX}-count`);
  readonly #dates: MnemoCodeForgottenDates;
  readonly #datesNote = required<HTMLElement>(`#${PREFIX}-dates-note`);
  readonly #search = required<HTMLButtonElement>(`#${PREFIX}-search`);
  readonly #cancel = required<HTMLButtonElement>(`#${PREFIX}-stop`);
  readonly #status = required<HTMLElement>(`#${PREFIX}-status`);
  readonly #result = required<HTMLElement>(`#${PREFIX}-result`);
  readonly #evidence = new WalletEvidenceField(PREFIX);
  readonly #list = new CandidateListField(PREFIX);
  #sizeTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #job = new MnemoCodeWorkerJob<MnemoCodeSearchRequest, SearchOutcome | SearchQuestion>(
    __MNEMOCODE_SEARCH_WORKER_SOURCE__,
    { button: this.#search, cancel: this.#cancel, status: this.#status },
  );
  /** The candidate list on the result's Save button; wiped when the result goes. */
  #listBytes: Uint8Array | undefined;

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    this.#dates = new MnemoCodeForgottenDates(this.#status);
    // The size lines fill after a typing pause; they hold their height from the start.
    for (const note of [this.#count, this.#datesNote]) note.textContent = RESERVED_NOTE_LINE;
    installSecretToggle(`#toggle-${PREFIX}-phrase`, `#${PREFIX}-phrase`, "Show", "Hide", "phrase");
    installFieldImports(this.#phrase, (message) => (this.#status.textContent = message), {
      file: PHRASE_FILE_IMPORT,
      qr: {},
    });
    attachMnemoCodeWordHints(this.#phrase, WordList.BIP39);
    this.#list.onChange((wanted) => {
      this.#evidence.listWanted = wanted;
    });
    for (const radio of this.#radios("kind")) radio.addEventListener("change", () => this.#show());
    // Unreadable codes of an encoded seed phrase are found where codes are read, as MnemoCode's
    // menu sends them to Decode.
    required<HTMLButtonElement>(`#${PREFIX}-open-decode`).addEventListener("click", () =>
      required<HTMLButtonElement>(
        '[data-operation-tab][aria-controls="mnemocode-decode-panel"]',
      ).click(),
    );
    for (const radio of this.#radios("where")) radio.addEventListener("change", () => this.#show());
    this.#phrase.addEventListener("input", () => this.#inputChanged());
    this.#dates.onEdit(() => this.#inputChanged());
    // The wallet and list fields belong to the inputs too; the result's own controls do not.
    const searchFields = required<HTMLElement>(`#${PREFIX}-search-fields`);
    const edits = new FieldEdits();
    for (const type of ["input", "change"])
      searchFields.addEventListener(type, (event) => {
        if (event.target instanceof Node && this.#result.contains(event.target)) return;
        if (edits.isNew(event)) this.#inputChanged();
      });
    this.#search.addEventListener("click", () => this.#start());
    this.#show();
  }

  #radios(name: string): HTMLInputElement[] {
    return [...document.querySelectorAll<HTMLInputElement>(`input[name="${PREFIX}-${name}"]`)];
  }

  #chosen<T extends string>(name: string): T {
    return this.#radios(name).find((radio) => radio.checked)?.value as T;
  }

  #show(): void {
    const forgotten = this.#chosen<Forgotten>("kind");
    const where = this.#chosen<Where>("where");
    required<HTMLElement>(`#${PREFIX}-word`).hidden = forgotten !== "word";
    required<HTMLElement>(`#${PREFIX}-code`).hidden = forgotten !== "code";
    required<HTMLElement>(`#${PREFIX}-date`).hidden = forgotten !== "date";
    // The share repair is MnemoCode's shares module, built only together with the SSKR library.
    const share = document.querySelector<HTMLElement>(`#${PREFIX}-share`);
    if (share !== null) share.hidden = forgotten !== "share";
    // Shares are repaired by their own section, and codes are searched in Decode.
    required<HTMLElement>(`#${PREFIX}-search-fields`).hidden =
      forgotten === "share" || forgotten === "code";
    this.#dates.available = forgotten === "date";
    // The CLI compares references with replacements, but never saves these as a candidate file.
    const legacy = forgotten === "word" && where === "legacy";
    this.#list.available = !legacy;
    const walletQuestion = required<HTMLInputElement>(
      `#${PREFIX}-wallet-fingerprint-choice`,
    ).closest<HTMLElement>("fieldset");
    if (walletQuestion !== null) walletQuestion.hidden = false;
    this.#inputChanged();
  }

  #inputChanged(): void {
    this.#clearResult();
    this.#job.revise();
    clearTimeout(this.#sizeTimer);
    this.#sizeTimer = setTimeout(() => this.#showSize(), SIZE_DELAY_MS);
  }

  /** Removes the result and wipes the candidate list it offered to save. */
  #clearResult(): void {
    this.#result.replaceChildren();
    this.#listBytes?.fill(0);
    this.#listBytes = undefined;
  }

  /** The size of the search, worked out by MnemoCode's library while typing. */
  #showSize(): void {
    const forgotten = this.#chosen<Forgotten>("kind");
    if (forgotten === "word") this.#count.textContent = this.#wordSize() || RESERVED_NOTE_LINE;
    if (forgotten === "date") {
      this.#datesNote.textContent = this.#dates.size() || RESERVED_NOTE_LINE;
      try {
        this.#evidence.optional = !walletNeeded(this.#dates.mode);
      } catch {
        this.#evidence.optional = true;
      }
    } else this.#evidence.optional = true;
  }

  #wordSize(): string {
    const where = this.#chosen<Where>("where");
    if (this.#phrase.value.trim() === "" || where === "legacy") return "";
    try {
      const search = WordCandidateSearch.parse(this.#phrase.value, this.#wordKind());
      const { count, exact } = search.expected;
      return `${grouped(search.combinations)} combinations · ${exact ? "" : "about "}${grouped(count)} pass the checksum`;
    } catch (cause) {
      if (BackupReading.isCodes(this.#phrase.value)) return CODES_NOT_WORDS;
      return cause instanceof Error ? cause.message : "";
    }
  }

  /** Whether codes were typed in place of the words, which only Decode reads. */
  #codesTyped(): boolean {
    try {
      WordCandidateSearch.parse(this.#phrase.value, this.#wordKind());
      return false;
    } catch {
      return BackupReading.isCodes(this.#phrase.value);
    }
  }

  #wordKind(): Exclude<MnemoCodeWordSearchKind, "legacy-replacements"> {
    return this.#chosen<Where>("where") === "missing" ? "missing-word" : "unknown-words";
  }

  #start(): void {
    this.#clearResult();
    this.#status.classList.remove("warning");
    const forgotten = this.#chosen<Forgotten>("kind");
    if (forgotten === "code") return;
    const legacy = forgotten === "word" && this.#chosen<Where>("where") === "legacy";
    if (forgotten === "word" && !legacy && this.#codesTyped()) {
      this.#status.classList.add("warning");
      this.#status.textContent = CODES_NOT_WORDS;
      return;
    }
    if (legacy && (this.#evidence.choice === undefined || this.#evidence.choice === "none"))
      return this.#legacy();
    void this.#context.jobs
      .runHeavy("A MnemoCode search", () => this.#run(forgotten))
      .catch((cause: unknown) => {
        this.#status.classList.add("warning");
        this.#status.textContent = cause instanceof Error ? cause.message : "The search failed.";
      });
  }

  /** The last-word replacements of an old Original Seedshift phrase: a quick list, no worker. */
  #legacy(): void {
    try {
      renderMissingWordCandidates(
        this.#result,
        recoverMnemoCodeLegacyLastWords(this.#phrase.value),
        this.#context.writeClipboard,
        true,
      );
      this.#status.textContent = "";
    } catch (cause) {
      this.#status.classList.add("warning");
      this.#status.textContent =
        cause instanceof Error ? cause.message : "The phrase cannot be read.";
    }
  }

  async #run(forgotten: Forgotten): Promise<void> {
    const wallet = this.#evidence.request();
    if (wallet === undefined && this.#evidence.choice === undefined)
      throw new Error("Choose how MnemoCode can recognise the wallet.");
    const list = this.#list.request();
    // A list stores the BIP39 passphrase typed for it, also when no wallet is compared.
    const passphrase = wallet?.passphrase ?? (list === undefined ? "" : this.#evidence.passphrase);
    const listed = list === undefined ? {} : { list, listPassphrase: passphrase };
    const request =
      forgotten === "word"
        ? {
            type: "words" as const,
            text: this.#phrase.value,
            kind:
              this.#chosen<Where>("where") === "legacy"
                ? ("legacy-replacements" as const)
                : this.#wordKind(),
            ...(wallet === undefined ? {} : { wallet }),
            ...listed,
          }
        : { ...this.#dates.request(wallet), ...listed };
    // The core asks by assessed time, or by the typed consent allowance. A second press agrees
    // only to the same captured inputs; neither allowance nor display retention stops the search.
    const inputs = JSON.stringify(request);
    const asked =
      request.type === "dates" ? { ...request, confirmed: this.#job.confirmed(inputs) } : request;
    // What the result names is what was compared, whatever the fields say by the time it ends.
    const choice = this.#evidence.choice;
    const done = await this.#job.run(
      asked,
      (progress, elapsed) => this.#progressLine(progress, elapsed, choice),
      "Starting the search.",
    );
    const outcome = done?.outcome;
    if (outcome !== undefined && "question" in outcome) {
      this.#job.ask(`${outcome.question} This page must stay open.`, inputs);
      return;
    }
    this.#job.revise();
    if (done === undefined || outcome === undefined) return;
    this.#status.textContent = `Search complete in ${done.elapsed}.`;
    this.#listBytes = outcome.list?.bytes;
    renderCandidates(
      this.#result,
      outcome,
      {
        foundLabel:
          request.type === "dates"
            ? "Dates"
            : request.kind === "legacy-replacements"
              ? "Stored replacement"
              : "Words",
        evidence: choice === undefined ? undefined : EVIDENCE_NAMES[choice],
        passphrase,
      },
      this.#context,
    );
    // The dates turn the masked codes back: every phrase found is a wallet's own.
    if (request.type === "dates")
      this.#result.prepend(
        paragraph(`Phrases: ${PHRASE_WORDS.original}, for each set of dates.`, "field-note"),
      );
    if (request.type === "words" && request.kind === "legacy-replacements")
      this.#result.prepend(paragraph(LEGACY_REPLACEMENTS_NOTE, "warning-callout"));
  }

  #progressLine(progress: SearchProgress, elapsed: string, choice: string | undefined): string {
    const percent =
      progress.total > 0
        ? ` (${Math.min(100, Math.floor((progress.checked / progress.total) * 100))}%)`
        : "";
    const matched =
      choice === undefined || choice === "none" ? "" : ` · ${grouped(progress.matched)} matched`;
    const takes = progress.takes === undefined ? "" : ` · it takes ${progress.takes}`;
    return (
      `Searching · ${grouped(progress.checked)} of ${grouped(progress.total)}${percent} · ` +
      `${grouped(progress.found)} candidates${matched} · ${elapsed} elapsed${takes}`
    );
  }
}

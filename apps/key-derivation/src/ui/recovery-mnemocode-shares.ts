// MnemoCode's Shamir shares in the Deriver: "Split into Shamir shares" in the Encode tab, the
// Restore tab, and the repair of shares with unreadable elements in the Forgotten tab, as
// MnemoCode's sskr-split, sskr-combine and sskr-export do them. A module of its own because the
// shares need the SSKR library: the build installs it only when both the mnemocode and the sskr
// features are selected. Every rule is MnemoCode's; restores and repairs run in a worker.
import { fingerprintWithoutPassphrase } from "@ckd/recovery-backup/fingerprint.js";
import {
  MnemoCodeShares,
  sskrSharePlatform,
  type RepairOutcome,
  type RestoreOutcome,
  type Stop,
  type ShareMode,
} from "@ckd/recovery-backup/mnemocode-shares.js";
import { sskrCodec, sskrWasmBytes } from "@ckd/recovery-backup/sskr.js";
import { fillSecureRandom } from "@ckd/core/secure-random.js";
import {
  encodeMnemoCode,
  mnemoCodeDatesFor,
  type MnemoCodeFormat,
} from "@ckd/recovery-backup/mnemocode.js";
import { ShareBackupCheck } from "../../../../packages/recovery-mnemocode/source/core/backup-check.js";
import { ShareSetChoice } from "../../../../packages/recovery-mnemocode/source/core/backup-options.js";
import { DatesAnswer } from "../../../../packages/recovery-mnemocode/source/core/date-search.js";
import {
  Masking,
  PHRASE_WORDS,
  type MaskingMode,
} from "../../../../packages/recovery-mnemocode/source/core/masking.js";
import {
  REPAIR_NOTES,
  type ShareRepairs,
} from "../../../../packages/recovery-mnemocode/source/sskr/repair-report.js";
import { EncodedForm } from "../../../../packages/recovery-mnemocode/source/core/encoded-form.js";
import { SHARE_WORD_HINTS } from "../../../../packages/recovery-mnemocode/source/sskr/share-input.js";
import { SHARE_FORMAT_NAMES } from "../../../../packages/recovery-mnemocode/source/sskr/share-set.js";
import { MAX_REPAIR_COMBINATIONS } from "../../../../packages/recovery-mnemocode/source/sskr/joint-repair.js";
import {
  MIRRORED_FORM,
  type ShareFormat,
} from "../../../../packages/recovery-mnemocode/source/sskr/transport.js";
import type { MnemoCodeSharesRequest } from "../workers/mnemocode-shares-worker.js";
import { BackupCheckSection } from "./recovery-mnemocode-backup-check.js";
import { renderCandidateListSave } from "./recovery-mnemocode-candidates.js";
import { formatLabel } from "./recovery-mnemocode-results.js";
import { attachMnemoCodeWordHints } from "./recovery-mnemocode-word-hints.js";
import { CandidateListField } from "./recovery-mnemocode-list.js";
import { showShareRepairTimes } from "./recovery-mnemocode-repair-times.js";
import { mnemoCodeSelfTest } from "./recovery-mnemocode-self-test.js";
import { latestShares } from "./recovery-mnemocode-share-store.js";
import { OTHER_SET, chosenSetValue, chosenShareSet } from "./recovery-mnemocode-share-choice.js";
import type { RecoveryFeature } from "./recovery-feature.js";
import { WalletEvidenceField } from "./recovery-mnemocode-evidence.js";
import { MnemoCodeWorkerJob } from "./recovery-mnemocode-worker-job.js";
import { InputRevision } from "./recovery-input-revision.js";
import { MnemoCodeSearchSettingsFields } from "./recovery-mnemocode-search-settings.js";
import {
  appendApartCodes,
  installSecretToggle,
  paragraph,
  renderRecoveredMnemonic,
  renderRecoveredSecret,
  renderSensitiveShares,
  required,
  shownTextsIn,
  type RecoveryFeatureContext,
  installFieldImports,
  SHARES_FILE_IMPORT,
  QR_IMAGES_IMPORT,
} from "./recovery-workspace-shared.js";
import { takeHandedOverShares, type FirstShare } from "./recovery-mnemocode-share-handover.js";

// The shares worker's script, bundled and embedded by build-key-derivation-html.mjs.
declare const __MNEMOCODE_SHARES_WORKER_SOURCE__: string;

/** The share forms offered, the command line's two first, then the forms of an encoded phrase. */
const SHARE_FORMS: readonly ShareFormat[] = [
  "words",
  "ur",
  "indexes",
  "unicode",
  "colors",
  "colors-unicode",
];
/** The text file of a split, as MnemoCode's menu names it. */
const SHARES_FILE = "mnemocode-shares.txt";
const FINGERPRINT_NOTE =
  "BIP32 master key fingerprints for an empty BIP39 passphrase; they do not reveal the phrase.";

const grouped = (count: number): string => count.toLocaleString("en-US");

function notes(texts: readonly string[], className = "field-note"): HTMLElement[] {
  return texts.map((text) => paragraph(text, className));
}

/** Restore and Repair read the same share files and several QR images into their own fields. */
function installShareImports(input: HTMLTextAreaElement, status: HTMLElement): void {
  installFieldImports(input, (message) => (status.textContent = message), {
    file: SHARES_FILE_IMPORT,
    qr: QR_IMAGES_IMPORT,
  });
}

/** Every share result loses its ownership on edits, page departure or a failed startup check. */
function shareInputs(
  root: EventTarget,
  context: RecoveryFeatureContext,
  changed: () => void,
): InputRevision {
  const inputs = new InputRevision(root, changed);
  inputs.bindPageLifetime();
  context.jobs.onChange((change) => {
    if (change === "ready" && !context.jobs.ready) inputs.revise();
  });
  return inputs;
}

function shareJobAvailable(context: RecoveryFeatureContext): boolean {
  return context.jobs.ready && context.jobs.runningJob === null;
}

function captureShareInputs(inputs: InputRevision, context: RecoveryFeatureContext): () => boolean {
  const current = inputs.capture();
  return () => context.jobs.ready && current();
}

function shareClipboard(
  context: RecoveryFeatureContext,
  current: () => boolean,
): (value: string) => Promise<void> {
  return async (value) => {
    if (current()) await context.writeClipboard(value);
  };
}

/** Capture guards stay on detached actions too, including the shared candidate-list Save button. */
function guardShareResultActions(result: HTMLElement, current: () => boolean): void {
  for (const action of result.querySelectorAll<HTMLElement>("button, a"))
    action.addEventListener(
      "click",
      (event) => {
        if (current()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { capture: true },
    );
}

function tableCell(tag: "th" | "td", content: string | Node): HTMLElement {
  const cell = document.createElement(tag);
  cell.append(content);
  return cell;
}

/**
 * What a repair filled in where ? stood, as MnemoCode's command line lays it out: a table with a
 * row for each share and, in it, each element's number and what was filled in; then MnemoCode's
 * notes on guesses and on correcting the written copy. Nothing when no ? was typed.
 */
function repairsTable(repairs: readonly ShareRepairs[]): HTMLElement[] {
  if (repairs.length === 0) return [];
  const head = document.createElement("thead");
  const headings = document.createElement("tr");
  headings.append(tableCell("th", "Share"), tableCell("th", "Element and what was filled in"));
  head.append(headings);
  const body = document.createElement("tbody");
  for (const { share, elements } of repairs) {
    const filled = document.createElement("span");
    filled.className = "mnemocode-repair-elements";
    for (const { position, value, guess } of elements) {
      const element = document.createElement("span");
      const number = document.createElement("span");
      number.className = "mnemocode-repair-position";
      number.textContent = String(position);
      const word = document.createElement("strong");
      word.textContent = value;
      element.append(number, " ", word);
      if (guess) {
        const mark = document.createElement("span");
        mark.className = "mnemocode-repair-guess";
        mark.textContent = " (guess)";
        element.append(mark);
      }
      filled.append(element);
    }
    const row = document.createElement("tr");
    row.append(tableCell("td", String(share)), tableCell("td", filled));
    body.append(row);
  }
  const table = document.createElement("table");
  table.className = "mnemocode-repair-table";
  table.append(head, body);
  // The heading, the table and the warning on guesses stand together in one callout.
  const callout = document.createElement("div");
  callout.className = "warning-callout mnemocode-repairs";
  const heading = document.createElement("p");
  heading.textContent = REPAIR_NOTES.heading;
  callout.append(heading, table);
  if (repairs.some(({ elements }) => elements.some(({ guess }) => guess))) {
    const guesses = document.createElement("p");
    guesses.textContent = REPAIR_NOTES.guesses;
    callout.append(guesses);
  }
  return [callout, paragraph(REPAIR_NOTES.correct, "field-note")];
}

function chosenRadio(name: string): string | undefined {
  return document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value;
}

/** Keep each operation's optional fields when omitting the factors added by the job. */
type WithoutJobFactors<Request> = Request extends unknown
  ? Omit<Request, "sskrWasm" | "confirmed">
  : never;

/**
 * Runs a restore or a repair of shares for the `inputs` given, and settles what every outcome
 * says: its lines under `result`, a question that the next press answers ("Search anyway"), and a
 * trouble on the status line. Only a result comes back; undefined for everything else.
 */
async function runSharesJob<
  Outcome extends { readonly kind: string; readonly lines: readonly string[] },
>(
  job: MnemoCodeWorkerJob<MnemoCodeSharesRequest, Outcome | Stop>,
  request: WithoutJobFactors<MnemoCodeSharesRequest>,
  inputs: string,
  elements: { readonly status: HTMLElement; readonly result: HTMLElement },
): Promise<Exclude<Outcome, Stop> | undefined> {
  const { status, result } = elements;
  const done = await job.run(
    { ...request, confirmed: job.confirmed(inputs), sskrWasm: sskrWasmBytes() },
    (progress, elapsed) =>
      `Searching · ${grouped(progress.checked)} of ${grouped(progress.total)} · ${elapsed} elapsed`,
    "Reading the shares.",
  );
  if (done === undefined) return undefined;
  status.textContent = `Done in ${done.elapsed}.`;
  const outcome = done.outcome;
  result.append(...notes(outcome.lines));
  if (outcome.kind === "question") {
    job.ask((outcome as Extract<Stop, { kind: "question" }>).question, inputs);
    return undefined;
  }
  job.revise();
  if (outcome.kind === "trouble") {
    status.classList.add("warning");
    status.textContent = (outcome as Extract<Stop, { kind: "trouble" }>).message;
    return undefined;
  }
  return outcome as Exclude<Outcome, Stop>;
}

/**
 * "Split into Shamir shares" in the Encode tab: the phrase, mode and dates of Encode into one
 * group of shares, checked before they are shown, as MnemoCode's split makes them.
 */
class MnemoCodeSplitSection {
  readonly #context: RecoveryFeatureContext;
  readonly #shares: MnemoCodeShares;
  readonly #mode = required<HTMLSelectElement>("#mnemocode-encode-mode");
  readonly #dates = required<HTMLTextAreaElement>("#mnemocode-encode-dates");
  readonly #form = required<HTMLSelectElement>("#mnemocode-split-form");
  readonly #save = required<HTMLButtonElement>("#mnemocode-split-save");
  readonly #status = required<HTMLElement>("#mnemocode-split-status");
  readonly #result = required<HTMLElement>("#mnemocode-split-result");
  /** The shares shown, for the text file; gone when anything changes. */
  #written: readonly string[] = [];
  readonly #backupCheck = new BackupCheckSection("mnemocode-split", SHARE_WORD_HINTS);
  readonly #copy = required<HTMLInputElement>("#mnemocode-split-copy");
  readonly #inputs: InputRevision;
  #current: () => boolean = () => false;

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    this.#shares = new MnemoCodeShares(
      sskrSharePlatform(sskrCodec()),
      fillSecureRandom,
      (mnemonic) => fingerprintWithoutPassphrase(mnemonic, context.mnemonicToSeed),
    );
    this.#renderSets();
    this.#form.replaceChildren(
      ...SHARE_FORMS.map((form) => {
        const option = document.createElement("option");
        option.value = form;
        option.textContent = SHARE_FORMAT_NAMES[form];
        return option;
      }),
    );
    // Shares shown for other inputs would be mistaken for the current ones.
    // What is typed into the backup check belongs to the shares shown, not to a new split.
    const section = required<HTMLElement>("#mnemocode-split-section");
    const check = required<HTMLElement>("#mnemocode-split-check-section");
    check.dataset.resultInteraction = "";
    this.#result.dataset.resultInteraction = "";
    this.#inputs = shareInputs(section, context, () => this.#changed());
    for (const field of [
      this.#mode,
      this.#dates,
      required<HTMLTextAreaElement>("#mnemocode-source"),
      required<HTMLSelectElement>("#mnemocode-encode-format"),
    ])
      if (!section.contains(field)) this.#inputs.watch(field);
    document.addEventListener("recovery-source-change", (event) => {
      if (event instanceof CustomEvent && event.detail === "mnemocode") this.#inputs.revise();
    });
    installSecretToggle(
      "#toggle-mnemocode-split-result",
      shownTextsIn("#mnemocode-split-result"),
      "Show shares",
      "Hide shares",
    );
    required<HTMLButtonElement>("#mnemocode-split").addEventListener(
      "click",
      () => void this.#split(),
    );
    this.#save.addEventListener("click", () => {
      if (this.#written.length === 0 || !this.#current()) return;
      this.#context.downloadText(`${this.#written.join("\n")}\n`, SHARES_FILE, "text/plain");
    });
    this.#changed();
  }

  /** The usual share sets come from MnemoCode, then Other for any set that SSKR allows. */
  #renderSets(): void {
    const choices = [
      ...ShareSetChoice.PRESETS.map((set) => ({
        value: set.label,
        label: set.label,
        note: set.note,
      })),
      { value: OTHER_SET, label: "Other", note: ShareSetChoice.OTHER_NOTE },
    ];
    required<HTMLElement>("#mnemocode-split-sets").replaceChildren(
      ...choices.map((choice, index) => {
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "mnemocode-split-set";
        radio.id = `mnemocode-split-set-${index}`;
        radio.value = choice.value;
        radio.autocomplete = "off";
        radio.checked = index === 0;
        const label = document.createElement("label");
        label.className = "checkbox-row";
        label.htmlFor = radio.id;
        const note = document.createElement("span");
        note.className = "answer-note";
        note.textContent = choice.note;
        label.append(radio, ` ${choice.label} `, note);
        return label;
      }),
    );
  }

  #changed(): void {
    required<HTMLElement>("#mnemocode-split-other").hidden = chosenSetValue() !== OTHER_SET;
    required<HTMLElement>("#mnemocode-split-copy-warning").hidden = !this.#copy.checked;
    this.#result.replaceChildren();
    // Only this section's Show button: the records of Encode keep theirs.
    required<HTMLElement>("#mnemocode-split-section").dispatchEvent(
      new CustomEvent("secret-content-reset"),
    );
    this.#status.textContent = "";
    this.#status.classList.remove("warning");
    this.#written = [];
    this.#save.hidden = true;
    this.#backupCheck.offer(undefined);
    latestShares.forget("split");
  }

  /** Direct or MnemoCode Seedshift: SSKR splits a valid BIP39 phrase, which the others are not. */
  #shareMode(): ShareMode {
    const mode = this.#mode.value as MaskingMode;
    // MnemoCode's Masking says which modes split: no Original Seedshift.
    if (!Masking.of(mode).capabilities.split)
      throw new Error(
        "The Original Seedshift cannot be split into shares: choose Direct or Seedshift · checksum-valid.",
      );
    return mode as ShareMode;
  }

  async #split(): Promise<void> {
    if (!shareJobAvailable(this.#context)) return;
    this.#inputs.revise();
    const current = captureShareInputs(this.#inputs, this.#context);
    this.#current = current;
    try {
      const mode = this.#shareMode();
      const set = chosenShareSet();
      const form = this.#form.value as ShareFormat;
      const dates = this.#dates.value;
      const wholeCopy = this.#copy.checked;
      const wholeFormat = required<HTMLSelectElement>("#mnemocode-encode-format")
        .value as MnemoCodeFormat;
      // Snapshot every request and presentation choice before the first asynchronous turn.
      const request = {
        phrase: this.#context.readMnemonic("mnemocode", "#mnemocode-source"),
        mode,
        dates,
        threshold: set.threshold,
        count: set.count,
        form,
      };
      const outcome = await this.#context.jobs.runHeavy("A MnemoCode share split", () =>
        this.#shares.split(request),
      );
      if (!current()) return;
      const seed = this.#context.mnemonicToSeed;
      const clipboard = shareClipboard(this.#context, current);
      const holds = Masking.of(mode).holds;
      renderSensitiveShares(
        this.#result,
        outcome.shares,
        clipboard,
        outcome.shares.map((_, index) => `Share ${index + 1} of ${set.count}, holds ${holds}`),
        outcome.shares.map((share) => apartShareCodes(share, form)),
        current,
      );
      // MnemoCode's words for what the shares hold and for both fingerprints (PHRASE_WORDS).
      const fingerprints =
        `${PHRASE_WORDS.originalFingerprint} ${fingerprintWithoutPassphrase(outcome.original, seed)}` +
        (mode === "seedshift"
          ? ` · ${PHRASE_WORDS.encodedFingerprint} ${fingerprintWithoutPassphrase(outcome.split, seed)}. ${PHRASE_WORDS.fingerprintRoles}`
          : ".");
      this.#result.append(
        ...notes([
          `The shares hold ${holds}. ${set.note}. ${SHARE_FORMAT_NAMES[form]}; each share was checked: together they restore it.`,
          `${fingerprints} ${FINGERPRINT_NOTE}`,
        ]),
        ...(mode === "seedshift"
          ? notes(
              [
                "Only the same dates turn the masked phrase back into the original seed phrase. Keep the dates: the shares do not store them.",
              ],
              "warning-callout",
            )
          : []),
      );
      // The whole phrase in Encode's representation, as MnemoCode's encode --sskr --format shows it.
      if (wholeCopy) {
        const copy = encodeMnemoCode(
          outcome.original,
          mode,
          wholeFormat,
          mnemoCodeDatesFor(mode, dates),
        );
        renderSensitiveShares(
          this.#result,
          [copy.payload],
          clipboard,
          ["Whole seed phrase"],
          [EncodedForm.of(copy.format).apartCodes(copy.payload)],
          current,
        );
      }
      this.#written = outcome.shares;
      this.#save.hidden = false;
      latestShares.shares = {
        records: outcome.records,
        form,
        masked: Masking.of(mode).masked,
        origin: "split",
      };
      this.#backupCheck.offer(
        new ShareBackupCheck(
          {
            mnemonic: outcome.original,
            mode,
            threshold: set.threshold,
            ...(mode === "seedshift"
              ? { dates: DatesAnswer.parse(dates, { patterns: false }).known }
              : {}),
          },
          sskrSharePlatform(sskrCodec()),
          { decodeEntry: "MnemoCode › Decode" },
        ),
      );
      guardShareResultActions(this.#result, current);
      this.#status.textContent = `Split into ${set.count} shares.`;
    } catch (cause) {
      if (!current()) return;
      this.#status.classList.add("warning");
      this.#status.textContent = cause instanceof Error ? cause.message : "The split failed.";
    }
  }
}

/**
 * The Restore tab: shares, with unreadable elements marked ?, back into the seed phrase, and on
 * request the candidate list of its phrases for the Discovery Scanner, as sskr-combine saves it.
 */
class MnemoCodeRestoreTab {
  readonly #context: RecoveryFeatureContext;
  readonly #input = required<HTMLTextAreaElement>("#mnemocode-restore-shares");
  readonly #dates = required<HTMLInputElement>("#mnemocode-restore-dates");
  readonly #status = required<HTMLElement>("#mnemocode-restore-status");
  readonly #result = required<HTMLElement>("#mnemocode-restore-result");
  readonly #evidence = new WalletEvidenceField("mnemocode-restore");
  readonly #list = new CandidateListField("mnemocode-restore");
  readonly #settings = new MnemoCodeSearchSettingsFields(
    "mnemocode-restore",
    "shares",
    MAX_REPAIR_COMBINATIONS,
  );
  /** The candidate list on the result's Save button; wiped when the result goes. */
  #listBytes: Uint8Array | undefined;
  readonly #inputs: InputRevision;
  readonly #job = new MnemoCodeWorkerJob<MnemoCodeSharesRequest, RestoreOutcome>(
    __MNEMOCODE_SHARES_WORKER_SOURCE__,
    {
      button: required<HTMLButtonElement>("#mnemocode-restore"),
      cancel: required<HTMLButtonElement>("#mnemocode-restore-stop"),
      status: this.#status,
    },
  );

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    installSecretToggle(
      "#toggle-mnemocode-restore-shares",
      "#mnemocode-restore-shares",
      "Show",
      "Hide",
      "shares",
    );
    installShareImports(this.#input, this.#status);
    attachMnemoCodeWordHints(this.#input, SHARE_WORD_HINTS);
    this.#list.onChange((wanted) => {
      this.#evidence.listWanted = wanted;
    });
    const panel = required<HTMLElement>("#mnemocode-restore-panel");
    this.#result.dataset.resultInteraction = "";
    this.#inputs = shareInputs(panel, context, () => this.#changed());
    takeHandedOverShares((share) => this.#takeFirstShare(share));
    required<HTMLButtonElement>("#mnemocode-restore").addEventListener("click", () =>
      this.#start(),
    );
    this.#changed();
  }

  #mode(): ShareMode {
    return (chosenRadio("mnemocode-restore-mode") ?? "direct") as ShareMode;
  }

  /** Each guessed date gives a valid phrase: only the wallet tells which is yours. */
  #walletNeeded(): boolean {
    return this.#mode() === "seedshift" && this.#dates.value.includes("?");
  }

  #changed(): void {
    required<HTMLElement>("#mnemocode-restore-dates-field").hidden = this.#mode() !== "seedshift";
    this.#evidence.optional = !this.#walletNeeded();
    // A phrase shown for other inputs would be mistaken for theirs.
    this.#clearResult();
    this.#job.revise();
    this.#status.classList.remove("warning");
    this.#status.textContent = "";
  }

  /** Removes the result and wipes the candidate list it offered to save. */
  #clearResult(): void {
    this.#result.replaceChildren();
    this.#listBytes?.fill(0);
    this.#listBytes = undefined;
    required<HTMLElement>("#mnemocode-restore-panel").dispatchEvent(
      new CustomEvent("secret-content-reset"),
    );
  }

  #start(): void {
    if (!shareJobAvailable(this.#context)) return;
    const current = captureShareInputs(this.#inputs, this.#context);
    this.#clearResult();
    this.#status.classList.remove("warning");
    void this.#context.jobs
      .runHeavy("A MnemoCode share restore", () => this.#restore(current))
      .catch((cause: unknown) => this.#job.fail(cause, "The restore failed.", current));
  }

  async #restore(current: () => boolean): Promise<void> {
    const mode = this.#mode();
    // Without a wallet that must be given, no choice means every phrase that fits.
    const wallet =
      this.#evidence.choice === undefined && !this.#walletNeeded()
        ? undefined
        : this.#evidence.request();
    const dates = mode === "seedshift" ? this.#dates.value : "";
    const list = this.#list.request();
    const limits = this.#settings.limits;
    // A list stores the BIP39 passphrase typed for it, also when no wallet is compared.
    const passphrase = wallet?.passphrase ?? (list === undefined ? "" : this.#evidence.passphrase);
    // A long search confirmed for other inputs, a list among them, is asked about again.
    const inputs = JSON.stringify([
      this.#input.value,
      mode,
      dates,
      wallet,
      list,
      passphrase,
      limits,
    ]);
    const outcome = await runSharesJob(
      this.#job,
      {
        type: "restore",
        answer: this.#input.value,
        mode,
        dates,
        limits,
        ...(wallet === undefined ? {} : { wallet }),
        ...(list === undefined ? {} : { list, listPassphrase: passphrase }),
      },
      inputs,
      { status: this.#status, result: this.#result },
    );
    if (outcome === undefined || !current()) return;
    const clipboard = shareClipboard(this.#context, current);
    const count = outcome.phrases.length;
    this.#status.textContent = `${this.#status.textContent} ${
      count === 1 ? "The phrase is restored." : `${count} phrases fit.`
    }`;
    this.#result.append(...notes(outcome.notes));
    const seed = this.#context.mnemonicToSeed;
    for (const [index, phrase] of outcome.phrases.entries()) {
      if (count > 1) {
        const heading = document.createElement("h3");
        heading.textContent = `Phrase ${index + 1} of ${count}`;
        this.#result.append(heading);
      }
      this.#result.append(...repairsTable(phrase.repairs));
      const facts = [
        ...(phrase.dates === undefined ? [] : [`Dates found: ${phrase.dates}.`]),
        ...(phrase.matchedAt === undefined ? [] : [`Matches the wallet at ${phrase.matchedAt}.`]),
      ];
      this.#result.append(...notes(facts));
      // MnemoCode Seedshift gives a valid phrase for any dates: only the wallet confirms it.
      if (mode === "seedshift" && wallet === undefined)
        this.#result.append(
          paragraph(
            "Not verified: any dates give a valid phrase, so a wrong date is not detected. Compare the " +
              "original fingerprint with your wallet's.",
            "warning-callout",
          ),
        );
      // Each fingerprint stands directly under its own phrase, as MnemoCode's command line shows
      // them, so that the decoy's is never taken for the wallet's.
      const encoded =
        mode === "seedshift"
          ? paragraph(
              `${PHRASE_WORDS.encodedFingerprint} ${fingerprintWithoutPassphrase(phrase.held, seed)}, ` +
                `as the split showed it. ${FINGERPRINT_NOTE}`,
              "field-note",
            )
          : undefined;
      // The backup that was split, in its shares' form; the dates turn it into the phrase below.
      // It has a Show button of its own: the panel's buttons show input fields, not results.
      if (phrase.backup !== undefined) {
        const { form, text } = phrase.backup;
        this.#result.append(
          paragraph(`${formatLabel(form)} of ${Masking.of(mode).holds}`, "field-note"),
        );
        // Codes written joined are shown apart above them too, behind the same Show button.
        const codes = EncodedForm.of(form).apartCodes(text);
        const apart = codes === undefined ? undefined : appendApartCodes(this.#result, codes);
        renderRecoveredSecret(
          this.#result,
          text,
          { reveal: "Show backup", hide: "Hide backup", copy: "Copy restored backup" },
          clipboard,
          undefined,
          undefined,
          (revealed) => apart?.classList.toggle("concealed", !revealed),
        );
      }
      if (encoded !== undefined) this.#result.append(encoded);
      // What follows is the wallet's own phrase: with Seedshift, the dates turned the decoy back.
      this.#result.append(paragraph(`Phrase: ${PHRASE_WORDS.original}.`, "field-note"));
      renderRecoveredMnemonic(
        this.#result,
        phrase.mnemonic,
        clipboard,
        (mnemonic) => {
          if (current()) this.#context.useMnemonicInDeriver(mnemonic, passphrase || undefined);
        },
        seed,
        passphrase,
      );
      this.#result.append(
        paragraph(
          `${PHRASE_WORDS.originalFingerprint} ${fingerprintWithoutPassphrase(phrase.mnemonic, seed)}.` +
            (mode === "seedshift" ? ` ${PHRASE_WORDS.fingerprintRoles}` : "") +
            ` ${FINGERPRINT_NOTE}`,
          "field-note",
        ),
      );
    }
    this.#listBytes = outcome.list?.bytes;
    renderCandidateListSave(this.#result, outcome.list, "Phrase");
    guardShareResultActions(this.#result, current);
  }

  /**
   * A share given in Decode, kept as the first share here, as MnemoCode's decode hands it over;
   * after one from a QR image, the next is offered from another, as MnemoCode offers it.
   */
  #takeFirstShare(share: FirstShare): void {
    required<HTMLButtonElement>(
      '[data-operation-tab][aria-controls="mnemocode-restore-panel"]',
    ).click();
    // Shares typed here before stay below it; a copy of the same share counts once (ShareInput).
    const typed = this.#input.value.trim();
    this.#input.value = typed === "" ? share.text : `${share.text}\n${typed}`;
    this.#input.dispatchEvent(new Event("input", { bubbles: true }));
    this.#status.classList.remove("warning");
    const kept = typed === "" ? "" : " The shares typed here before stay below it.";
    this.#status.textContent = share.fromQr
      ? `The QR code held a Shamir share: it is the first share here.${kept} Read the next share from another QR code image, or type the shares below it.`
      : `These are the codes of a Shamir share: they are the first share here.${kept} Type the other shares below it.`;
  }
}

/**
 * A code of a Shamir share, in the Forgotten tab: the shares come back whole, in their own form or
 * one chosen, and the seed phrase is never shown. A wallet, with the dates of a Seedshift phrase,
 * tells apart several sets that fit.
 */
class MnemoCodeShareRepair {
  readonly #context: RecoveryFeatureContext;
  readonly #input = required<HTMLTextAreaElement>("#mnemocode-forgotten-shares");
  readonly #dates = required<HTMLInputElement>("#mnemocode-forgotten-shares-dates");
  readonly #form = required<HTMLSelectElement>("#mnemocode-forgotten-shares-form");
  readonly #status = required<HTMLElement>("#mnemocode-forgotten-shares-status");
  readonly #result = required<HTMLElement>("#mnemocode-forgotten-shares-result");
  readonly #evidence = new WalletEvidenceField("mnemocode-forgotten-shares");
  readonly #settings = new MnemoCodeSearchSettingsFields(
    "mnemocode-forgotten-shares",
    "shares",
    MAX_REPAIR_COMBINATIONS,
  );
  readonly #inputs: InputRevision;
  readonly #job = new MnemoCodeWorkerJob<MnemoCodeSharesRequest, RepairOutcome>(
    __MNEMOCODE_SHARES_WORKER_SOURCE__,
    {
      button: required<HTMLButtonElement>("#mnemocode-forgotten-shares-repair"),
      cancel: required<HTMLButtonElement>("#mnemocode-forgotten-shares-stop"),
      status: this.#status,
    },
  );

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    installSecretToggle(
      "#toggle-mnemocode-forgotten-shares",
      "#mnemocode-forgotten-shares",
      "Show",
      "Hide",
      "shares",
    );
    installShareImports(this.#input, this.#status);
    attachMnemoCodeWordHints(this.#input, SHARE_WORD_HINTS);
    installSecretToggle(
      "#toggle-mnemocode-forgotten-shares-result",
      shownTextsIn("#mnemocode-forgotten-shares-result"),
      "Show shares",
      "Hide shares",
    );
    const block = required<HTMLElement>("#mnemocode-forgotten-share");
    this.#result.dataset.resultInteraction = "";
    this.#inputs = shareInputs(block, context, () => this.#changed());
    required<HTMLButtonElement>("#mnemocode-forgotten-shares-repair").addEventListener(
      "click",
      () => this.#start(),
    );
    this.#changed();
  }

  /** Seedshift matters here only for the wallet check, which unmasks with the dates. */
  #mode(): ShareMode {
    return this.#walletGiven()
      ? ((chosenRadio("mnemocode-forgotten-shares-mode") ?? "direct") as ShareMode)
      : "direct";
  }

  #walletGiven(): boolean {
    const choice = this.#evidence.choice;
    return choice !== undefined && choice !== "none";
  }

  #changed(): void {
    required<HTMLElement>("#mnemocode-forgotten-shares-masked-field").hidden = !this.#walletGiven();
    required<HTMLElement>("#mnemocode-forgotten-shares-dates-field").hidden =
      this.#mode() !== "seedshift";
    this.#result.replaceChildren();
    required<HTMLElement>("#mnemocode-forgotten-share").dispatchEvent(
      new CustomEvent("secret-content-reset"),
    );
    latestShares.forget("repair");
    this.#job.revise();
    this.#status.classList.remove("warning");
    this.#status.textContent = "";
  }

  #start(): void {
    if (!shareJobAvailable(this.#context)) return;
    const current = captureShareInputs(this.#inputs, this.#context);
    this.#result.replaceChildren();
    latestShares.forget("repair");
    this.#status.classList.remove("warning");
    void this.#context.jobs
      .runHeavy("A MnemoCode share repair", () => this.#repair(current))
      .catch((cause: unknown) => this.#job.fail(cause, "The repair failed.", current));
  }

  async #repair(current: () => boolean): Promise<void> {
    const wallet = this.#walletGiven() ? this.#evidence.request() : undefined;
    const mode = this.#mode();
    const dates = mode === "seedshift" ? this.#dates.value : "";
    const form = this.#form.value === "" ? undefined : (this.#form.value as ShareFormat);
    const limits = this.#settings.limits;
    const inputs = JSON.stringify([this.#input.value, mode, dates, wallet, form, limits]);
    const outcome = await runSharesJob(
      this.#job,
      {
        type: "repair",
        answer: this.#input.value,
        mode,
        dates,
        limits,
        ...(wallet === undefined ? {} : { wallet }),
        ...(form === undefined ? {} : { form }),
      },
      inputs,
      { status: this.#status, result: this.#result },
    );
    if (outcome === undefined || !current()) return;
    if (outcome.kind === "variants") {
      this.#status.classList.add("warning");
      this.#status.textContent = outcome.message;
      for (const [index, variant] of outcome.variants.entries()) {
        const heading = document.createElement("h3");
        heading.textContent =
          `Variant ${index + 1} of ${outcome.variants.length}` +
          (variant.fingerprint === undefined
            ? ""
            : `, ${PHRASE_WORDS.originalFingerprint} ${variant.fingerprint}`);
        this.#result.append(heading, ...repairsTable(variant.repairs));
        this.#renderShares(variant.shares, current);
      }
      if (outcome.variants.some((variant) => variant.fingerprint !== undefined))
        this.#result.append(
          paragraph(
            `Each is the fingerprint of ${PHRASE_WORDS.original}, with an empty BIP39 passphrase.`,
            "field-note",
          ),
        );
      guardShareResultActions(this.#result, current);
      return;
    }
    this.#status.textContent = `${this.#status.textContent} The shares are written again.`;
    this.#result.append(...repairsTable(outcome.repairs));
    // The shares are the backup as written: with Seedshift they hold the decoy, whatever was typed.
    // Without a wallet the Seedshift question is not asked, so what they hold is not known here.
    this.#result.append(
      paragraph(
        mode === "seedshift" ? PHRASE_WORDS.repairedMasked : PHRASE_WORDS.repairedUnknown,
        "field-note",
      ),
    );
    this.#renderShares(
      outcome.shares,
      current,
      mode === "seedshift" ? `, holds ${PHRASE_WORDS.masked}` : "",
    );
    this.#result.append(...notes(outcome.notes));
    this.#offerShares(outcome.shares, outcome.form, mode === "seedshift", current);
    guardShareResultActions(this.#result, current);
  }

  /**
   * The shares written again go where MnemoCode's sskr-export saves them: to a text file, one
   * share per line, and to the card export, which prints them as cards.
   */
  #offerShares(
    shares: readonly { readonly text: string; readonly record: string }[],
    form: ShareFormat | undefined,
    masked: boolean,
    current: () => boolean,
  ): void {
    const save = document.createElement("button");
    save.type = "button";
    save.className = "secondary";
    save.textContent = "Save as a text file";
    const lines = shares.map((share) => share.text);
    save.addEventListener("click", () => {
      if (current()) this.#context.downloadText(`${lines.join("\n")}\n`, SHARES_FILE, "text/plain");
    });
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(save);
    this.#result.append(actions);
    if (form === undefined) {
      this.#result.append(
        paragraph(
          "The shares keep different forms: choose one in “Write the shares as” to print them as cards.",
          "field-note",
        ),
      );
      return;
    }
    latestShares.shares = {
      records: shares.map((share) => share.record),
      form,
      masked,
      origin: "repair",
    };
    this.#result.append(
      paragraph("Cards of these shares can be printed in Encode › Printable cards.", "field-note"),
    );
  }

  #renderShares(
    shares: readonly {
      readonly number: number;
      readonly text: string;
      readonly format: ShareFormat;
    }[],
    current: () => boolean,
    holds = "",
  ): void {
    const block = document.createElement("div");
    renderSensitiveShares(
      block,
      shares.map((share) => share.text),
      shareClipboard(this.#context, current),
      shares.map((share) => `Share ${share.number}${holds}`),
      shares.map((share) => apartShareCodes(share.text, share.format)),
      current,
    );
    this.#result.append(block);
  }
}

/**
 * The codes of `share`, a share written in `format`, apart where that form writes them joined, as
 * MnemoCode's command line shows a share: like the encoded phrase its form looks like.
 */
function apartShareCodes(share: string, format: ShareFormat): string[] | undefined {
  return EncodedForm.of(MIRRORED_FORM[format]).apartCodes(share);
}

function installMnemoCodeShares(context: RecoveryFeatureContext): void {
  mnemoCodeSelfTest.addShares(sskrSharePlatform(sskrCodec()), "the pinned SSKR WebAssembly");
  new MnemoCodeSplitSection(context);
  new MnemoCodeRestoreTab(context);
  new MnemoCodeShareRepair(context);
  showShareRepairTimes();
}

export const recoveryFeature: RecoveryFeature = { install: installMnemoCodeShares };

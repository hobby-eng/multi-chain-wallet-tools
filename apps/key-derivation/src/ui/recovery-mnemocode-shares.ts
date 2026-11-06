import { MnemoCodeDownload } from "./recovery-mnemocode-download.js";
import { fingerprintWithoutPassphrase } from "@ckd/recovery-backup/fingerprint.js";
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";
import type {
  RepairOutcome,
  RestoreOutcome,
  Stop,
  ShareMode,
} from "@ckd/recovery-backup/mnemocode-shares.js";
import { mnemocode } from "@ckd/recovery-backup/mnemocode-engine.js";
import {
  alwaysMasked,
  EncodedForm,
  isShareFormat,
  Masking,
  PHRASE_WORDS,
  RESTORED_FORM,
  type EncodedFormat,
  type ShareFormat,
} from "@ckd/recovery-backup/mnemocode-facts.js";
import { formatLabel } from "./recovery-mnemocode-results.js";
import type { MnemoCodeSearchRequest } from "../workers/mnemocode-search-worker.js";
import { renderCandidateListSave } from "./recovery-mnemocode-candidates.js";
import { CandidateListField } from "./recovery-mnemocode-list.js";
import { showShareRepairTimes } from "./recovery-mnemocode-repair-times.js";
import { mnemoCodeSelfTest } from "./recovery-mnemocode-self-test.js";
import { latestShares } from "./recovery-mnemocode-share-store.js";
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
import { DatesField } from "./recovery-mnemocode-fields.js";
import { ShareActions } from "./recovery-mnemocode-share-actions.js";
import { ShareResultView } from "./recovery-mnemocode-share-result-view.js";
import { MnemoCodeSplitSection } from "./recovery-mnemocode-split.js";

// The MnemoCode worker's script, bundled and embedded by build-key-derivation-html.mjs.
declare const __MNEMOCODE_SEARCH_WORKER_SOURCE__: string;
type MnemoCodeSharesRequest = Extract<MnemoCodeSearchRequest, { type: "restore" | "repair" }>;

const grouped = (count: number): string => count.toLocaleString("en-US");

/** Restore and Repair read the same share files and several QR images into their own fields. */
function installShareImports(input: HTMLTextAreaElement, status: HTMLElement): void {
  installFieldImports(input, (message) => (status.textContent = message), {
    file: SHARES_FILE_IMPORT,
    qr: QR_IMAGES_IMPORT,
  });
}

/** The encoded fingerprint of `phrase` masked with `dates`; none where MnemoCode cannot give it. */
function maskedFingerprint(phrase: string, dates: string | undefined): string | undefined {
  try {
    using backup = mnemocode().EncodedBackup.encode(phrase, dates, "unicode", "seedshift", false);
    return backup.encodedFingerprint();
  } catch {
    return undefined;
  }
}

/**
 * The backup that was split, in the form of the first share that MnemoCode reads in `answer`, which
 * the dates turn into `phrase`; none where it is the phrase's own words again, or a form that
 * MnemoCode writes only masked.
 */
function splitBackup(
  answer: string,
  phrase: string,
  mode: ShareMode,
  dates: string | undefined,
): { readonly form: EncodedFormat; readonly text: string } | undefined {
  // The backup is shown beside the phrase; where MnemoCode cannot give it, the phrase stands alone.
  try {
    const binding = mnemocode();
    let form: EncodedFormat | undefined;
    for (const line of answer.split(/\r?\n/u)) {
      try {
        const shareForm = binding.shareForm(line.trim());
        if (isShareFormat(shareForm)) form = RESTORED_FORM[shareForm];
      } catch {
        continue;
      }
      if (form !== undefined) break;
    }
    if (form === undefined || (mode === "direct" && alwaysMasked(form))) return undefined;
    using backup = binding.EncodedBackup.encode(phrase, dates, form, mode, false);
    return { form, text: backup.codes() };
  } catch {
    return undefined;
  }
}

function chosenRadio(name: string): string | undefined {
  return document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value;
}

/** Keep each operation's optional fields when omitting the factor added by the job. */
type WithoutJobFactors<Request> = Request extends unknown ? Omit<Request, "confirmed"> : never;

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
    { ...request, confirmed: job.confirmed(inputs) } as MnemoCodeSharesRequest,
    (progress, elapsed) =>
      `Searching · ${grouped(progress.checked)} of ${grouped(progress.total)} · ${elapsed} elapsed`,
    "Reading the shares.",
  );
  if (done === undefined) return undefined;
  status.textContent = `Done in ${done.elapsed}.`;
  const outcome = done.outcome;
  result.append(...ShareResultView.notes(outcome.lines));
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
  // Questions/trouble were handled above; the common worker owner already discarded stops.
  return outcome as typeof outcome & Exclude<Outcome, Stop>;
}

/**
 * "Split into Shamir shares" in the Encode tab: the phrase, mode and dates of Encode into one
 * group of shares, checked before they are shown, as MnemoCode's split makes them.
 */

/**
 * The Restore tab: shares, with unreadable elements marked ?, back into the seed phrase, and on
 * request the candidate list of its phrases for the Discovery Scanner, as sskr-combine saves it.
 */
class MnemoCodeRestoreTab {
  readonly #context: RecoveryFeatureContext;
  readonly #input = required<HTMLTextAreaElement>("#mnemocode-restore-shares");
  readonly #dates = new DatesField("restore");
  readonly #status = required<HTMLElement>("#mnemocode-restore-status");
  readonly #result = required<HTMLElement>("#mnemocode-restore-result");
  readonly #evidence = new WalletEvidenceField("mnemocode-restore");
  readonly #list = new CandidateListField("mnemocode-restore");
  readonly #settings = new MnemoCodeSearchSettingsFields("mnemocode-restore", "shares");
  /** The candidate list on the result's Save button; wiped when the result goes. */
  #listBytes: Uint8Array | undefined;
  readonly #inputs: InputRevision;
  readonly #job = new MnemoCodeWorkerJob<MnemoCodeSharesRequest, RestoreOutcome>(
    __MNEMOCODE_SEARCH_WORKER_SOURCE__,
    {
      button: required<HTMLButtonElement>("#mnemocode-restore"),
      cancel: required<HTMLButtonElement>("#mnemocode-restore-stop"),
      status: this.#status,
    },
  );

  readonly #actions = new ShareActions(
    this.#job,
    this.#dates,
    "restore",
    () => this.#mode(),
    (releases) => this.#clearResult(releases),
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
    this.#list.onChange((wanted) => {
      this.#evidence.listWanted = wanted;
    });
    const panel = required<HTMLElement>("#mnemocode-restore-panel");
    this.#result.dataset.resultInteraction = "";
    this.#inputs = ShareActions.inputs(panel, context, () => this.#changed());
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
    return this.#mode() === "seedshift" && this.#dates.input.value.includes("?");
  }

  #changed(): void {
    if (!this.#actions.changed()) return;
    this.#evidence.optional = !this.#walletNeeded();
    // A phrase shown for other inputs would be mistaken for theirs.
    this.#status.classList.remove("warning");
    this.#status.textContent = "";
  }

  /** Removes the result and wipes the candidate list it offered to save. */
  #clearResult(releases: readonly (() => void)[] = []): boolean {
    const bytes = this.#listBytes;
    this.#listBytes = undefined;
    return ShareActions.clear(
      {
        result: this.#result,
        status: this.#status,
      },
      [() => bytes?.fill(0), ...releases],
    );
  }

  #start(): void {
    this.#actions.start(this.#context, this.#inputs, this.#status, (current) =>
      this.#restore(current),
    );
  }

  async #restore(current: () => boolean): Promise<void> {
    const mode = this.#mode();
    // Without a wallet that must be given, no choice means every phrase that fits.
    const wallet =
      this.#evidence.choice === undefined && !this.#walletNeeded()
        ? undefined
        : this.#evidence.request();
    const dates = mode === "seedshift" ? this.#dates.input.value : undefined;
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
    const clipboard = ShareActions.clipboard(this.#context, current);
    const count = outcome.phrases.length;
    this.#status.textContent = `${this.#status.textContent} ${
      count === 1 ? "The phrase is restored." : `${count} phrases fit.`
    }`;
    this.#result.append(...ShareResultView.notes(outcome.notes));
    const seed = this.#context.mnemonicToSeed;
    for (const [index, phrase] of outcome.phrases.entries()) {
      if (count > 1) {
        const heading = document.createElement("h3");
        heading.textContent = `Phrase ${index + 1} of ${count}`;
        this.#result.append(heading);
      }
      this.#result.append(...ShareResultView.repairs(phrase.repairs));
      const facts = [
        ...(phrase.dates === undefined ? [] : [`Dates found: ${phrase.dates}.`]),
        ...(phrase.matchedAt === undefined ? [] : [`Matches the wallet at ${phrase.matchedAt}.`]),
      ];
      this.#result.append(...ShareResultView.notes(facts));
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
      // them, so that the decoy's is never taken for the wallet's: the masked phrase is the
      // phrase masked again with the dates that restored it.
      const restoredDates = mode === "seedshift" ? (phrase.dates ?? dates) : undefined;
      const masked =
        mode === "seedshift" ? maskedFingerprint(phrase.mnemonic, restoredDates) : undefined;
      // The backup that was split, in its shares' form; the dates turn it into the phrase below.
      // It has a Show button of its own: the panel's buttons show input fields, not results.
      const backup = splitBackup(this.#input.value, phrase.mnemonic, mode, restoredDates);
      if (backup !== undefined) {
        this.#result.append(
          paragraph(`${formatLabel(backup.form)} of ${Masking.of(mode).holds}`, "field-note"),
        );
        // Codes written joined are shown apart above them too, behind the same Show button.
        const codes = EncodedForm.of(backup.form).apartCodes(backup.text);
        const apart = codes === undefined ? undefined : appendApartCodes(this.#result, codes);
        renderRecoveredSecret(
          this.#result,
          backup.text,
          { reveal: "Show backup", hide: "Hide backup", copy: "Copy restored backup" },
          clipboard,
          undefined,
          undefined,
          (revealed) => apart?.classList.toggle("concealed", !revealed),
        );
      }
      if (masked !== undefined)
        this.#result.append(
          paragraph(
            `${PHRASE_WORDS.encodedFingerprint} ${masked}, as the split showed it. ${ShareResultView.FINGERPRINT_NOTE}`,
            "field-note",
          ),
        );
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
            ` ${ShareResultView.FINGERPRINT_NOTE}`,
          "field-note",
        ),
      );
    }
    // What the wallet check said of the matches, each once after the phrases (AUD-037-SEC004).
    this.#result.append(...ShareResultView.notes(outcome.warnings));
    this.#listBytes = outcome.list?.bytes;
    renderCandidateListSave(this.#result, outcome.list, "Phrase");
    ShareActions.guard(this.#result, current);
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
      ? `The QR share text was added with its boundaries kept.${kept} Read another QR code image or add any other shares needed below.`
      : `The share text was added with every part and its line boundaries kept.${kept} Add any other shares needed below.`;
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
  readonly #dates = new DatesField("forgotten-shares");
  readonly #form = required<HTMLSelectElement>("#mnemocode-forgotten-shares-form");
  readonly #status = required<HTMLElement>("#mnemocode-forgotten-shares-status");
  readonly #result = required<HTMLElement>("#mnemocode-forgotten-shares-result");
  readonly #evidence = new WalletEvidenceField("mnemocode-forgotten-shares");
  readonly #settings = new MnemoCodeSearchSettingsFields("mnemocode-forgotten-shares", "shares");
  readonly #inputs: InputRevision;
  readonly #job = new MnemoCodeWorkerJob<MnemoCodeSharesRequest, RepairOutcome>(
    __MNEMOCODE_SEARCH_WORKER_SOURCE__,
    {
      button: required<HTMLButtonElement>("#mnemocode-forgotten-shares-repair"),
      cancel: required<HTMLButtonElement>("#mnemocode-forgotten-shares-stop"),
      status: this.#status,
    },
  );

  readonly #actions = new ShareActions(
    this.#job,
    this.#dates,
    "repair",
    () => this.#mode(),
    (releases) => this.#clearResult(releases),
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
    installSecretToggle(
      "#toggle-mnemocode-forgotten-shares-result",
      shownTextsIn("#mnemocode-forgotten-shares-result"),
      "Show shares",
      "Hide shares",
    );
    const block = required<HTMLElement>("#mnemocode-forgotten-share");
    this.#result.dataset.resultInteraction = "";
    this.#inputs = ShareActions.inputs(block, context, () => this.#changed());
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
    if (!this.#actions.changed()) return;
    required<HTMLElement>("#mnemocode-forgotten-shares-masked-field").hidden = !this.#walletGiven();
    this.#status.classList.remove("warning");
    this.#status.textContent = "";
  }

  #start(): void {
    this.#actions.start(this.#context, this.#inputs, this.#status, (current) =>
      this.#repair(current),
    );
  }

  #clearResult(releases: readonly (() => void)[] = []): boolean {
    return ShareActions.clear(
      {
        result: this.#result,
        status: this.#status,
        reset: () => {
          RecoverySecretLifecycle.concealControl(
            required<HTMLButtonElement>("#toggle-mnemocode-forgotten-shares-result"),
          );
        },
      },
      [() => latestShares.forget("repair"), ...releases],
    );
  }

  async #repair(current: () => boolean): Promise<void> {
    const wallet = this.#walletGiven() ? this.#evidence.request() : undefined;
    const mode = this.#mode();
    const dates = mode === "seedshift" ? this.#dates.input.value : undefined;
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
        this.#result.append(heading, ...ShareResultView.repairs(variant.repairs));
        this.#renderShares(variant.shares, current);
      }
      if (outcome.variants.some((variant) => variant.fingerprint !== undefined))
        this.#result.append(
          paragraph(
            `Each is the fingerprint of ${PHRASE_WORDS.original}. ${ShareResultView.FINGERPRINT_NOTE}`,
            "field-note",
          ),
        );
      // The wallet check's warning once, after the sets, as sskr-export says it (AUD-037-SEC004).
      this.#result.append(
        ...ShareResultView.notes(outcome.warning === undefined ? [] : [outcome.warning]),
      );
      ShareActions.guard(this.#result, current);
      return;
    }
    this.#status.textContent = `${this.#status.textContent} The shares are written again.`;
    this.#result.append(...ShareResultView.repairs(outcome.repairs));
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
    this.#result.append(...ShareResultView.notes(outcome.notes));
    // What the wallet check said of the match that chose these shares, such as a fingerprint's.
    this.#result.append(
      ...ShareResultView.notes(outcome.warning === undefined ? [] : [outcome.warning]),
    );
    this.#offerShares(outcome.shares, outcome.form, mode === "seedshift", current);
    ShareActions.guard(this.#result, current);
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
      if (current())
        MnemoCodeDownload.text(
          this.#context,
          `${lines.join("\n")}\n`,
          ShareResultView.FILE_NAME,
          "text/plain",
        );
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
      ShareActions.clipboard(this.#context, current),
      shares.map((share) => `Share ${share.number}${holds}`),
      shares.map((share) => ShareResultView.apartCodes(share.text, share.format)),
      current,
    );
    this.#result.append(block);
  }
}

/**
 * The codes of `share`, a share written in `format`, apart where that form writes them joined, as
 * MnemoCode's command line shows a share: like the encoded phrase its form looks like.
 */

/** Composes the independent split, restore and repair operations and their self-test. */
export class MnemoCodeShareFeature {
  /** Install the selected share workspace, whose known answers join MnemoCode's self-test. */
  static install(this: void, context: RecoveryFeatureContext): void {
    mnemoCodeSelfTest.addShares();
    new MnemoCodeSplitSection(context);
    new MnemoCodeRestoreTab(context);
    new MnemoCodeShareRepair(context);
    showShareRepairTimes();
  }
}
/** Browser feature adapter retained for existing build composition. */
export const recoveryFeature: RecoveryFeature = { install: MnemoCodeShareFeature.install };

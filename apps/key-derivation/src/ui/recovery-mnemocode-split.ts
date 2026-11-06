import { RenderedSecrets } from "./secrets.js";
import { MnemoCodeDownload } from "./recovery-mnemocode-download.js";
import { MnemoCodeDisclosureFields } from "./recovery-mnemocode-disclosure.js";
import { MnemoCodeDisclosure } from "@ckd/recovery-backup/mnemocode-disclosure.js";
import { splitShares, type ShareMode } from "@ckd/recovery-backup/mnemocode-shares.js";
import {
  encodeMnemoCode,
  mnemoCodeDatesFor,
  type MnemoCodeFormat,
} from "@ckd/recovery-backup/mnemocode.js";
import { ShareBackupCheck } from "@ckd/recovery-backup/mnemocode-backup-check.js";
import {
  EncodedForm,
  Masking,
  PHRASE_WORDS,
  SHARE_FORMAT_NAMES,
  type MaskingMode,
  type ShareFormat,
} from "@ckd/recovery-backup/mnemocode-facts.js";
import { BackupCheckSection } from "./recovery-mnemocode-backup-check.js";
import { latestShares } from "./recovery-mnemocode-share-store.js";
import {
  OTHER_SET,
  ShareSetChoice,
  chosenSetValue,
  chosenShareSet,
} from "./recovery-mnemocode-share-choice.js";
import { InputRevision } from "./recovery-input-revision.js";
import {
  installSecretToggle,
  renderSensitiveShares,
  required,
  shownTextsIn,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";
import { ShareActions } from "./recovery-mnemocode-share-actions.js";
import { ShareResultView } from "./recovery-mnemocode-share-result-view.js";
import { SecretValue } from "@ckd/core/secret-value.js";
/** The share forms offered, in the command line's display order. */
const SHARE_FORMS: readonly ShareFormat[] = [
  "words",
  "ur",
  "indexes",
  "unicode",
  "colors",
  "colors-unicode",
];
/** Owns the Encode tab's split controls and the lifetime of its current share result. */
export class MnemoCodeSplitSection {
  readonly #context: RecoveryFeatureContext;
  readonly #mode = required<HTMLSelectElement>("#mnemocode-encode-mode");
  readonly #dates = required<HTMLTextAreaElement>("#mnemocode-encode-dates");
  readonly #form = required<HTMLSelectElement>("#mnemocode-split-form");
  readonly #save = required<HTMLButtonElement>("#mnemocode-split-save");
  readonly #status = required<HTMLElement>("#mnemocode-split-status");
  readonly #result = required<HTMLElement>("#mnemocode-split-result");
  /** The shares shown, for the text file; gone when anything changes. */
  #written: SecretValue<readonly string[]> | undefined;
  readonly #backupCheck = new BackupCheckSection("mnemocode-split", undefined);
  readonly #copy = required<HTMLInputElement>("#mnemocode-split-copy");
  readonly #disclosure = new MnemoCodeDisclosureFields();
  readonly #original = MnemoCodeDisclosureFields.installOriginal();
  readonly #inputs: InputRevision;
  #current: () => boolean = () => false;

  /** Bind one split operation to the common context and source lifetime. */
  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
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
    this.#inputs = ShareActions.inputs(section, context, () => this.#changed());
    for (const field of [
      this.#mode,
      this.#dates,
      required<HTMLTextAreaElement>("#mnemocode-source"),
      required<HTMLSelectElement>("#mnemocode-encode-format"),
      this.#disclosure.masked,
    ])
      if (!section.contains(field)) this.#inputs.watch(field);
    document.addEventListener("recovery-source-change", (event) => {
      if (event instanceof CustomEvent && event.detail === "mnemocode") this.#inputs.revise();
    });
    installSecretToggle(
      "#toggle-mnemocode-split-result",
      shownTextsIn("#mnemocode-split-result"),
      "Show split result",
      "Hide split result",
    );
    required<HTMLButtonElement>("#mnemocode-split").addEventListener(
      "click",
      () => void this.#split(),
    );
    this.#save.addEventListener("click", () => {
      if (!this.#current() || this.#written === undefined) return;
      const written = this.#written.value;
      if (written.length === 0) return;
      MnemoCodeDownload.text(
        this.#context,
        `${written.join("\n")}\n`,
        ShareResultView.FILE_NAME,
        "text/plain",
      );
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
    this.#written?.wipe();
    this.#written = undefined;
    latestShares.forget("split");
    required<HTMLElement>("#mnemocode-split-other").hidden = chosenSetValue() !== OTHER_SET;
    required<HTMLElement>("#mnemocode-split-copy-warning").hidden = !this.#copy.checked;
    RenderedSecrets.replace(this.#result);
    // Only this section's Show button: the records of Encode keep theirs.
    required<HTMLElement>("#mnemocode-split-section").dispatchEvent(
      new CustomEvent("secret-content-reset"),
    );
    this.#status.textContent = "";
    this.#status.classList.remove("warning");
    this.#save.hidden = true;
    this.#backupCheck.offer(undefined);
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
    if (!ShareActions.available(this.#context)) return;
    this.#inputs.revise();
    const current = ShareActions.capture(this.#inputs, this.#context);
    this.#current = current;
    try {
      const mode = this.#shareMode();
      const set = chosenShareSet();
      const form = this.#form.value as ShareFormat;
      const dates = this.#dates.value;
      const wholeCopy = this.#copy.checked;
      const originalCopy = MnemoCodeDisclosureFields.originalChoice(this.#original);
      const maskedWords = this.#disclosure.masked.checked;
      const wholeFormat = required<HTMLSelectElement>("#mnemocode-encode-format")
        .value as MnemoCodeFormat;
      // Snapshot every request and presentation choice before the first asynchronous turn.
      const request = {
        phrase: this.#context.readMnemonic("mnemocode", "#mnemocode-source"),
        mode,
        dates: mnemoCodeDatesFor(mode, dates),
        threshold: set.threshold,
        count: set.count,
        form,
      };
      const outcome = await this.#context.jobs.runHeavy("A MnemoCode share split", () =>
        Promise.resolve(splitShares(request)),
      );
      if (!current()) return;
      // The phrase the shares hold, and both fingerprints, are MnemoCode's encode of it, in a form
      // that every mode writes.
      const held = encodeMnemoCode(outcome.original, mode, "unicode", request.dates);
      const clipboard = ShareActions.clipboard(this.#context, current);
      const holds = Masking.of(mode).holds;
      renderSensitiveShares(
        this.#result,
        outcome.shares,
        clipboard,
        outcome.shares.map((_, index) => `Share ${index + 1} of ${set.count}, holds ${holds}`),
        outcome.shares.map((share) => ShareResultView.apartCodes(share, form)),
        current,
      );
      // MnemoCode's words for what the shares hold and for both fingerprints (PHRASE_WORDS).
      const fingerprints =
        `${PHRASE_WORDS.originalFingerprint} ${held.originalFingerprint}` +
        (mode === "seedshift"
          ? ` · ${PHRASE_WORDS.encodedFingerprint} ${held.encodedFingerprint ?? ""}. ${PHRASE_WORDS.fingerprintRoles}`
          : ".");
      this.#result.append(
        ...ShareResultView.notes([
          `The shares hold ${holds}. ${set.note}. ${SHARE_FORMAT_NAMES[form]}; each share was checked: together they restore it.`,
          `${fingerprints} ${ShareResultView.FINGERPRINT_NOTE}`,
        ]),
        ...(mode === "seedshift"
          ? ShareResultView.notes(
              [
                "Only the same dates turn the masked phrase back into the original seed phrase. Keep the dates: the shares do not store them.",
              ],
              "warning-callout",
            )
          : []),
      );
      // The whole phrase in Encode's representation, as MnemoCode's encode --sskr --format shows it.
      let alreadyShown: string | undefined;
      if (wholeCopy) {
        const copy = encodeMnemoCode(outcome.original, mode, wholeFormat, request.dates);
        renderSensitiveShares(
          this.#result,
          [copy.payload],
          clipboard,
          [
            mode === "seedshift"
              ? "Complete masked/decoy backup after Seedshift"
              : "Complete original wallet backup",
          ],
          [EncodedForm.of(copy.format).apartCodes(copy.payload)],
          current,
        );
        if (copy.format === "english") alreadyShown = copy.payload;
      }
      MnemoCodeDisclosureFields.render(
        this.#result,
        [
          ...MnemoCodeDisclosure.original(outcome.original, wholeFormat, originalCopy),
          ...MnemoCodeDisclosure.masked(held.shiftedEnglish, mode, maskedWords, alreadyShown),
        ],
        clipboard,
        current,
      );
      this.#written?.wipe();
      this.#written = SecretValue.utf16Texts(outcome.shares);
      this.#save.hidden = false;
      latestShares.shares = {
        records: outcome.records,
        form,
        masked: Masking.of(mode).masked,
        origin: "split",
      };
      this.#backupCheck.offer(
        new ShareBackupCheck({
          mnemonic: outcome.original,
          mode,
          threshold: set.threshold,
          dates: request.dates,
        }),
      );
      ShareActions.guard(this.#result, current);
      this.#status.textContent = `Split into ${set.count} shares.`;
    } catch (cause) {
      if (!current()) return;
      this.#status.classList.add("warning");
      this.#status.textContent = cause instanceof Error ? cause.message : "The split failed.";
    }
  }
}

// "Instructions for heirs" in MnemoCode's Encode tab: MnemoCode's sheet that tells heirs how to
// restore the backup, through this page. The words and the layout are MnemoCode's and the route
// through the page is recovery-mnemocode-heir-route.ts'; this module gives the facts of the backup
// chosen above: one encoded copy, or Shamir shares as "Split into Shamir shares" makes them. The
// sheet holds no secret. Encoded facts come from the choices; share-card code counts come from
// the retained split, before its decoys. Built with the card export, which draws PDFs.
import { BUILD_INFO } from "@ckd/build-info";
import { downloadBlob } from "@ckd/export/download.js";
import { readMnemoCodeCardAsset } from "@ckd/recovery-backup/mnemocode-card-assets.js";
import { createMnemoCodeCardPlatform } from "@ckd/recovery-backup/mnemocode-cards.js";
import { Share, ownShareCards } from "@ckd/recovery-backup/mnemocode-share-cards.js";
import { heirSheetSelfTest } from "../../../../packages/recovery-mnemocode/source/export/heir-sheet-self-test.js";
import {
  MnemoCodeHeirSheets,
  type HeirSheetFacts,
  type HeirSheetSize,
} from "@ckd/recovery-backup/mnemocode-heirs.js";
import {
  MNEMOCODE_PHRASE_WORD_COUNTS,
  mnemoCodeDatesFor,
  type MnemoCodeMode,
} from "@ckd/recovery-backup/mnemocode.js";
import type { RecordFormat } from "../../../../packages/recovery-mnemocode/source/record.js";
import { Masking } from "../../../../packages/recovery-mnemocode/source/core/masking.js";
import { ONE_GROUP } from "../../../../packages/recovery-mnemocode/source/sskr/share-platform.js";
import { shareFormatHasCards } from "../../../../packages/recovery-mnemocode/source/sskr/transport.js";
import type { RecoveryFeature } from "./recovery-feature.js";
import { InputRevision } from "./recovery-input-revision.js";
import { deriverHeirRoute } from "./recovery-mnemocode-heir-route.js";
import { chosenPhraseWords, installPhraseWordCounts } from "./recovery-mnemocode-fields.js";
import { chosenShareForm, chosenShareSet } from "./recovery-mnemocode-share-choice.js";
import { mnemoCodeSelfTest } from "./recovery-mnemocode-self-test.js";
import { latestShares } from "./recovery-mnemocode-share-store.js";
import { required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";

const STALE_SHEET =
  "The backup or settings changed while the sheet was drawn, so nothing was saved. Start the export again.";
const SPLIT_FIRST =
  "Split the phrase into shares with the current choices first, so the sheet can name their own codes before the decoys.";

class MnemoCodeHeirsSection {
  readonly #context: RecoveryFeatureContext;
  readonly #sheets = new MnemoCodeHeirSheets(deriverHeirRoute(BUILD_INFO), readMnemoCodeCardAsset);
  readonly #mode = required<HTMLSelectElement>("#mnemocode-encode-mode");
  readonly #format = required<HTMLSelectElement>("#mnemocode-encode-format");
  readonly #dates = required<HTMLTextAreaElement>("#mnemocode-encode-dates");
  readonly #size = required<HTMLSelectElement>("#mnemocode-heirs-size");
  /** The words of the phrase: the sheet says how many codes of the printed cards are its own. */
  readonly #words = required<HTMLSelectElement>("#mnemocode-heirs-words");
  readonly #status = required<HTMLElement>("#mnemocode-heirs-status");
  readonly #saveButton = required<HTMLButtonElement>("#mnemocode-heirs-save");
  readonly #inputs: InputRevision;
  #drawing = false;

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    installPhraseWordCounts(this.#words);
    this.#inputs = new InputRevision(required("#mnemocode-heirs-section"), () => {
      this.#status.classList.remove("warning");
      this.#status.textContent = this.#drawing ? STALE_SHEET : "";
    });
    for (const field of [this.#mode, this.#format, this.#dates, required("#mnemocode-source")])
      this.#inputs.watch(field);
    const split = document.querySelector("#mnemocode-split-section");
    if (split !== null) this.#inputs.watch(split);
    latestShares.onChange(() => this.#inputs.revise());
    this.#inputs.bindPageLifetime();
    document.addEventListener("recovery-source-change", (event) => {
      if (event instanceof CustomEvent && event.detail === "mnemocode") this.#inputs.revise();
    });
    const refreshButton = (): void => {
      this.#saveButton.disabled = !context.jobs.ready || context.jobs.runningJob !== null;
    };
    context.jobs.onChange((change) => {
      if (change === "ready" && !context.jobs.ready) this.#inputs.revise();
      refreshButton();
    });
    refreshButton();
    this.#saveButton.addEventListener("click", () => this.#save());
  }

  /** What the sheet says of the backup: its kind and form, its mode and how many dates. */
  #facts(): HeirSheetFacts {
    const mode = this.#mode.value as MnemoCodeMode;
    if (!MnemoCodeHeirSheets.supports(mode))
      throw new Error(
        "A backup whose last word was replaced has no sheet for heirs: only a search restores it.",
      );
    const dates = mnemoCodeDatesFor(mode, this.#dates.value).length;
    const shares =
      document.querySelector<HTMLInputElement>('input[name="mnemocode-heirs-backup"]:checked')
        ?.value === "shares";
    if (!shares)
      return {
        backup: {
          kind: "encoded",
          format: this.#format.value as RecordFormat,
          words: this.#phraseWords(),
        },
        mode: mode as HeirSheetFacts["mode"],
        dates,
      };
    const set = chosenShareSet();
    const form = chosenShareForm();
    Masking.assertSplitMode(mode);
    let codes: number | undefined;
    if (shareFormatHasCards(form)) {
      const held = latestShares.shares;
      const record = held?.records[0];
      // Repair/import results are not the split chosen above. Do not describe them with an
      // invented single-group quorum or a code count inferred from the phrase's word count.
      if (
        held?.origin !== "split" ||
        record === undefined ||
        held.form !== form ||
        held.masked !== Masking.of(mode).masked ||
        held.records.length !== set.count
      )
        throw new Error(SPLIT_FIRST);
      const { info } = Share.read(record);
      if (
        info.groupCount !== ONE_GROUP ||
        info.groupThreshold !== ONE_GROUP ||
        info.memberThreshold !== set.threshold
      )
        throw new Error(SPLIT_FIRST);
      codes = ownShareCards(record, form);
    }
    return {
      backup: {
        kind: "shares",
        format: form,
        threshold: set.threshold,
        count: set.count,
        ...(codes === undefined ? {} : { codes }),
      },
      mode: mode as HeirSheetFacts["mode"],
      dates,
    };
  }

  /**
   * The word count chosen, or that of the phrase typed above: the count is no secret, and only the
   * typed field is read, never a phrase linked from Generate & Derive.
   */
  #phraseWords(): (typeof MNEMOCODE_PHRASE_WORD_COUNTS)[number] {
    const typed = required<HTMLTextAreaElement>("#mnemocode-source").value.trim();
    const count = typed === "" ? 0 : typed.split(/\s+/u).length;
    const words =
      chosenPhraseWords(this.#words) ??
      MNEMOCODE_PHRASE_WORD_COUNTS.find((length) => length === count);
    if (words === undefined) throw new Error("Choose how many words the seed phrase has.");
    return words;
  }

  #save(): void {
    if (!this.#context.jobs.ready || this.#context.jobs.runningJob !== null) return;
    const current = this.#inputs.capture();
    void this.#context.jobs
      .runHeavy("MnemoCode instructions for heirs", async () => {
        this.#drawing = true;
        this.#status.classList.remove("warning");
        this.#status.textContent = "Drawing the sheet…";
        try {
          // Facts and size belong to one capture, including the chosen split and its metadata.
          const facts = this.#facts();
          const size = this.#size.value as HeirSheetSize;
          const sheet = await this.#sheets.render(facts, size);
          try {
            if (!current()) return;
            const bytes = new Uint8Array(sheet.bytes);
            try {
              downloadBlob(new Blob([bytes], { type: "application/pdf" }), sheet.fileName);
            } finally {
              bytes.fill(0);
            }
            if (current())
              this.#status.textContent = `Saved ${sheet.fileName}. It holds no secret: keep it apart from the backup.`;
          } finally {
            sheet.bytes.fill(0);
          }
        } finally {
          this.#drawing = false;
        }
      })
      .catch((cause: unknown) => {
        if (!current()) return;
        this.#status.classList.add("warning");
        this.#status.textContent = cause instanceof Error ? cause.message : String(cause);
      });
  }
}

export const recoveryFeature: RecoveryFeature = {
  install: (context) => {
    new MnemoCodeHeirsSection(context);
    // The sheet's checks join MnemoCode's self-test; its PDF needs the cards' render platform.
    mnemoCodeSelfTest.addFeature(
      heirSheetSelfTest(createMnemoCodeCardPlatform(readMnemoCodeCardAsset)),
    );
  },
};

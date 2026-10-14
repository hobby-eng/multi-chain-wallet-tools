import { downloadBlob } from "@ckd/export/download.js";
import { readMnemoCodeCardAsset } from "@ckd/recovery-backup/mnemocode-card-assets.js";
import {
  createMnemoCodeCardExporter,
  MNEMOCODE_CARD_FILE_FORMATS,
  MNEMOCODE_CARD_PAGE_SIZES,
  MNEMOCODE_CARD_TEMPLATES,
  MNEMOCODE_SAMPLE_WORD_COUNTS,
  mnemoCodeCardOutput,
  mnemoCodeShareCardLayout,
  mnemoCodeCardSavedNote,
  mnemoCodeCardSelfTest,
  createMnemoCodeCardRenderer,
  mnemoCodeCardTexts,
  mnemoCodeFormatHasCards,
  type MnemoCodeCardFile,
  type MnemoCodeCardProfile,
} from "@ckd/recovery-backup/mnemocode-cards.js";
import { cardSetsSelfTest } from "../../../../packages/recovery-mnemocode/source/export/card-sets-self-test.js";
import { shareFormatHasCards } from "../../../../packages/recovery-mnemocode/source/sskr/transport.js";
import type { CardCopyOverrides } from "../../../../packages/recovery-mnemocode/source/export/card-copy.js";
import { mnemoCodeDatesFor, type MnemoCodeMode } from "@ckd/recovery-backup/mnemocode.js";
import { cardPagesAsImages } from "./recovery-mnemocode-card-images.js";
import { mnemoCodeSelfTest } from "./recovery-mnemocode-self-test.js";
import { latestShares } from "./recovery-mnemocode-share-store.js";
import { required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";
import type { RecoveryFeature } from "./recovery-feature.js";
import { shareCardChecks } from "@ckd/recovery-backup/mnemocode-share-card-checks.js";
import { SHARE_FORMAT_NAMES } from "../../../../packages/recovery-mnemocode/source/sskr/share-set.js";
import { createQrAction } from "@ckd/ui/payment-qr.js";
import { InputRevision } from "./recovery-input-revision.js";
import { profileFields } from "../../../../packages/recovery-mnemocode/source/export/card-settings.js";

/** The texts around the cards, each with its field, as MnemoCode's card copy names them. */
const COPY_FIELDS: Readonly<Record<keyof CardCopyOverrides, string>> = {
  studioName: "#mnemocode-card-studio",
  slogan: "#mnemocode-card-slogan",
  subtitle: "#mnemocode-card-subtitle",
  footer: "#mnemocode-card-footer",
  referenceLabel: "#mnemocode-card-reference-label",
};
const COPY_KEYS = Object.keys(COPY_FIELDS) as (keyof CardCopyOverrides)[];

/** Said when any input of an export changes before its file is ready. */
const STALE_EXPORT =
  "The source or settings changed while the cards were drawn, so nothing was saved. Start the export again.";

function fillSelect(
  select: HTMLSelectElement,
  options: readonly { readonly id: string; readonly label: string }[],
): void {
  for (const { id, label } of options) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    select.append(option);
  }
}

/** The texts typed for the fields shown; a hidden field is not printed by this design. */
function ownCopy(): CardCopyOverrides {
  const entries: [keyof CardCopyOverrides, string][] = [];
  for (const key of COPY_KEYS) {
    const field = required<HTMLInputElement>(COPY_FIELDS[key]);
    const shown = field.closest<HTMLElement>("[hidden]") === null;
    if (shown && field.value.trim() !== "") entries.push([key, field.value]);
  }
  return Object.fromEntries(entries);
}

function profile(): MnemoCodeCardProfile {
  const entries: [string, string][] = [];
  for (const field of profileFields) {
    const value = required<HTMLInputElement>(`#mnemocode-card-${field}`).value.trim();
    if (value !== "") entries.push([field, value]);
  }
  return Object.fromEntries(entries);
}

/** Lets the browser show the progress text before rendering occupies the thread. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.requestAnimationFrame(() => globalThis.setTimeout(resolve, 0));
  });
}

function installMnemoCodeCards(context: RecoveryFeatureContext): void {
  mnemoCodeSelfTest.addCheck(mnemoCodeCardSelfTest(readMnemoCodeCardAsset));
  // Sets of cards: colors of codes, full rows and the decoys after a backup's codes.
  mnemoCodeSelfTest.addFeature(
    cardSetsSelfTest(createMnemoCodeCardRenderer(readMnemoCodeCardAsset)),
  );
  // The share cards are drawn by the same renderers, in a build with the SSKR library; their PDF
  // check needs the render platform, which the self-test may not have set yet.
  if (shareCardChecks !== undefined)
    mnemoCodeSelfTest.addFeature(
      shareCardChecks(createMnemoCodeCardRenderer(readMnemoCodeCardAsset)),
    );
  /** The phrase above, with the mode and dates of Encode, as its cards print it. */
  const phraseCard = () => {
    const mode = required<HTMLSelectElement>("#mnemocode-encode-mode").value as MnemoCodeMode;
    const dates = required<HTMLTextAreaElement>("#mnemocode-encode-dates").value;
    const format = required<HTMLSelectElement>("#mnemocode-encode-format").value;
    if (!mnemoCodeFormatHasCards(format))
      throw new Error("Select a color or Unicode representation to print cards.");
    return {
      mnemonic: context.readMnemonic("mnemocode", "#mnemocode-source"),
      mode,
      dates: mnemoCodeDatesFor(mode, dates),
      format,
    };
  };
  // Image conversion belongs to the same admitted job and input capture as its PDF renderer.
  let imageCurrent: () => boolean = () => false;
  const exporter = createMnemoCodeCardExporter(readMnemoCodeCardAsset, (pdf, format) =>
    cardPagesAsImages(pdf, format, imageCurrent),
  );
  const section = required<HTMLDetailsElement>("#mnemocode-cards-section");
  const representation = required<HTMLSelectElement>("#mnemocode-encode-format");
  // The shares of a split, as a choice of their own; absent from a build without SSKR.
  const sharesChoice = document.querySelector<HTMLInputElement>("#mnemocode-card-source-shares");
  const phraseChoice = document.querySelector<HTMLInputElement>("#mnemocode-card-source-phrase");
  // Shares in colors or in Unicode codes print as cards, one code to a card, or one QR card each
  // (MnemoCode's export/sskr-render.ts); word numbers, Bytewords and the UR have none.
  const shareQr = document.querySelector<HTMLInputElement>("#mnemocode-card-share-qr");
  const synchronizeVisibility = (): void => {
    const phraseCards = mnemoCodeFormatHasCards(representation.value);
    const shares = latestShares.shares;
    if (sharesChoice !== null && phraseChoice !== null) {
      const shareCards = shares !== undefined && shareFormatHasCards(shares.form);
      sharesChoice.disabled = !shareCards;
      const which = shares?.origin === "repair" ? "repaired shares" : "shares";
      required<HTMLElement>("#mnemocode-card-source-shares-note").textContent =
        shares === undefined
          ? "split the phrase into shares, or repair shares in Forgotten, first"
          : shareCards
            ? `${shares.records.length} ${which}, written as ${SHARE_FORMAT_NAMES[shares.form]}`
            : `${shares.records.length} ${which}, written as ${SHARE_FORMAT_NAMES[shares.form]}: shares in this form have no cards`;
      if (sharesChoice.disabled && sharesChoice.checked) phraseChoice.checked = true;
      phraseChoice.disabled = !phraseCards;
      if (phraseChoice.disabled && phraseChoice.checked && !sharesChoice.disabled)
        sharesChoice.checked = true;
    }
    // The QR alternative belongs to shares only.
    const printsShares = sharesChoice?.checked === true;
    const shareQrRow = document.querySelector<HTMLElement>("#mnemocode-card-share-qr-row");
    if (shareQrRow !== null) shareQrRow.hidden = !printsShares;
    // As MnemoCode's share commands: share cards take no collection title, and each sheet's QR
    // code holds its own share.
    required<HTMLElement>("#mnemocode-card-title-row").hidden = printsShares;
    required<HTMLElement>("#mnemocode-card-qr-text").textContent = printsShares
      ? "Add a QR code of its own share to each collection sheet"
      : "Add one QR code with the complete data to the sheet";
    if (shareQr !== null && sharesChoice?.checked !== true) shareQr.checked = false;
    section.hidden = !phraseCards && shares === undefined;
    // A hidden section is also closed, so it never reopens with stale choices.
    if (section.hidden) section.open = false;
  };
  representation.addEventListener("change", synchronizeVisibility);
  sharesChoice?.addEventListener("change", synchronizeVisibility);
  phraseChoice?.addEventListener("change", synchronizeVisibility);
  latestShares.onChange(synchronizeVisibility);
  synchronizeVisibility();
  const template = required<HTMLSelectElement>("#mnemocode-card-template");
  // The list is read from the embedded MnemoCode registry, in its own order.
  fillSelect(
    template,
    MNEMOCODE_CARD_TEMPLATES.map(({ id, name }, index) => ({
      id,
      label: `${index + 1} · ${name}`,
    })),
  );
  const pageSize = required<HTMLSelectElement>("#mnemocode-card-page-size");
  fillSelect(pageSize, MNEMOCODE_CARD_PAGE_SIZES);
  const fileFormat = required<HTMLSelectElement>("#mnemocode-card-file-format");
  fillSelect(fileFormat, MNEMOCODE_CARD_FILE_FORMATS);
  const qr = required<HTMLInputElement>("#mnemocode-card-qr");
  const qrRow = required<HTMLElement>("#mnemocode-card-qr-row");
  const title = required<HTMLInputElement>("#mnemocode-card-title");
  const outputNote = required<HTMLElement>("#mnemocode-card-output-note");
  const synchronizeOutput = (): void => {
    const printsShares = sharesChoice?.checked === true;
    const layout = printsShares
      ? mnemoCodeShareCardLayout(pageSize.value, shareQr?.checked === true ? "qr" : undefined)
      : mnemoCodeCardOutput(pageSize.value);
    const separate = layout === "individual";
    // A QR code belongs to a sheet only; a separate card never carries one.
    qrRow.hidden = separate || layout === "qr";
    if (qrRow.hidden) qr.checked = false;
    const file = { pdf: "PDF", png: "PNG image", jpg: "JPEG image" }[fileFormat.value] ?? "PDF";
    const corners =
      fileFormat.value === "png"
        ? " The corners outside the rounded edge of a card are transparent."
        : fileFormat.value === "jpg"
          ? " The corners outside the rounded edge of a card are white."
          : "";
    outputNote.textContent =
      layout === "qr"
        ? fileFormat.value === "pdf"
          ? "Each share is printed whole as a QR card; the cards are saved together in one PDF."
          : `Each whole-share QR card is saved as its own ${file}, all in one ZIP file.${corners}`
        : separate
          ? `Every card is saved as its own numbered ${file}, all in one ZIP file.${corners}`
          : printsShares
            ? fileFormat.value === "pdf"
              ? "One collection sheet per share, saved together in one PDF."
              : `One collection sheet per share, saved as ${file} files in one ZIP file.`
            : `All cards are placed on one sheet, saved as one ${file}.`;
    // Only the texts that this design prints in this output are asked for.
    const printed = mnemoCodeCardTexts(template.value, mnemoCodeCardOutput(pageSize.value));
    for (const key of COPY_KEYS)
      required<HTMLElement>(`#mnemocode-card-text-${key}-field`).hidden = !printed.includes(key);
  };
  pageSize.addEventListener("change", synchronizeOutput);
  fileFormat.addEventListener("change", synchronizeOutput);
  template.addEventListener("change", synchronizeOutput);
  sharesChoice?.addEventListener("change", synchronizeOutput);
  phraseChoice?.addEventListener("change", synchronizeOutput);
  shareQr?.addEventListener("change", synchronizeOutput);
  representation.addEventListener("change", synchronizeOutput);
  latestShares.onChange(synchronizeOutput);
  synchronizeOutput();

  const ownDetails = required<HTMLInputElement>("#mnemocode-card-own-details");
  const ownDetailsFields = required<HTMLElement>("#mnemocode-card-profile");
  const synchronizeOwnDetails = (): void => {
    ownDetailsFields.hidden = !ownDetails.checked;
  };
  ownDetails.addEventListener("change", synchronizeOwnDetails);
  synchronizeOwnDetails();

  const status = required<HTMLElement>("#mnemocode-cards-status");
  const qrImages = required<HTMLElement>("#mnemocode-cards-qr-images");
  let activeCurrent: (() => boolean) | undefined;
  const forgetQrImages = (): void => {
    qrImages.replaceChildren();
    qrImages.hidden = true;
  };
  const inputs = new InputRevision(section, () => {
    forgetQrImages();
    status.classList.remove("warning");
    status.textContent = activeCurrent === undefined ? "" : STALE_EXPORT;
  });
  for (const selector of [
    "#mnemocode-source",
    "#mnemocode-encode-mode",
    "#mnemocode-encode-dates",
    "#mnemocode-encode-format",
  ])
    inputs.watch(required(selector));
  inputs.bindPageLifetime();
  latestShares.onChange(() => {
    exporter.forgetDetails();
    inputs.revise();
  });
  // A settings edit invalidates output; a changed backup source forgets the invented identity.
  required<HTMLTextAreaElement>("#mnemocode-source").addEventListener("input", () =>
    exporter.forgetDetails(),
  );
  document.addEventListener("recovery-source-change", (event) => {
    if (event instanceof CustomEvent && event.detail === "mnemocode") {
      exporter.forgetDetails();
      inputs.revise();
    }
  });
  document.querySelector("#clear-all")?.addEventListener("click", () => exporter.forgetDetails());
  window.addEventListener("pagehide", () => exporter.forgetDetails());
  // Sample cards: public test data only, so they are drawn without the phrase above.
  const sampleWords = required<HTMLSelectElement>("#mnemocode-card-sample-words");
  fillSelect(
    sampleWords,
    MNEMOCODE_SAMPLE_WORD_COUNTS.map((words) => ({ id: String(words), label: `${words} words` })),
  );
  const sampleButton = required<HTMLButtonElement>("#mnemocode-card-sample");
  const button = required<HTMLButtonElement>("#export-mnemocode-cards");
  const refreshButtons = (): void => {
    const disabled = !context.jobs.ready || context.jobs.runningJob !== null;
    button.disabled = disabled;
    sampleButton.disabled = disabled;
  };
  context.jobs.onChange((change) => {
    if (change === "ready" && !context.jobs.ready) inputs.revise();
    refreshButtons();
  });
  refreshButtons();

  /** Read every setting and the selected source before the first asynchronous turn. */
  const captureRender = (sample: boolean): (() => Promise<MnemoCodeCardFile>) => {
    const settings = {
      template: template.value,
      pageSize: pageSize.value,
      orientation: required<HTMLSelectElement>("#mnemocode-card-orientation").value,
      qr: qr.checked,
      fileFormat: fileFormat.value,
      // Hidden fields are ignored, so unticking the box returns to the invented details.
      profile: ownDetails.checked ? profile() : {},
      copy: ownDetails.checked ? ownCopy() : {},
    };
    if (sample) {
      const request = {
        ...settings,
        template: required<HTMLInputElement>("#mnemocode-card-sample-all").checked
          ? ""
          : settings.template,
        words: Number(sampleWords.value),
        title: title.value,
      };
      return () => exporter.renderSamples(request);
    }
    const shares = sharesChoice?.checked === true ? latestShares.shares : undefined;
    if (shares !== undefined) {
      const request = {
        ...settings,
        records: [...shares.records],
        masked: shares.masked,
        shareFormat: shares.form,
        ...(shareQr?.checked === true ? { layout: "qr" as const } : {}),
      };
      return () => exporter.renderShares(request);
    }
    const request = { ...settings, ...phraseCard(), title: title.value };
    return () => exporter.render(request);
  };

  const publish = (file: MnemoCodeCardFile, sample: boolean, current: () => boolean): void => {
    if (!current()) return;
    const copy = new Uint8Array(file.bytes);
    try {
      // The shared download helper owns and revokes its object URL, including on click failure.
      downloadBlob(new Blob([copy], { type: file.mimeType }), file.fileName);
    } finally {
      copy.fill(0);
    }
    if (!current()) return;
    status.textContent = sample
      ? `Saved ${file.fileName}: sample cards with the public test phrase.`
      : mnemoCodeCardSavedNote(file);
    if (!sample) {
      qrImages.replaceChildren(
        ...(file.qrCodes ?? []).map((code) =>
          createQrAction(
            document,
            code.payload,
            code.reference === "cards" ? "the cards" : `share ${code.reference}`,
            code.payload,
            { heading: "QR code printed on the sheet", description: "Sensitive payload:" },
          ),
        ),
      );
      qrImages.hidden = qrImages.childElementCount === 0;
    }
  };

  const start = (sample: boolean): void => {
    // A refused second press must not replace the first job's input capture or status.
    if (!context.jobs.ready || context.jobs.runningJob !== null) return;
    const current = inputs.capture();
    void context.jobs
      .runHeavy(sample ? "MnemoCode sample cards" : "A MnemoCode card export", async () => {
        activeCurrent = current;
        imageCurrent = current;
        forgetQrImages();
        status.classList.remove("warning");
        status.textContent = sample ? "Drawing sample cards…" : "Rendering cards…";
        try {
          const render = captureRender(sample);
          await nextFrame();
          if (!current()) return;
          const file = await render();
          try {
            publish(file, sample, current);
          } finally {
            file.bytes.fill(0);
          }
        } finally {
          activeCurrent = undefined;
          imageCurrent = () => false;
        }
      })
      .catch((cause: unknown) => {
        if (!current()) return;
        status.classList.add("warning");
        status.textContent =
          cause instanceof Error
            ? cause.message
            : sample
              ? "Sample cards failed."
              : "Card export failed.";
      });
  };
  sampleButton.addEventListener("click", () => start(true));
  button.addEventListener("click", () => start(false));
}

export const recoveryFeature: RecoveryFeature = { install: installMnemoCodeCards };

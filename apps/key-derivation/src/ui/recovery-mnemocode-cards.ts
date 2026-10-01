import { downloadBlob } from "@ckd/export/download.js";
import { readMnemoCodeCardAsset } from "@ckd/recovery-backup/mnemocode-card-assets.js";
import {
  createMnemoCodeCardExporter,
  MNEMOCODE_CARD_FILE_FORMATS,
  MNEMOCODE_CARD_PAGE_SIZES,
  MNEMOCODE_CARD_TEMPLATES,
  mnemoCodeCardOutput,
  type MnemoCodeCardProfile,
} from "@ckd/recovery-backup/mnemocode-cards.js";
import { parseMnemoCodeDates, type MnemoCodeMode } from "@ckd/recovery-backup/mnemocode.js";
import { cardPagesAsPng } from "./recovery-mnemocode-card-images.js";
import { required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";

const PROFILE_FIELDS = [
  "name",
  "company",
  "role",
  "email",
  "phone",
  "website",
  "location",
] as const;

/** Cards print color codes, so they are offered only for the two color representations. */
const CARD_FORMATS: readonly string[] = ["colors", "colors-unicode"];

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

function profile(): MnemoCodeCardProfile {
  const entries: [string, string][] = [];
  for (const field of PROFILE_FIELDS) {
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

export function installMnemoCodeCards(context: RecoveryFeatureContext): void {
  const exporter = createMnemoCodeCardExporter(readMnemoCodeCardAsset, cardPagesAsPng);
  const section = required<HTMLDetailsElement>("#mnemocode-cards-section");
  const representation = required<HTMLSelectElement>("#mnemocode-encode-format");
  const synchronizeVisibility = (): void => {
    section.hidden = !CARD_FORMATS.includes(representation.value);
    // A hidden section is also closed, so it never reopens with stale choices.
    if (section.hidden) section.open = false;
  };
  representation.addEventListener("change", synchronizeVisibility);
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
  const outputNote = required<HTMLElement>("#mnemocode-card-output-note");
  const synchronizeOutput = (): void => {
    const separate = mnemoCodeCardOutput(pageSize.value) === "individual";
    // A QR code belongs to a sheet only; a separate card never carries one.
    qrRow.hidden = separate;
    if (separate) qr.checked = false;
    const image = fileFormat.value === "png";
    const file = image ? "PNG image" : "PDF";
    outputNote.textContent = separate
      ? `Every card is saved as its own numbered ${file}, all in one ZIP file.${
          image ? " The corners outside the rounded edge of a card are transparent." : ""
        }`
      : `All cards are placed on one sheet, saved as one ${file}.`;
  };
  pageSize.addEventListener("change", synchronizeOutput);
  fileFormat.addEventListener("change", synchronizeOutput);
  synchronizeOutput();

  const ownDetails = required<HTMLInputElement>("#mnemocode-card-own-details");
  const ownDetailsFields = required<HTMLElement>("#mnemocode-card-profile");
  const synchronizeOwnDetails = (): void => {
    ownDetailsFields.hidden = !ownDetails.checked;
  };
  ownDetails.addEventListener("change", synchronizeOwnDetails);
  synchronizeOwnDetails();

  // Another phrase gets another invented person; the same phrase keeps its details.
  required<HTMLTextAreaElement>("#mnemocode-source").addEventListener("input", () =>
    exporter.forgetDetails(),
  );
  document.addEventListener("recovery-source-change", (event) => {
    if (event instanceof CustomEvent && event.detail === "mnemocode") exporter.forgetDetails();
  });

  const status = required<HTMLElement>("#mnemocode-cards-status");
  const button = required<HTMLButtonElement>("#export-mnemocode-cards");
  button.addEventListener("click", () => {
    status.classList.remove("warning");
    status.textContent = "Rendering cards…";
    button.disabled = true;
    void (async () => {
      try {
        await nextFrame();
        const mode = required<HTMLSelectElement>("#mnemocode-encode-mode").value as MnemoCodeMode;
        const dates = required<HTMLTextAreaElement>("#mnemocode-encode-dates").value;
        const format = representation.value;
        if (!CARD_FORMATS.includes(format))
          throw new Error("Select a color representation to print cards.");
        const file = await exporter.render({
          mnemonic: context.readMnemonic("mnemocode", "#mnemocode-source"),
          mode,
          // Direct mode has no dates; text left in the hidden field is ignored.
          dates: mode === "direct" ? [] : parseMnemoCodeDates(dates),
          format: format === "colors-unicode" ? "colors-unicode" : "colors",
          template: template.value,
          pageSize: pageSize.value,
          orientation: required<HTMLSelectElement>("#mnemocode-card-orientation").value,
          qr: qr.checked,
          fileFormat: fileFormat.value,
          // Hidden fields are ignored, so unticking the box returns to the invented details.
          profile: ownDetails.checked ? profile() : {},
          studioName: ownDetails.checked
            ? required<HTMLInputElement>("#mnemocode-card-studio").value
            : "",
        });
        const copy = new Uint8Array(file.bytes);
        downloadBlob(new Blob([copy], { type: file.mimeType }), file.fileName);
        // The browser keeps the saved file; these copies of the recovery material are cleared.
        copy.fill(0);
        file.bytes.fill(0);
        const printed = `Printed for ${file.printed.name}, ${file.printed.company}.`;
        status.textContent =
          file.mimeType !== "application/zip"
            ? `Saved ${file.fileName}. ${printed} Print it at 100% size. The printed codes can restore the wallet; keep the file and the prints private.`
            : `Saved ${file.fileName} with ${file.cards} cards. ${printed} Every card is needed for recovery; keep the file and the prints private.`;
      } catch (cause) {
        status.classList.add("warning");
        status.textContent = cause instanceof Error ? cause.message : "Card export failed.";
      } finally {
        button.disabled = false;
      }
    })();
  });
}

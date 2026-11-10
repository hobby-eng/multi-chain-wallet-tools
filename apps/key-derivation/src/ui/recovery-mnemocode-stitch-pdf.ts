// A cross-stitch pattern's PDF read where a record is typed (Decode, Re-encode): MnemoCode keeps the
// legend line on the pattern's key page and reads it back (readStitchPdf), so that the legend need
// not be typed from the key. A PDF that another program saved again keeps none: then the legend is
// typed from the key, as MnemoCode's menu asks it.
import { MEBIBYTE } from "@ckd/core/byte-units.js";
import { correctedRowWarning, readStitchPdfLegend } from "@ckd/recovery-backup/mnemocode-stitch.js";
import { FileChoice } from "@ckd/ui/file-choice.js";

/** The largest pattern PDF the page reads; a pattern of 800 stitches high takes a few MiB. */
const MOST_PDF_BYTES = 64 * MEBIBYTE;
const NO_LEGEND =
  "This PDF keeps no legend line, as when another program saved it again: type the legend from the pattern's key.";

/**
 * Puts a button after `field` that reads a pattern's PDF and fills the field with the record of
 * the phrase its legend holds; `say` gives the page's answer, such as a row read as misread.
 */
export function installStitchPdfImport(
  field: HTMLTextAreaElement,
  say: (message: string) => void,
): void {
  const choice = FileChoice.create(document, "Open a cross-stitch pattern (PDF)", {
    accept: "application/pdf,.pdf",
  });
  field.after(...choice.elements);
  let revision = 0;
  choice.onChoose(() => {
    const file = choice.file;
    choice.clear();
    if (file === undefined || field.disabled) return;
    const current = ++revision;
    void (async () => {
      try {
        if (file.size === 0 || file.size > MOST_PDF_BYTES)
          throw new Error("A pattern PDF must be between 1 byte and 64 MiB.");
        const pdf = new Uint8Array(await file.arrayBuffer());
        if (current !== revision) return;
        const legend = readStitchPdfLegend(pdf);
        if (legend === undefined) {
          say(NO_LEGEND);
          return;
        }
        field.value = legend.record;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        say(
          legend.correctedRow === undefined
            ? "The legend line was read from the pattern."
            : correctedRowWarning(legend.correctedRow),
        );
      } catch (cause) {
        if (current === revision)
          say(cause instanceof Error ? cause.message : "The pattern could not be read.");
      }
    })();
  });
}

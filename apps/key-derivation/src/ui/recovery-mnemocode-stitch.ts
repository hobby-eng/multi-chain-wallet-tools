// The cross-stitch pattern of the Encode tab, as MnemoCode's `stitch` makes it (MnemoCode
// docs/SEEDSTITCH.md): the phrase above, masked with MnemoCode's Seedshift and the dates above, or
// with Direct the phrase itself, hidden in the legend of a pattern made from a picture, on the
// fabric and at the size chosen as MnemoCode's menu offers them: the sheets from A6 to A2 that hold
// the picture, or a width in centimetres or in stitches. MnemoCode's worker makes the pattern,
// about a second's work. A picture that cannot be used, or cannot hold the phrase, is answered as
// at MnemoCode's terminal: another picture or another size, with the phrase and dates kept.
import {
  asksForAnotherPicture,
  STITCH_FABRICS,
  STITCH_MODES,
  STITCH_PICTURE_BYTES,
  STITCH_PICTURE_TOO_LARGE,
  StitchSizeOffer,
  stitchFabricNote,
  type StitchMode,
  type StitchedPattern,
} from "@ckd/recovery-backup/mnemocode-stitch.js";
import { mnemoCodeDatesFor } from "@ckd/recovery-backup/mnemocode.js";
import type { MnemoCodeSearchRequest } from "../workers/mnemocode-search-worker.js";
import { MnemoCodeDownload } from "./recovery-mnemocode-download.js";
import { stegoHandoverButton } from "./recovery-mnemocode-stego.js";
import {
  clearShownResult,
  clearWithPage,
  failureText,
  SectionRevision,
  startSectionJob,
} from "./recovery-mnemocode-section-run.js";
import { MnemoCodeWorkerJob } from "./recovery-mnemocode-worker-job.js";
import {
  paragraph,
  renderSensitiveShares,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

declare const __MNEMOCODE_SEARCH_WORKER_SOURCE__: string;

const MODE_NOTE =
  "A pattern holds the phrase masked with MnemoCode Seedshift, or with Direct the phrase itself: choose one of those transformation modes above.";
/** MnemoCode's word for a pattern without Seedshift. */
const DIRECT_NOTE =
  "Direct is weak: the phrase is only disguised, and anyone with MnemoCode reads it from the legend.";
const ANOTHER_PICTURE =
  "Choose another picture or another size; the phrase and the dates stay as typed.";
/** The two choices after the sheets: a width typed in centimetres, or in stitches. */
const CENTIMETRES = "centimetres";
const STITCHES = "stitches";
/** File names that say nothing of what the pattern holds, as nothing on the pattern does. */
const PDF_NAME = "cross-stitch-pattern.pdf";
const LEGEND_NAME = "cross-stitch-legend.txt";

export class MnemoCodeStitchSection {
  readonly #context: RecoveryFeatureContext;
  readonly #mode = required<HTMLSelectElement>("#mnemocode-encode-mode");
  readonly #dates = required<HTMLTextAreaElement>("#mnemocode-encode-dates");
  readonly #picture = required<HTMLInputElement>("#mnemocode-stitch-picture");
  readonly #fabric = required<HTMLSelectElement>("#mnemocode-stitch-fabric");
  readonly #size = required<HTMLSelectElement>("#mnemocode-stitch-size");
  readonly #sizeLabel = required<HTMLElement>("#mnemocode-stitch-size-label");
  readonly #sizeNote = required<HTMLElement>("#mnemocode-stitch-size-note");
  readonly #widthRow = required<HTMLElement>("#mnemocode-stitch-width-row");
  readonly #widthLabel = required<HTMLElement>("#mnemocode-stitch-width-label");
  readonly #width = required<HTMLInputElement>("#mnemocode-stitch-width");
  readonly #modeNote = required<HTMLElement>("#mnemocode-stitch-mode-note");
  readonly #status = required<HTMLElement>("#mnemocode-stitch-status");
  readonly #result = required<HTMLElement>("#mnemocode-stitch-result");
  readonly #toggle = required<HTMLButtonElement>("#toggle-mnemocode-stitch-result");
  readonly #job = new MnemoCodeWorkerJob<MnemoCodeSearchRequest, StitchedPattern>(
    __MNEMOCODE_SEARCH_WORKER_SOURCE__,
    {
      button: required<HTMLButtonElement>("#mnemocode-stitch-make"),
      cancel: required<HTMLButtonElement>("#mnemocode-stitch-stop"),
      status: this.#status,
    },
  );
  /** The PDF of the pattern shown; it holds the legend, so it is wiped with it. */
  #pdf: Uint8Array | undefined;
  /** The sizes of the picture on the fabric chosen; freed when either changes. */
  #sizes: StitchSizeOffer | undefined;
  /** Counts the changes of the inputs, which reading the picture file may straddle. */
  readonly #revision = new SectionRevision();
  /** Counts the pictures and fabrics chosen, which reading the sizes may straddle. */
  #sizesRevision = 0;

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    for (const fabric of STITCH_FABRICS)
      this.#fabric.append(
        new Option(`${fabric.name} · ${stitchFabricNote(fabric)}`, fabric.option),
      );
    this.#mode.addEventListener("change", () => this.#showMode());
    this.#showMode();
    // A pattern shown for other inputs would be mistaken for the current one.
    const fields = [
      required<HTMLTextAreaElement>("#mnemocode-source"),
      this.#dates,
      this.#mode,
      this.#picture,
      this.#fabric,
      this.#size,
      this.#width,
    ];
    for (const field of fields)
      for (const type of ["input", "change"]) field.addEventListener(type, () => this.#clear());
    for (const field of [this.#picture, this.#fabric])
      field.addEventListener("change", () => void this.#readSizes());
    this.#size.addEventListener("change", () => this.#showWidth());
    document.addEventListener("recovery-source-change", (event) => {
      if (event instanceof CustomEvent && event.detail === "mnemocode") this.#clear();
    });
    clearWithPage(() => this.#clear());
    required<HTMLButtonElement>("#mnemocode-stitch-make").addEventListener("click", () =>
      this.#start(),
    );
  }

  /** The mode of the Encode tab, where a pattern takes it. */
  #stitchMode(): StitchMode | undefined {
    return (STITCH_MODES as readonly string[]).includes(this.#mode.value)
      ? (this.#mode.value as StitchMode)
      : undefined;
  }

  #showMode(): void {
    const mode = this.#stitchMode();
    this.#modeNote.hidden = mode === "seedshift";
    this.#modeNote.textContent = mode === "direct" ? DIRECT_NOTE : MODE_NOTE;
  }

  /** Reads the sizes of the picture on the fabric chosen, and offers them. */
  async #readSizes(): Promise<void> {
    const revision = ++this.#sizesRevision;
    this.#sizes?.[Symbol.dispose]();
    this.#sizes = undefined;
    this.#size.replaceChildren();
    this.#size.disabled = true;
    this.#widthRow.hidden = true;
    const file = this.#picture.files?.item(0) ?? null;
    const fabric = STITCH_FABRICS.find((choice) => choice.option === this.#fabric.value);
    this.#sizeLabel.textContent = `How large, on ${fabric?.name ?? "the fabric"}?`;
    if (file === null) {
      this.#sizeNote.textContent = "Choose a picture to see the sizes it allows.";
      return;
    }
    try {
      if (file.size > STITCH_PICTURE_BYTES) throw new Error(STITCH_PICTURE_TOO_LARGE);
      const picture = new Uint8Array(await file.arrayBuffer());
      if (revision !== this.#sizesRevision) return;
      const sizes = new StitchSizeOffer(picture, this.#fabric.value);
      this.#sizes = sizes;
      sizes.sheets.forEach((sheet, at) =>
        this.#size.append(new Option(`${sheet.label} · ${sheet.note}`, String(at))),
      );
      this.#size.append(
        new Option(`Width in centimetres · ${sizes.centimetreRange}`, CENTIMETRES),
        new Option(`Stitches across · ${sizes.stitchRange}`, STITCHES),
      );
      this.#size.value = String(sizes.first ?? CENTIMETRES);
      this.#size.disabled = false;
      this.#sizeNote.textContent = sizes.detailNote;
      this.#showWidth();
    } catch (cause) {
      if (revision !== this.#sizesRevision) return;
      const message = cause instanceof Error ? cause.message : "The picture could not be read.";
      this.#sizeNote.textContent = asksForAnotherPicture(cause)
        ? `${message} ${ANOTHER_PICTURE}`
        : message;
    }
  }

  #showWidth(): void {
    const sizes = this.#sizes;
    const typed = this.#size.value === CENTIMETRES || this.#size.value === STITCHES;
    this.#widthRow.hidden = sizes === undefined || !typed;
    if (sizes === undefined || !typed) return;
    this.#widthLabel.textContent =
      this.#size.value === CENTIMETRES
        ? `Width in centimetres (${sizes.centimetreRange})`
        : `How many stitches across? (${sizes.stitchRange})`;
  }

  #clear(): void {
    this.#revision.next();
    this.#job.revise();
    this.#pdf?.fill(0);
    this.#pdf = undefined;
    clearShownResult(this.#status, this.#result, this.#toggle);
  }

  #start(): void {
    startSectionJob({
      context: this.#context,
      status: this.#status,
      revision: this.#revision,
      label: "A cross-stitch pattern",
      clear: () => this.#clear(),
      work: (current) => this.#make(current),
      say: (cause) => {
        const message = failureText(cause, "The pattern could not be made.");
        return asksForAnotherPicture(cause) ? `${message} ${ANOTHER_PICTURE}` : message;
      },
    });
  }

  /** The stitches across of the size chosen, or of the width typed within the picture's widths. */
  #stitchesAcross(): number {
    const sizes = this.#sizes;
    if (sizes === undefined) throw new Error("Choose a picture: a PNG, JPEG or WebP file.");
    if (this.#size.value === CENTIMETRES) {
      const across = sizes.typedCentimetres(this.#width.value);
      if (across === undefined)
        throw new Error(`Type a number of centimetres from ${sizes.centimetreRange}.`);
      return across;
    }
    if (this.#size.value === STITCHES) {
      const across = sizes.typedStitches(this.#width.value);
      if (across === undefined) throw new Error(`Type a number from ${sizes.stitchRange}.`);
      return across;
    }
    const sheet = sizes.sheets[Number(this.#size.value)];
    if (sheet === undefined) throw new Error("Choose how large the pattern is.");
    return sheet.across;
  }

  async #make(current: () => boolean): Promise<void> {
    const mode = this.#stitchMode();
    if (mode === undefined) throw new Error(MODE_NOTE);
    const file = this.#picture.files?.item(0) ?? null;
    if (file === null) throw new Error("Choose a picture: a PNG, JPEG or WebP file.");
    if (file.size > STITCH_PICTURE_BYTES)
      throw new Error(`${STITCH_PICTURE_TOO_LARGE} ${ANOTHER_PICTURE}`);
    const stitchesAcross = this.#stitchesAcross();
    // The phrase and the dates are read before the first asynchronous turn.
    const phrase = this.#context.readMnemonic("mnemocode", "#mnemocode-source");
    const dates = mode === "direct" ? "" : (mnemoCodeDatesFor(mode, this.#dates.value) ?? "");
    const fabric = this.#fabric.value;
    this.#status.textContent = "Reading the picture…";
    const picture = new Uint8Array(await file.arrayBuffer());
    if (!current()) return;
    const done = await this.#job.run(
      { type: "stitch", phrase, dates, picture, stitchesAcross, mode, fabric },
      () => "Making the pattern…",
      "Making the pattern…",
    );
    if (done === undefined) return;
    if (!current()) {
      done.outcome.pdf.fill(0);
      return;
    }
    this.#show(done.outcome, done.elapsed);
  }

  #show(pattern: StitchedPattern, elapsed: string): void {
    this.#pdf = pattern.pdf;
    this.#status.textContent = `Pattern made in ${elapsed}.`;
    this.#result.append(
      paragraph(
        `${pattern.rows} rows · ${pattern.width} by ${pattern.height} stitches, ${pattern.moved} moved to set the counts · ` +
          `${pattern.seenDifference.toFixed(1)} apart from the picture, seen from a little distance.`,
        "field-note",
      ),
    );
    const actions = renderSensitiveShares(
      this.#result,
      [pattern.legend],
      this.#context.writeClipboard,
      ["Legend, as Decode reads it back"],
      [],
      () => this.#context.jobs.ready,
    );
    const save = (label: string, download: () => void): HTMLButtonElement => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secret-action compact secret-copy-action";
      button.textContent = label;
      button.disabled = true;
      button.addEventListener("click", download);
      return button;
    };
    actions.append(
      save("Save pattern (PDF)", () => {
        if (this.#pdf !== undefined)
          MnemoCodeDownload.bytes(this.#pdf, "application/pdf", PDF_NAME);
      }),
      save("Save legend", () =>
        MnemoCodeDownload.text(this.#context, `${pattern.legend}\n`, LEGEND_NAME, "text/plain"),
      ),
      // As MnemoCode's stitch asks last: also hide the legend line in a photo or MP3.
      stegoHandoverButton(() => ({ kind: "message", text: pattern.legend })),
    );
    this.#result.append(
      paragraph(
        "Decode reads the legend back from the PDF, or as typed from the key: each row's symbol number, a colon and its stitches, from the top of the legend. " +
          (this.#stitchMode() === "direct"
            ? "Anyone who knows the format can read a legend made with Direct."
            : "Anyone who knows the format can read a legend, so only the dates keep the phrase: keep them apart from the pattern."),
        "field-note",
      ),
    );
  }
}

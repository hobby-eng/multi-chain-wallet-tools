// The cross-stitch pattern of the Encode tab, as MnemoCode's `stitch` makes it (MnemoCode
// docs/SEEDSTITCH.md): the phrase above, masked with MnemoCode's Seedshift and the dates above,
// hidden in the legend of a pattern made from a picture. MnemoCode's worker makes the pattern,
// about a second's work. A picture that cannot be used, or cannot hold the phrase, is answered as
// at MnemoCode's terminal: another picture or another width, with the phrase and dates kept.
import {
  asksForAnotherPicture,
  STITCH_PICTURE_BYTES,
  STITCH_PICTURE_TOO_LARGE,
  STITCHES_ACROSS,
  type StitchedPattern,
} from "@ckd/recovery-backup/mnemocode-stitch.js";
import { mnemoCodeDatesFor } from "@ckd/recovery-backup/mnemocode.js";
import type { MnemoCodeSearchRequest } from "../workers/mnemocode-search-worker.js";
import { MnemoCodeDownload } from "./recovery-mnemocode-download.js";
import { MnemoCodeWorkerJob } from "./recovery-mnemocode-worker-job.js";
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";
import {
  paragraph,
  renderSensitiveShares,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";
import { RenderedSecrets } from "./secrets.js";

declare const __MNEMOCODE_SEARCH_WORKER_SOURCE__: string;

/** The mode whose masking a pattern holds. */
const STITCH_MODE = "seedshift";
const MODE_NOTE =
  "A pattern holds the phrase masked with MnemoCode Seedshift: choose that transformation mode above and type the dates.";
const ANOTHER_PICTURE =
  "Choose another picture or other stitches across; the phrase and the dates stay as typed.";
const WIDTH_OUT_OF_RANGE = `A pattern is ${STITCHES_ACROSS.min} to ${STITCHES_ACROSS.max} stitches wide.`;
/** File names that say nothing of what the pattern holds, as nothing on the pattern does. */
const PDF_NAME = "cross-stitch-pattern.pdf";
const LEGEND_NAME = "cross-stitch-legend.txt";

export class MnemoCodeStitchSection {
  readonly #context: RecoveryFeatureContext;
  readonly #mode = required<HTMLSelectElement>("#mnemocode-encode-mode");
  readonly #dates = required<HTMLTextAreaElement>("#mnemocode-encode-dates");
  readonly #picture = required<HTMLInputElement>("#mnemocode-stitch-picture");
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
  /** Counts the changes of the inputs, which reading the picture file may straddle. */
  #revision = 0;

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    this.#width.min = String(STITCHES_ACROSS.min);
    this.#width.max = String(STITCHES_ACROSS.max);
    this.#modeNote.textContent = MODE_NOTE;
    this.#mode.addEventListener("change", () => this.#showMode());
    this.#showMode();
    // A pattern shown for other inputs would be mistaken for the current one.
    const fields = [
      required<HTMLTextAreaElement>("#mnemocode-source"),
      this.#dates,
      this.#mode,
      this.#picture,
      this.#width,
    ];
    for (const field of fields)
      for (const type of ["input", "change"]) field.addEventListener(type, () => this.#clear());
    document.addEventListener("recovery-source-change", (event) => {
      if (event instanceof CustomEvent && event.detail === "mnemocode") this.#clear();
    });
    document.querySelector("#clear-all")?.addEventListener("click", () => this.#clear());
    window.addEventListener("pagehide", () => this.#clear());
    required<HTMLButtonElement>("#mnemocode-stitch-make").addEventListener("click", () =>
      this.#start(),
    );
  }

  #showMode(): void {
    this.#modeNote.hidden = this.#mode.value === STITCH_MODE;
  }

  #clear(): void {
    this.#revision += 1;
    this.#job.revise();
    this.#pdf?.fill(0);
    this.#pdf = undefined;
    this.#status.classList.remove("warning");
    this.#status.textContent = "";
    RenderedSecrets.replace(this.#result);
    RecoverySecretLifecycle.concealControl(this.#toggle);
  }

  #start(): void {
    if (!this.#context.jobs.ready || this.#context.jobs.runningJob !== null) return;
    this.#clear();
    const revision = this.#revision;
    const current = (): boolean => revision === this.#revision;
    void this.#context.jobs
      .runHeavy("A cross-stitch pattern", () => this.#make(current))
      .catch((cause: unknown) => {
        if (!current()) return;
        const message = cause instanceof Error ? cause.message : "The pattern could not be made.";
        this.#status.classList.add("warning");
        this.#status.textContent = asksForAnotherPicture(cause)
          ? `${message} ${ANOTHER_PICTURE}`
          : message;
      });
  }

  /** The stitches across as typed, refused in MnemoCode's words outside its range. */
  #stitchesAcross(): number {
    const width = Number(this.#width.value.trim());
    if (
      this.#width.value.trim() === "" ||
      !Number.isInteger(width) ||
      width < STITCHES_ACROSS.min ||
      width > STITCHES_ACROSS.max
    )
      throw new Error(WIDTH_OUT_OF_RANGE);
    return width;
  }

  async #make(current: () => boolean): Promise<void> {
    if (this.#mode.value !== STITCH_MODE) throw new Error(MODE_NOTE);
    const file = this.#picture.files?.item(0) ?? null;
    if (file === null) throw new Error("Choose a picture: a PNG or JPEG file.");
    if (file.size > STITCH_PICTURE_BYTES)
      throw new Error(`${STITCH_PICTURE_TOO_LARGE} ${ANOTHER_PICTURE}`);
    const stitchesAcross = this.#stitchesAcross();
    // The phrase and the dates are read before the first asynchronous turn.
    const phrase = this.#context.readMnemonic("mnemocode", "#mnemocode-source");
    const dates = mnemoCodeDatesFor(STITCH_MODE, this.#dates.value) ?? "";
    this.#status.textContent = "Reading the picture…";
    const picture = new Uint8Array(await file.arrayBuffer());
    if (!current()) return;
    const done = await this.#job.run(
      { type: "stitch", phrase, dates, picture, stitchesAcross },
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
    );
    this.#result.append(
      paragraph(
        "Decode reads the legend back: each row's symbol number, a colon and its stitches, from the top of the legend. " +
          "Anyone who knows the format can read a legend, so only the dates keep the phrase: keep them apart from the pattern.",
        "field-note",
      ),
    );
  }
}

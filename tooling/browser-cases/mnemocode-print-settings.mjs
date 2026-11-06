import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { MnemoCodeCapabilityCatalogsCase } from "./mnemocode-capability-catalogs.mjs";
import { CardImageReadback } from "../browser-regressions/card-image-readback.mjs";

// ISO 216 sheet dimensions in millimetres; independent of the production layout calculation.
const SHEETS = { a6: [105, 148], a5: [148, 210], a4: [210, 297] };
const POINTS_PER_MM = 72 / 25.4;
// ISO 216 at 300 dpi, keeping only fully covered pixels (document-formats.ts contract).
// Independent literal values: floor(mm / 25.4 * 300), including A4's 3507 complete rows.
const SHEET_PIXELS = { a6: [1240, 1748], a5: [1748, 2480], a4: [2480, 3507] };

/** Draw every installed design and exercise each sheet size/orientation through native PDF export. */
export class MnemoCodePrintSettingsCase {
  /** PDF designs and page settings, A6 raster output, and the two instruction-sheet sizes. */
  static async run(context, profile, run, openWithLinkedPhrase, waitText) {
    const page = await this.#open(context, profile, run, openWithLinkedPhrase);
    await page.locator("#mnemocode-card-file-format").selectOption("pdf");
    await page.locator("#mnemocode-card-page-size").selectOption("a6");
    await page.locator("#mnemocode-card-orientation").selectOption("portrait");
    await page.locator("#mnemocode-card-qr").check();
    for (const template of MnemoCodeCapabilityCatalogsCase.templates) {
      await page.locator("#mnemocode-card-template").selectOption(template);
      const bytes = await this.#download(
        page,
        "#mnemocode-card-sample",
        "#mnemocode-cards-status",
        waitText,
      );
      await this.#pdf(bytes, SHEETS.a6, template);
      console.log(`CHECK MnemoCode template ${template}: ${bytes.length} PDF bytes`);
    }
    await page.locator("#mnemocode-card-template").selectOption("business-it");
    for (const [size, dimensions] of Object.entries(SHEETS)) {
      await page.locator("#mnemocode-card-page-size").selectOption(size);
      for (const orientation of ["portrait", "landscape"]) {
        await page.locator("#mnemocode-card-orientation").selectOption(orientation);
        const bytes = await this.#download(
          page,
          "#export-mnemocode-cards",
          "#mnemocode-cards-status",
          waitText,
        );
        await this.#pdf(
          bytes,
          orientation === "portrait" ? dimensions : dimensions.toReversed(),
          `${size}/${orientation}`,
        );
      }
    }
    // Automatic orientation is a separate supported answer; the plan chooses its dimensions.
    await page.locator("#mnemocode-card-orientation").selectOption("");
    const automatic = await this.#download(
      page,
      "#export-mnemocode-cards",
      "#mnemocode-cards-status",
      waitText,
    );
    const auto = await PDFDocument.load(automatic);
    const dimensions = auto.getPage(0).getSize();
    assert.deepEqual(
      [dimensions.width, dimensions.height]
        .toSorted((a, b) => a - b)
        .map((n) => Math.round(n / POINTS_PER_MM)),
      SHEETS.a4,
    );

    await page.locator("#mnemocode-card-page-size").selectOption("a6");
    await page.locator("#mnemocode-card-orientation").selectOption("portrait");
    for (const format of ["png", "jpg"]) {
      await page.locator("#mnemocode-card-file-format").selectOption(format);
      const bytes = await this.#download(
        page,
        "#export-mnemocode-cards",
        "#mnemocode-cards-status",
        waitText,
      );
      assert.deepEqual(await CardImageReadback.size(page, bytes, format), SHEET_PIXELS.a6, format);
    }

    await page.locator("#mnemocode-heirs-section > summary").click();
    // Instruction sheets take public facts and do not read the linked private source.
    await page.locator("#mnemocode-heirs-words").selectOption("12");
    for (const size of ["a5", "a6"]) {
      await page.locator("#mnemocode-heirs-size").selectOption(size);
      const bytes = await this.#download(
        page,
        "#mnemocode-heirs-save",
        "#mnemocode-heirs-status",
        waitText,
      );
      const pdf = await PDFDocument.load(bytes);
      assert.equal(pdf.getPageCount(), 2, `Heirs ${size}`);
      await this.#pdf(bytes, SHEETS[size], `Heirs ${size}`);
    }
    assert.deepEqual(run.requests, []);
    run.checks.push(
      "Thirteen designs as A6 PDF; A6/A5/A4 PDF in both orientations and planned A4; A6 portrait PNG/JPEG; A5/A6 two-page heir PDFs.",
    );
  }

  /** Check every sheet size/orientation in both raster formats and every design as PNG. */
  static async rasterSettings(context, profile, run, openWithLinkedPhrase, waitText) {
    const jobs = [];
    for (const size of Object.keys(SHEETS))
      for (const orientation of ["portrait", "landscape"])
        for (const format of ["png", "jpg"])
          jobs.push({ size, orientation, format, template: "business-it" });
    for (const template of MnemoCodeCapabilityCatalogsCase.templates)
      if (template !== "business-it")
        jobs.push({ size: "a6", orientation: "portrait", format: "png", template });
    assert.equal(jobs.length, 24);
    for (const { size, orientation, format, template } of jobs) {
      const page = await this.#open(context, profile, run, openWithLinkedPhrase);
      try {
        await page.locator("#mnemocode-card-template").selectOption(template);
        await page.locator("#mnemocode-card-page-size").selectOption(size);
        await page.locator("#mnemocode-card-orientation").selectOption(orientation);
        await page.locator("#mnemocode-card-file-format").selectOption(format);
        const bytes = await this.#download(
          page,
          "#export-mnemocode-cards",
          "#mnemocode-cards-status",
          waitText,
        );
        const expected = SHEET_PIXELS[size];
        const label = `${template}/${size}/${orientation}/${format}`;
        assert.deepEqual(
          await CardImageReadback.size(page, bytes, format),
          orientation === "portrait" ? expected : expected.toReversed(),
          label,
        );
        console.log(`CHECK MnemoCode raster ${label}: ${bytes.length} bytes`);
      } finally {
        await page.close();
      }
    }
    assert.deepEqual(run.requests, []);
    run.checks.push(
      "All sheet sizes/orientations in PNG and JPEG, plus PNG for all thirteen designs; 24 native image decodes with independent pixel dimensions.",
    );
  }

  static async #open(context, profile, run, openWithLinkedPhrase) {
    const { page } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
    await page.locator("#mnemocode-encode-format").selectOption("colors");
    await page.locator("#mnemocode-cards-section > summary").click();
    return page;
  }

  static async #download(page, button, status, waitText) {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120000 }),
      page.locator(button).click(),
    ]);
    const path = await download.path();
    assert.ok(path);
    const bytes = readFileSync(path);
    await download.delete();
    await waitText(page, status, /^Saved /u);
    return bytes;
  }

  static async #pdf(bytes, expected, label) {
    assert.equal(bytes.subarray(0, 5).toString("latin1"), "%PDF-", label);
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() > 0, label);
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      assert.deepEqual(
        [width, height].map((n) => Math.round(n / POINTS_PER_MM)),
        expected,
        label,
      );
    }
  }
}

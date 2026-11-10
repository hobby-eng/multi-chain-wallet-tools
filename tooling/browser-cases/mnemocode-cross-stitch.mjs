import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { BrowserFixtures } from "../browser-regressions/fixtures.mjs";

// The public BIP39 test phrase of the fixtures, MnemoCode's published date example and synthetic
// pictures only.
const DATES = "23-09-2026";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An RGB PNG file of 400 by 300 pixels, each coloured by `pixel`. */
function png(pixel, width = 400, height = 300) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) rows.set(pixel(x, y), y * (width * 3 + 1) + 1 + x * 3);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const SMOOTH = png((x, y) => [
  Math.round((255 * x) / 400),
  Math.round(128 + 127 * Math.sin(y / 17 + x / 29)),
  Math.round((255 * y) / 300),
]);
const FLAT = png(() => [90, 120, 150]);

/**
 * `line` with one row's stitches changed by one: a row of 1000 stitches or more that is not the
 * biggest, whose last two digits the legend reads, so that only a correction reads it.
 */
function mistyped(line) {
  const rows = line.split(" ").map((row) => row.split(":").map(Number));
  const biggest = Math.max(...rows.map(([, stitches]) => stitches));
  const at = rows.findIndex(([, stitches]) => stitches >= 1000 && stitches < biggest - 1);
  assert.notEqual(at, -1, "setup: the legend has a row of 1000 stitches or more");
  rows[at][1] += 1;
  return { line: rows.map((row) => row.join(":")).join(" "), row: at + 1 };
}

/** Encode's cross-stitch pattern, made in MnemoCode's worker, saved and read back by Decode. */
export class MnemoCodeCrossStitchCase {
  static async run(context, profile, run, openSeedShiftEncoding, waitText) {
    const { page } = await openSeedShiftEncoding(context, profile, run);
    await page.locator("#mnemocode-stitch-section summary").click();
    const make = page.locator("#mnemocode-stitch-make");
    const status = "#mnemocode-stitch-status";
    const picture = page.locator("#mnemocode-stitch-picture");

    await make.click();
    await waitText(page, status, /^Choose a picture: a PNG, JPEG or WebP file\.$/u);
    // A flat picture cannot hold the phrase: another picture is asked for, and what was typed stays.
    await picture.setInputFiles({ name: "flat.png", mimeType: "image/png", buffer: FLAT });
    await page.locator("#mnemocode-stitch-size:not([disabled])").waitFor();
    await make.click();
    await waitText(page, status, /Choose another picture or another size/u);
    assert.equal(await page.locator("#mnemocode-encode-dates").inputValue(), DATES);
    await picture.setInputFiles({ name: "smooth.png", mimeType: "image/png", buffer: SMOOTH });
    // MnemoCode's sizes for the picture on 14-count Aida: the sheets, then a width typed.
    const size = page.locator("#mnemocode-stitch-size");
    await size
      .locator("option", { hasText: /^A\d, / })
      .first()
      .waitFor({ state: "attached" });
    assert.match(
      await page.locator("#mnemocode-stitch-size-note").innerText(),
      /^More stitches give more detail: a photograph looks real from about \d+ across\.$/u,
    );
    await size.selectOption("stitches");
    await page.locator("#mnemocode-stitch-width").fill("39");
    await make.click();
    await waitText(page, status, /^Type a number from \d+ to \d+\.$/u);
    await page.locator("#mnemocode-stitch-width").fill("200");
    await make.click();
    await waitText(page, status, /^Pattern made in /u);

    const legend = page.locator("#mnemocode-stitch-result article .share-secret");
    assert.match((await legend.getAttribute("class")) ?? "", /\bconcealed\b/u);
    assert.match(
      await page.locator("#mnemocode-stitch-result").innerText(),
      /\d+ rows · 200 by 150 stitches, \d+ moved to set the counts/u,
    );
    const savePdf = page
      .locator("#mnemocode-stitch-result button")
      .filter({ hasText: "Save pattern (PDF)" });
    assert.equal(await savePdf.isDisabled(), true);
    await page.locator("#toggle-mnemocode-stitch-result").click();
    const line = ((await legend.textContent()) ?? "").trim();
    assert.match(line, /^\d+:\d+(?: \d+:\d+)+$/u);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      savePdf.click(),
    ]);
    assert.equal(download.suggestedFilename(), "cross-stitch-pattern.pdf");
    const pdf = readFileSync(await download.path());
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
    // Other dates retire the pattern shown.
    await page.locator("#mnemocode-encode-dates").fill("24-09-2026");
    assert.equal(await page.locator("#mnemocode-stitch-result article").count(), 0);

    // Decode reads the legend back, one row mistyped, with the dates; the mode selected is not used.
    const typed = mistyped(line);
    await page.locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]').click();
    await page.locator("#mnemocode-decode-mode").selectOption("direct");
    await page.locator("#mnemocode-input").fill(typed.line);
    await waitText(
      page,
      "#mnemocode-decode-record-note",
      new RegExp(`^SeedStitch legend · .* Row ${typed.row} of the legend did not fit;`, "u"),
    );
    await page.locator("#mnemocode-decode-dates").fill(DATES);
    await page.locator("#decode-mnemocode").click();
    const output = page.locator("#mnemocode-decode-result textarea");
    await output.waitFor();
    assert.equal(await output.inputValue(), BrowserFixtures.mnemonic);

    // The saved PDF keeps the legend line on its key page: Decode reads it from the file.
    await page
      .locator(
        '#mnemocode-decode-panel label.file-choice:has-text("Open a cross-stitch pattern (PDF)") input',
      )
      .setInputFiles({
        name: "cross-stitch-pattern.pdf",
        mimeType: "application/pdf",
        buffer: pdf,
      });
    await waitText(
      page,
      "#mnemocode-decode-result",
      /The legend line was read from the pattern\./u,
    );
    assert.match(await page.locator("#mnemocode-input").inputValue(), /^MNC1:seedshift:indexes:/u);
    await page.locator("#decode-mnemocode").click();
    await output.waitFor();
    assert.equal(await output.inputValue(), BrowserFixtures.mnemonic);
    assert.deepEqual(run.requests, []);
    run.checks.push(
      "Encode's cross-stitch pattern is made in MnemoCode's worker from a synthetic picture on the sizes MnemoCode offers, asks for another picture where one cannot hold the phrase, saves its PDF, and Decode reads its legend back from the PDF and as typed with one row corrected and named.",
    );
  }
}

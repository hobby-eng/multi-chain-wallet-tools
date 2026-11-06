const hasPoppler = spawnSync("pdftocairo", ["-v"]).error === undefined;
const CARD_IMAGE_DPI = 300;
const LARGEST_AVERAGE_DIFFERENCE = 2;
const STRONG_DIFFERENCE = 96;
const LARGEST_SHARE_OF_STRONG_DIFFERENCES = 0.0005;
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import upngModule from "@pdf-lib/upng";
import { unzipSync } from "fflate";
import decodeQr from "qr/decode.js";
import { BrowserHarness } from "./host.mjs";
import { CardImageReadback } from "./card-image-readback.mjs";
const { openSeedShiftEncoding, waitText, storageSnapshot } = BrowserHarness;

if (process.env.BROWSER_REQUIRE_POPPLER === "1")
  assert.equal(hasPoppler, true, "The requested independent Poppler image oracle must run.");

function pngPixels(bytes) {
  const upng = upngModule.default ?? upngModule;
  const image = upng.decode(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return { width: image.width, height: image.height, data: new Uint8Array(upng.toRGBA8(image)[0]) };
}

function popplerPixels(pdf, width, height) {
  const directory = mkdtempSync(join(tmpdir(), "card-image-"));
  try {
    writeFileSync(join(directory, "card.pdf"), pdf);
    execFileSync("pdftocairo", [
      "-png",
      "-transp",
      "-singlefile",
      "-r",
      String(CARD_IMAGE_DPI),
      "-x",
      "0",
      "-y",
      "0",
      "-W",
      String(width),
      "-H",
      String(height),
      join(directory, "card.pdf"),
      join(directory, "card"),
    ]);
    return pngPixels(readFileSync(join(directory, "card.png")));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function assertSamePicture(image, expected, label) {
  assert.deepEqual([image.width, image.height], [expected.width, expected.height], label);
  let sum = 0;
  let strong = 0;
  for (let pixel = 0; pixel < image.data.length; pixel += 4) {
    let largest = 0;
    // Red, green, blue and opacity.
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(image.data[pixel + channel] - expected.data[pixel + channel]);
      sum += difference;
      largest = Math.max(largest, difference);
    }
    if (largest > STRONG_DIFFERENCE) strong += 1;
  }
  const average = sum / image.data.length;
  const share = strong / (image.data.length / 4);
  assert.ok(
    average < LARGEST_AVERAGE_DIFFERENCE,
    `${label} differs from the PDF by ${average.toFixed(2)} on average`,
  );
  assert.ok(
    share < LARGEST_SHARE_OF_STRONG_DIFFERENCES,
    `${label} differs strongly from the PDF in ${(share * 100).toFixed(3)}% of its pixels`,
  );
}

function alphaAt(image, x, y) {
  return image.data[(y * image.width + x) * 4 + 3];
}

async function mnemocodeCardImages(page, save, pdfArchive) {
  await page.locator("#mnemocode-card-file-format").selectOption("png");
  assert.match(
    await page.locator("#mnemocode-card-output-note").innerText(),
    /own numbered PNG image/u,
  );
  const archive = await save();
  assert.equal(archive.name, "cards-business.zip");
  const documents = unzipSync(new Uint8Array(pdfArchive));
  const images = unzipSync(new Uint8Array(archive.bytes));
  assert.deepEqual(
    Object.keys(images),
    Object.keys(documents).map((name) => name.replace(/\.pdf$/u, ".png")),
  );
  for (const [name, bytes] of Object.entries(images)) {
    const card = pngPixels(bytes);
    // 90 x 50 mm at 300 dpi, in whole pixels.
    assert.deepEqual([card.width, card.height], [1062, 590], name);
    // The corners outside the rounded edge are transparent, the card itself is not.
    for (const [x, y] of [
      [0, 0],
      [card.width - 1, 0],
      [0, card.height - 1],
      [card.width - 1, card.height - 1],
    ])
      assert.equal(alphaAt(card, x, y), 0, `${name} corner`);
    assert.equal(alphaAt(card, card.width >> 1, card.height >> 1), 255, `${name} centre`);
    assert.equal(alphaAt(card, card.width >> 1, 0), 255, `${name} top edge`);
    if (hasPoppler) {
      const expected = popplerPixels(
        documents[name.replace(/\.png$/u, ".pdf")],
        card.width,
        card.height,
      );
      assertSamePicture(card, expected, name);
    }
  }

  await page.locator("#mnemocode-card-file-format").selectOption("jpg");
  const jpegArchive = await save();
  assert.equal(jpegArchive.name, "cards-business.zip");
  const jpegs = unzipSync(new Uint8Array(jpegArchive.bytes));
  assert.deepEqual(
    Object.keys(jpegs),
    Object.keys(documents).map((name) => name.replace(/\.pdf$/u, ".jpg")),
  );
  for (const [name, bytes] of Object.entries(jpegs)) {
    const size = await CardImageReadback.size(page, Buffer.from(bytes), "jpg");
    assert.deepEqual(size, [1062, 590], name);
  }

  // A sheet with a QR code: the code in the image must read like the code in the PDF.
  await page.locator("#mnemocode-card-file-format").selectOption("png");
  await page.locator("#mnemocode-card-page-size").selectOption("a6");
  await page.locator("#mnemocode-card-qr").check();
  const sheet = await save();
  assert.equal(sheet.name, "cards-a6.png");
  const pixels = pngPixels(sheet.bytes);
  assert.deepEqual([pixels.width, pixels.height], [1748, 1240]);
  const data = decodeQr(pixels);
  assert.match(data, /^#[0-9A-F]{6}( #[0-9A-F]{6})+$/u);
  if (hasPoppler) {
    await page.locator("#mnemocode-card-file-format").selectOption("pdf");
    const expected = popplerPixels((await save()).bytes, pixels.width, pixels.height);
    assert.equal(decodeQr(expected), data);
    assertSamePicture(pixels, expected, "The sheet");
  }
  await page.locator("#mnemocode-card-qr").uncheck();

  // The material templates use photographs stored as JPEG, which the browser decodes. A sheet
  // takes the orientation with the larger tiles, so its two sides are checked in either order.
  const template = page.locator("#mnemocode-card-template");
  const chosen = await template.inputValue();
  await template.selectOption("material-vehicle");
  await page.locator("#mnemocode-card-file-format").selectOption("png");
  const material = pngPixels((await save()).bytes);
  assert.deepEqual(
    [material.width, material.height].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
    [1240, 1748],
  );
  if (hasPoppler) {
    await page.locator("#mnemocode-card-file-format").selectOption("pdf");
    assertSamePicture(
      material,
      popplerPixels((await save()).bytes, material.width, material.height),
      "The material sheet",
    );
  }
  await template.selectOption(chosen);

  // The scenario continues with separate PDF cards.
  await page.locator("#mnemocode-card-file-format").selectOption("pdf");
  await page.locator("#mnemocode-card-page-size").selectOption("business");
}

async function mnemocodeCards(context, profile, run) {
  const { page, before } = await openSeedShiftEncoding(context, profile, run);

  await cardControls(page);

  const save = async () => {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.locator("#export-mnemocode-cards").click(),
    ]);
    const bytes = readFileSync(await download.path());
    await waitText(page, "#mnemocode-cards-status", /^Saved /u);
    return { name: download.suggestedFilename(), bytes };
  };

  await page.locator("#mnemocode-card-template").selectOption({ index: 1 });
  await page.locator("#mnemocode-card-page-size").selectOption("a4");
  await page.locator("#mnemocode-card-qr").check();
  // Without own details MnemoCode invents a person for the cards, kept for the working session.
  assert.equal(await page.locator("#mnemocode-card-profile").isVisible(), false);
  await save();
  await page.locator("#mnemocode-card-page-size").selectOption("a6");
  await save();
  await page.locator("#mnemocode-card-page-size").selectOption("a4");

  // Own details replace the invented ones; empty fields keep their invented value.
  await page.locator("#mnemocode-card-own-details").check();
  assert.equal(await page.locator("#mnemocode-card-profile").isVisible(), true);
  await page.locator("#mnemocode-card-name").fill("John Smith");
  const sheet = await save();
  assert.equal(sheet.name, "cards-a4.pdf");
  assert.equal(sheet.bytes.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(sheet.bytes.length > 50_000, "The sheet must contain the embedded artwork.");

  // A card size means separate cards: no QR option, one numbered PDF per card.
  assert.equal(await page.locator("#mnemocode-card-output").count(), 0);
  await page.locator("#mnemocode-card-page-size").selectOption("business");
  assert.equal(await page.locator("#mnemocode-card-qr-row").isVisible(), false);
  assert.equal(await page.locator("#mnemocode-card-qr").isChecked(), false);
  assert.match(await page.locator("#mnemocode-card-output-note").innerText(), /own numbered PDF/u);
  const archive = await save();
  assert.equal(archive.name, "cards-business.zip");
  await page.locator("#mnemocode-card-page-size").selectOption("a6");
  assert.equal(await page.locator("#mnemocode-card-qr-row").isVisible(), true);
  await page.locator("#mnemocode-card-page-size").selectOption("business");
  assert.equal(archive.bytes.subarray(0, 2).toString("latin1"), "PK");
  // Eight codes, one a card, then at least one decoy (MnemoCode's plan of separate cards).
  const separateCards = Object.keys(unzipSync(new Uint8Array(archive.bytes)));
  assert.ok(separateCards.length > 8, "separate cards end with decoys");
  assert.ok(separateCards.every((name) => name.endsWith(".pdf")));
  await mnemocodeCardImages(page, save, archive.bytes);

  await page.locator("#mnemocode-card-name").fill("1234");
  await page.locator("#export-mnemocode-cards").click();
  await waitText(page, "#mnemocode-cards-status", /Latin letters/u);
  assert.equal(await page.locator("#export-mnemocode-cards").isDisabled(), false);
  // Unticking the box ignores the fields and returns to the invented person.
  await page.locator("#mnemocode-card-own-details").uncheck();
  await save();

  await page.locator("#mnemocode-encode-format").selectOption("english");
  assert.equal(await page.locator("#mnemocode-cards-section").isVisible(), false);
  assert.equal(await page.locator("#export-mnemocode-cards").isVisible(), false);

  // The Decode tab explains its options in the same way.
  const helpText = async (id) =>
    (await page.locator(`#${id} .recovery-help-popover`).textContent()) ?? "";
  await page.locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]').click();
  assert.match(await helpText("mnemocode-decode-format-help"), /never guesses/u);
  await page.locator("#mnemocode-decode-format").selectOption("colors");
  assert.match(await helpText("mnemocode-decode-format-help"), /packed into colors/u);
  await page.locator("#mnemocode-decode-mode").selectOption("seedshift");
  assert.match(await helpText("mnemocode-decode-mode-help"), /move every word back/u);
  // Forgotten asks what is forgotten, as MnemoCode's menu does.
  await page.locator('[data-operation-tab][aria-controls="mnemocode-forgotten-panel"]').click();
  assert.equal(await page.locator('input[name="mnemocode-forgotten-kind"]').count(), 4);
  // Codes typed where the words are asked for are pointed to Decode, which reads them.
  const codesNotWords =
    /^These are the codes of an encoded seed phrase, not its words: Decode reads them/u;
  // The Unicode codes of the public test phrase, the last one unreadable.
  await page
    .locator("#mnemocode-forgotten-phrase")
    .fill(`${Array.from({ length: 11 }, () => "7684").join(" ")} ?`);
  await waitText(page, "#mnemocode-forgotten-count", codesNotWords);
  await page.locator("#mnemocode-forgotten-wallet-none").check();
  await page.locator("#mnemocode-forgotten-search").click();
  await waitText(page, "#mnemocode-forgotten-status", codesNotWords);
  await page.locator("#mnemocode-forgotten-phrase").fill("");
  // An unreadable code of an encoded seed phrase is searched in Decode, where codes are read.
  await page.locator("#mnemocode-forgotten-kind-code").check();
  assert.equal(await page.locator("#mnemocode-forgotten-search-fields").isVisible(), false);
  await page.locator("#mnemocode-forgotten-open-decode").click();
  await page.locator("#mnemocode-decode-panel").waitFor({ state: "visible" });
  await page.locator('[data-operation-tab][aria-controls="mnemocode-forgotten-panel"]').click();
  await page.locator("#mnemocode-forgotten-kind-word").check();

  assert.deepEqual(await storageSnapshot(page), before);
  assert.deepEqual(run.requests, []);
  run.checks.push(
    "Separate PDF/PNG/JPEG cards; exact native JPEG sizes; QR sheets and export refusals.",
  );
  if (hasPoppler)
    run.checks.push("PNG card and sheet pixels compared with independent Poppler PDF rendering.");
}

/** Cohesive cards cases; helpers stay private to this module. */
export class MnemoCodeCardBrowserCases {
  /** Shared mnemocodeCards boundary for the native browser cases. */
  static mnemocodeCards = mnemocodeCards;
}

async function cardControls(page) {
  // "How it works" follows the selected option, opens on hover and stays open after a click.
  const formatHelp = page.locator("#mnemocode-format-help");
  await page.locator("#mnemocode-encode-format").selectOption("unicode");
  await formatHelp.locator("summary").hover();
  await page.waitForFunction(() =>
    document.querySelector("#mnemocode-format-help")?.hasAttribute("open"),
  );
  assert.match(
    await formatHelp.locator(".recovery-help-popover").innerText(),
    /Traditional Chinese BIP39 list/u,
  );
  await formatHelp.locator("summary").click();
  await page.locator("#mnemocode-panel h2").hover();
  assert.equal(await formatHelp.getAttribute("open"), "");
  await page.locator("#mnemocode-encode-format").selectOption("indexes");
  assert.match(await formatHelp.locator(".recovery-help-popover").innerText(), /from 1 to 2048/u);
  await page.keyboard.press("Escape");
  assert.equal(await formatHelp.getAttribute("open"), null);
  // The mode popover is closed here, so its text is read without requiring it to be visible.
  assert.match(
    (await page.locator("#mnemocode-mode-help .recovery-help-popover").textContent()) ?? "",
    /sorted from the oldest/u,
  );

  // Cards print colors or Unicode codes, so the section exists only for those representations.
  for (const format of ["english", "indexes"]) {
    await page.locator("#mnemocode-encode-format").selectOption(format);
    assert.equal(await page.locator("#mnemocode-cards-section").isVisible(), false);
  }
  for (const format of ["unicode", "colors-unicode"]) {
    await page.locator("#mnemocode-encode-format").selectOption(format);
    assert.equal(await page.locator("#mnemocode-cards-section").isVisible(), true);
  }
  await page.locator("#mnemocode-encode-format").selectOption("colors");
  await page.locator("#mnemocode-cards-section > summary").click();

  // The list comes from the embedded MnemoCode registry.
  assert.equal(await page.locator("#mnemocode-card-template option").count(), 13);
  assert.deepEqual(
    await page
      .locator("#mnemocode-card-page-size option")
      .evaluateAll((options) => options.map((o) => o.value)),
    ["a6", "a5", "a4", "business"],
  );
  assert.deepEqual(
    await page
      .locator("#mnemocode-card-file-format option")
      .evaluateAll((options) => options.map((o) => o.value)),
    ["pdf", "png", "jpg"],
  );
}

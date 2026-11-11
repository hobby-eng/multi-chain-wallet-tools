import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { syntheticQrPng } from "../../test/support/synthetic-png.mjs";

// The public BIP39 test phrase, linked from Generate & Derive, and a synthetic contact: a made-up
// name, a domain reserved for examples (RFC 2606) and a London number that Ofcom keeps for drama.
const DIGITS = `${"0000".repeat(11)}0003`;
/** The phrase's CompactSeedQR: its 128 bits of entropy are all zero. */
const COMPACT_ZEROS = Array.from({ length: 16 }, () => 0);
const CONTACT = {
  name: "Ana Ruiz",
  organisation: "Ruiz, Cole; Studio",
  phone: "+44 20 7946 0000",
  email: "ana@ruiz.example",
};
// The vCard 3.0 of that contact, written by hand from RFC 2426.
const VCARD = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:;Ana Ruiz;;;",
  "FN:Ana Ruiz",
  "ORG:Ruiz\\, Cole\\; Studio",
  "TEL:+44 20 7946 0000",
  "EMAIL:ana@ruiz.example",
  "END:VCARD",
].join("\r\n");
const KINDS = [
  "Contact card",
  "Website",
  "Plain text",
  "Wi-Fi network",
  "Email",
  "Phone number",
  "Location",
];
/** A MnemoCode record of the same public phrase: a hidden record, but no SeedQR. */
const OTHER_RECORD = "MNC1:direct:indexes:1 1 1 1 1 1 1 1 1 1 1 4";
const NOT_SEEDQR =
  "This QR's hidden record is not a Standard SeedQR. A hidden QR of a MnemoCode backup opens in the MnemoCode tab.";
const TOO_LARGE =
  "A hidden record is read only from a PNG of at most 4096 pixels a side and 2 megapixels: use the original PNG, or a crop of the QR.";
const NO_SEEDQR_UNREAD = `This QR image holds no SeedQR. ${TOO_LARGE}`;
/** The note under a field after an import whose hidden record went unread. */
const READ_AS_ORDINARY = `Read as an ordinary QR code. ${TOO_LARGE}`;
/**
 * A phone screenshot's size, 1179 by 2556 pixels (3 megapixels): within the page's 8, beyond
 * MnemoCode's 2. Its QR is drawn 16 pixels a module.
 */
const screenshot = (payload) => Buffer.from(syntheticQrPng(payload, 1179, 2556, 16));
/** A QR written by another encoder than MnemoCode's, 10 pixels a module. */
const small = (payload) => Buffer.from(syntheticQrPng(payload, 330, 330, 10));

/** MnemoCode's own WebAssembly in this Node process, to make the PNGs that the page is given. */
async function mnemoCodeInNode() {
  const base = new URL(
    "../../packages/recovery-mnemocode-wasm/generated/multi-chain/key-derivation/",
    import.meta.url,
  );
  const glue = await import(new URL("mnemocode.js", base).href);
  glue.initSync({ module: new WebAssembly.Module(readFileSync(new URL("mnemocode.wasm", base))) });
  return glue;
}

/** `text` as a whole-text pattern for waitText. */
const exactly = (text) => new RegExp(`^${text.replaceAll(".", "\\.")}$`, "u");

/**
 * The SeedQR tab's hidden form: Encode hides the Standard SeedQR of the public phrase behind a
 * contact card, refuses an empty name and a decoy too long for one QR, and saves MnemoCode's PNG;
 * Decode imports that PNG and restores the phrase from its hidden record, refuses a hidden record
 * that is no SeedQR, still reads ordinary SeedQR images (MnemoCode's, another encoder's numeric
 * and binary ones, and a screenshot above MnemoCode's 2 megapixels), and says why a large decoy
 * gives no SeedQR. MnemoCode's Decode reads an ordinary record QR above 2 megapixels too. Nothing
 * is stored or sent.
 */
export class SeedQrHiddenCase {
  static async run(context, profile, run, openWithLinkedPhrase, waitText, storageSnapshot) {
    const { page, before } = await openWithLinkedPhrase(context, profile, run, "seedqr");
    const png = await SeedQrHiddenCase.#encode(page, waitText);
    await SeedQrHiddenCase.#decode(page, waitText, png);
    await SeedQrHiddenCase.#mnemoCodeDecode(page);
    assert.deepEqual(await storageSnapshot(page), before);
    assert.deepEqual(run.requests, []);
    run.checks.push(
      "Hidden SeedQR: vCard decoy, CompactSeedQR closed, empty-name and capacity refusals, saved PNG read back to the phrase, a record that is no SeedQR refused, ordinary SeedQR images (numeric, binary, 3 MP) still read, a large decoy's unread record named; a 3 MP MnemoCode record QR read",
    );
  }

  static async #encode(page, waitText) {
    const result = "#seedqr-create-result";
    await page.locator("#seedqr-qr-form-hidden").check();
    await page.locator("#seedqr-decoy").waitFor();
    assert.equal(await page.locator("#seedqr-format").inputValue(), "standard");
    assert.equal(await page.locator('#seedqr-format option[value="compact"]').isDisabled(), true);
    const note = await page.locator("#seedqr-hidden-note").innerText();
    assert.match(note, /^A hidden QR is camouflage, not encryption: /u);
    // MnemoCode's note without its masking dates, which a SeedQR has none of.
    assert.match(note, /Never put private information in the visible text\./u);
    assert.doesNotMatch(note, /dates/u);
    assert.match(
      await page.locator("#seedqr-decoy").innerText(),
      /SeedSigner and other wallets cannot read the SeedQR: they show the decoy or reject the code\./u,
    );
    assert.deepEqual(await page.locator("#seedqr-decoy-kind option").allTextContents(), KINDS);
    assert.match(
      await page.locator('label[for="seedqr-decoy-contact-title"]').innerText(),
      /^Job title/u,
    );
    await page.locator("#create-seedqr").click();
    await waitText(page, result, /^Fill in the decoy's name\.$/u);

    await page.locator("#seedqr-decoy-kind").selectOption("text");
    await page.locator("#seedqr-decoy-text-text").fill("x".repeat(2400));
    await page.locator("#create-seedqr").click();
    await waitText(
      page,
      result,
      /^The visible text and hidden record do not fit in one QR code\.$/u,
    );

    await page.locator("#seedqr-decoy-kind").selectOption("contact");
    for (const [name, value] of Object.entries(CONTACT))
      await page.locator(`#seedqr-decoy-contact-${name}`).fill(value);
    await page.locator("#create-seedqr").click();
    const card = page.locator(`${result} article`);
    await card.waitFor();
    assert.equal(await card.locator(".decoy-text").textContent(), VCARD);
    const record = card.locator(".share-secret");
    assert.match((await record.getAttribute("class")) ?? "", /\bconcealed\b/u);
    const save = card.locator("button", { hasText: "Save PNG" });
    assert.equal(await save.isDisabled(), true);
    await page.locator("#toggle-seedqr-created").click();
    assert.equal(await record.textContent(), DIGITS);
    const [download] = await Promise.all([page.waitForEvent("download"), save.click()]);
    assert.equal(download.suggestedFilename(), "contact-qr.png");
    const png = readFileSync(await download.path());
    assert.equal(png.subarray(1, 4).toString("latin1"), "PNG");

    // An edit of the decoy takes the result away; the ordinary form opens CompactSeedQR again.
    await page.locator("#seedqr-decoy-contact-title").fill("Designer");
    assert.equal(await card.count(), 0);
    await page.locator("#seedqr-qr-form-ordinary").check();
    assert.equal(await page.locator("#seedqr-decoy").isHidden(), true);
    assert.equal(await page.locator('#seedqr-format option[value="compact"]').isDisabled(), false);
    return png;
  }

  static async #decode(page, waitText, png) {
    const restore = "#seedqr-restore-result";
    const payload = page.locator("#seedqr-payload");
    const format = page.locator("#seedqr-restore-format");
    const chooser = page.locator("#seedqr-payload + .file-choice input[type=file]");
    const note = page.locator("#seedqr-restore-panel .qr-import-note");
    await page.locator('[data-operation-tab][aria-controls="seedqr-restore-panel"]').click();
    const importPng = async (name, buffer) => {
      await payload.fill("");
      await chooser.setInputFiles({ name, mimeType: "image/png", buffer });
    };
    const imported = async (name, expected, expectedFormat) => {
      await page.waitForFunction(() => document.querySelector("#seedqr-payload").value !== "");
      assert.equal(await payload.inputValue(), expected, name);
      assert.equal(await format.inputValue(), expectedFormat, name);
    };

    await format.selectOption("compact");
    await importPng("contact-qr.png", png);
    await imported("contact-qr.png", DIGITS, "standard");
    await page.locator("#restore-seedqr").click();
    const phrase = page.locator(`${restore} textarea`);
    await phrase.waitFor();
    assert.equal(await phrase.inputValue(), `${"abandon ".repeat(11)}about`);

    const mnemocode = await mnemoCodeInNode();
    await importPng("other-qr.png", Buffer.from(mnemocode.hiddenQrPng(VCARD, OTHER_RECORD)));
    await waitText(page, restore, exactly(NOT_SEEDQR));
    assert.equal(await payload.inputValue(), "");

    // Ordinary SeedQRs in which MnemoCode finds no hidden record, or which it does not admit.
    // Only the screenshot's hidden record goes unread, and a note under the field says so.
    for (const [name, buffer, expected, expectedFormat, unread] of [
      ["mnemocode-qr.png", Buffer.from(mnemocode.qrPng(DIGITS)), DIGITS, "standard", false],
      ["numeric-qr.png", small(DIGITS), DIGITS, "standard", false],
      ["compact-qr.png", small(COMPACT_ZEROS), "00".repeat(16), "compact", false],
      ["screenshot-qr.png", screenshot(DIGITS), DIGITS, "standard", true],
    ]) {
      await format.selectOption(expectedFormat === "compact" ? "standard" : "compact");
      await importPng(name, buffer);
      await imported(name, expected, expectedFormat);
      assert.equal(await note.isVisible(), unread, name);
      if (unread) assert.equal(await note.textContent(), READ_AS_ORDINARY, name);
    }

    // A decoy above 2 megapixels gives its visible text only: Decode says why, and fills nothing.
    await importPng("large-decoy-qr.png", screenshot(VCARD));
    await waitText(page, restore, exactly(NO_SEEDQR_UNREAD));
    assert.equal(await payload.inputValue(), "");
    assert.equal(await note.isVisible(), false);
  }

  static async #mnemoCodeDecode(page) {
    await page.locator('[data-recovery-tab][aria-controls="mnemocode-panel"]').click();
    await page.waitForFunction(() => !document.getElementById("mnemocode-panel").inert);
    await page.locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]').click();
    await page.locator("#mnemocode-input").fill("");
    await page
      .locator("#mnemocode-decode-panel label.file-choice")
      .filter({ hasText: "Import QR image" })
      .locator("input[type=file]")
      .setInputFiles({
        name: "record-screenshot.png",
        mimeType: "image/png",
        buffer: screenshot(OTHER_RECORD),
      });
    await page.waitForFunction(
      (expected) => document.querySelector("#mnemocode-input")?.value === expected,
      OTHER_RECORD,
    );
    // A record read without its hidden reader's look is never taken silently, here either.
    const note = page.locator("#mnemocode-decode-panel .qr-import-note", {
      hasText: "Read as an ordinary QR code.",
    });
    assert.equal(await note.textContent(), READ_AS_ORDINARY);
    assert.equal(await note.isVisible(), true);
  }
}

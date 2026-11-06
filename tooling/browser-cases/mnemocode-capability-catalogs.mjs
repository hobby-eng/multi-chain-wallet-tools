import assert from "node:assert/strict";

// Independent expected choices of the current MnemoCode release, not recomputed by the UI builder.
const CATALOGS = {
  "mnemocode-encode-mode": ["direct", "seedshift", "seedshift-legacy", "seedshift-legacy-valid"],
  "mnemocode-encode-format": ["english", "indexes", "unicode", "colors-unicode", "colors"],
  "mnemocode-split-form": ["ur", "words", "indexes", "unicode", "colors", "colors-unicode"],
  "mnemocode-card-page-size": ["a6", "a5", "a4", "business"],
  "mnemocode-card-orientation": ["landscape", "portrait", ""],
  "mnemocode-card-file-format": ["pdf", "png", "jpg"],
  "mnemocode-card-sample-words": ["12", "15", "18", "21", "24"],
  "mnemocode-card-template": [
    "business-architect",
    "business-it",
    "business-estate",
    "business-diagonal",
    "business-contact",
    "business-curves",
    "business-facets",
    "business-mixed",
    "material-vehicle",
    "material-enclosure",
    "material-tile",
    "material-switch",
    "material-kitchen",
  ],
  "mnemocode-heirs-size": ["a5", "a6"],
  "mnemocode-table-export-format": ["legacy", "english", "chinese", "unicode", "mapping"],
};

/** Inspect every offered catalogue in the actual built page, then exercise its final-word file port. */
export class MnemoCodeCapabilityCatalogsCase {
  /** One independent expected catalogue shared with rendering acceptance. */
  static get templates() {
    return CATALOGS["mnemocode-card-template"];
  }

  static async run(context, profile, run, openWithLinkedPhrase) {
    const { page } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
    for (const [id, expected] of Object.entries(CATALOGS)) {
      await page.locator(`#${id} option`).first().waitFor({ state: "attached" });
      const actual = await page
        .locator(`#${id} option`)
        .evaluateAll((options) => options.map((option) => option.value));
      assert.deepEqual(actual.toSorted(), expected.toSorted(), `Complete offered catalogue: ${id}`);
    }
    for (const field of ["name", "role", "company", "email", "phone", "website", "location"])
      assert.equal(await page.locator(`#mnemocode-card-${field}`).count(), 1);
    for (const field of ["studio", "slogan", "subtitle", "footer", "reference-label"])
      assert.equal(await page.locator(`#mnemocode-card-${field}`).count(), 1);
    await page.locator('[data-operation-tab][aria-controls="mnemocode-reencode-panel"]').click();
    const lastWord = page.locator("#mnemocode-reencode-last-word");
    const chooser = page.locator("#mnemocode-reencode-last-word + .file-choice input[type=file]");
    assert.equal(await chooser.count(), 1);
    await chooser.setInputFiles({
      name: "public-final-word.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(" about\r\n"),
    });
    await page.waitForFunction(
      () => document.querySelector("#mnemocode-reencode-last-word")?.value === "about",
    );
    assert.equal(await lastWord.inputValue(), "about");
    assert.deepEqual(run.requests, []);
    run.checks.push(
      "All ten MnemoCode choice catalogues, twelve card text fields and final-word file input.",
    );
  }
}

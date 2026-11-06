import assert from "node:assert/strict";

// Fixed public zero-entropy BIP39 phrases. These exercise host bindings; library known answers
// independently establish encoded bytes. An inverse through the same engine alone cannot do that.
const PHRASES = [
  [12, "about"],
  [15, "address"],
  [18, "agent"],
  [21, "admit"],
  [24, "art"],
];
const MODES = ["direct", "seedshift", "seedshift-legacy", "seedshift-legacy-valid"];
const FORMATS = ["english", "indexes", "unicode", "colors-unicode", "colors"];
const DATES = "23-09-2026";

/** Observe every mode/form/phrase-length binding through actual Encode and Decode controls. */
export class MnemoCodeModeFormatLengthsCase {
  static async run(context, profile, run, open) {
    let checked = 0;
    let unoffered = 0;
    for (const [words, last] of PHRASES) {
      const phrase = `${"abandon ".repeat(words - 1)}${last}`;
      const page = await open(context, profile, "key-derivation", run);
      try {
        await page.locator("#mnemonic").fill(phrase);
        await page.locator("#main-recovery-source-menu summary").click();
        await page.locator('#main-recovery-source-menu [data-recovery-target="mnemocode"]').click();
        for (const mode of MODES)
          for (const format of FORMATS) {
            const label = `${words} words, ${mode}, ${format}`;
            await page
              .locator('[data-operation-tab][aria-controls="mnemocode-create-panel"]')
              .click();
            await page.locator("#mnemocode-encode-mode").selectOption(mode);
            // MnemoCode writes English words and word numbers only masked: Direct does not offer them.
            if (mode === "direct" && (format === "english" || format === "indexes")) {
              const option = page.locator(`#mnemocode-encode-format option[value="${format}"]`);
              assert.equal(await option.isDisabled(), true, label);
              unoffered += 1;
              continue;
            }
            await page.locator("#mnemocode-encode-format").selectOption(format);
            if (mode !== "direct") await page.locator("#mnemocode-encode-dates").fill(DATES);
            await page.locator("#encode-mnemocode").click();
            const payload = page.locator("#mnemocode-encode-result article .share-secret").first();
            await payload.waitFor({ state: "attached" });
            const text = await payload.textContent();
            assert.ok(typeof text === "string" && text.length > 0, label);
            await page
              .locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]')
              .click();
            await page.locator("#mnemocode-decode-mode").selectOption(mode);
            await page.locator("#mnemocode-decode-format").selectOption(format);
            if (mode !== "direct") await page.locator("#mnemocode-decode-dates").fill(DATES);
            await page.locator("#mnemocode-input").fill(text);
            await page.locator("#decode-mnemocode").click();
            const result = page.locator("#mnemocode-decode-result textarea");
            await result.first().waitFor({ state: "attached" });
            const recovered = await result.first().inputValue();
            if (mode === "seedshift-legacy-valid")
              assert.ok(
                recovered.split(/\r?\n/u).some((row) => row.split("\t")[1] === phrase),
                label,
              );
            else assert.equal(recovered, phrase, label);
            checked += 1;
          }
      } finally {
        await page.close();
      }
    }
    assert.equal(checked, 90);
    assert.equal(unoffered, 10);
    assert.deepEqual(run.requests, []);
    run.checks.push(
      "90 actual UI mode/form/length paths, and Direct offers no English words or word numbers; legacy-valid retains the original among candidates.",
    );
  }
}

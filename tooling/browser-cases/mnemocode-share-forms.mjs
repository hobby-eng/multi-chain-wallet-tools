import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BrowserFixtures } from "../browser-regressions/fixtures.mjs";

const FORMS = ["ur", "words", "indexes", "unicode", "colors", "colors-unicode"];
// Independent expected wire alphabets; no production formatter classifies its own output.
const SPELLINGS = {
  ur: /^ur:sskr\/[a-z]+$/u,
  words: /^[a-z]{4}(?: [a-z]{4})*$/u,
  indexes: /^\d+(?: \d+)*$/u,
  unicode: /^[0-9A-F]{4}(?: [0-9A-F]{4})*$/u,
  colors: /^#[0-9A-F]{6}(?: #[0-9A-F]{6})*$/u,
  "colors-unicode": /^(?:[E-F][0-9A-F]{3})+$/u,
};

/** Exercise all six share forms through Split, Restore and the share export operation. */
export class MnemoCodeShareFormsCase {
  static async run(context, profile, run, openWithLinkedPhrase, waitText) {
    const { page } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
    await page.locator("#mnemocode-split-section > summary").click();
    for (const [index, form] of FORMS.entries()) {
      await this.#tab(page, "create");
      await page.locator("#mnemocode-split-form").selectOption(form);
      await page.locator("#mnemocode-split").click();
      const split = page.locator("#mnemocode-split-result .share-secret");
      await split.first().waitFor({ state: "attached" });
      const shares = await split.allTextContents();
      assert.equal(shares.length, 3, form);
      for (const share of shares) this.#assertForm(share, form);
      await this.#restore(page, shares.slice(0, 2), waitText);

      await this.#tab(page, "forgotten");
      await page.locator("#mnemocode-forgotten-kind-share").check();
      await page.locator("#mnemocode-forgotten-shares").fill(shares.slice(0, 2).join("\n"));
      await page.locator("#mnemocode-forgotten-shares-wallet-none").check();
      const outputForm = FORMS[(index + 1) % FORMS.length];
      await page.locator("#mnemocode-forgotten-shares-form").selectOption(outputForm);
      await page.locator("#mnemocode-forgotten-shares-repair").click();
      await waitText(page, "#mnemocode-forgotten-shares-status", /The shares are written again\./u);
      const result = page.locator("#mnemocode-forgotten-shares-result");
      const exported = await result.locator(".share-secret").allTextContents();
      assert.equal(exported.length, 2, form);
      for (const share of exported) this.#assertForm(share, outputForm);
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        result.getByRole("button", { name: "Save as a text file", exact: true }).click(),
      ]);
      const path = await download.path();
      assert.ok(path);
      assert.equal(readFileSync(path, "utf8"), `${exported.join("\n")}\n`, outputForm);
      await download.delete();
      await this.#restore(page, exported, waitText);
    }
    assert.deepEqual(run.requests, []);
    run.checks.push(
      "All six share forms split, restore, export through Forgotten, save exact text and restore again; host binding proof, complemented by the library's independent SSKR oracle.",
    );
  }

  static #assertForm(text, form) {
    assert.match(text, SPELLINGS[form], `Requested share form: ${form}`);
    if (form === "indexes")
      assert.ok(text.split(" ").every((unit) => Number(unit) >= 1 && Number(unit) <= 2048));
    if (form === "colors-unicode") {
      // Color Unicode uses pairs from the BMP Private Use Area, U+E000..U+F8FF.
      assert.equal(text.length % 8, 0);
      for (const unit of text.match(/.{4}/gu))
        assert.ok(Number.parseInt(unit, 16) >= 0xe000 && Number.parseInt(unit, 16) <= 0xf8ff);
    }
  }

  static async #tab(page, panel) {
    await page.locator(`[data-operation-tab][aria-controls="mnemocode-${panel}-panel"]`).click();
  }

  static async #restore(page, shares, waitText) {
    await this.#tab(page, "restore");
    await page.locator("#mnemocode-restore-mode-direct").check();
    await page.locator("#mnemocode-restore-shares").fill(shares.join("\n"));
    await page.locator("#mnemocode-restore").click();
    await waitText(page, "#mnemocode-restore-status", /The phrase is restored\./u);
    const phrase = page.locator("#mnemocode-restore-result textarea").last();
    assert.equal(await phrase.inputValue(), BrowserFixtures.mnemonic);
  }
}

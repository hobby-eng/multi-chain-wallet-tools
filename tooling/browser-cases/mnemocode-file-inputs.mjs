import assert from "node:assert/strict";
import { BrowserFixtures } from "../browser-regressions/fixtures.mjs";

const DATES = "23-09-2026\n01-01-2000";

/** Native file ports: every date operation and a two-file quorum through the actual Restore UI. */
export class MnemoCodeFileInputsCase {
  static async run(context, profile, run, openWithLinkedPhrase, waitText) {
    const { page } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
    for (const [prefix, panel] of [
      ["encode", "create"],
      ["decode", "decode"],
      ["reencode", "reencode"],
    ]) {
      await this.#tab(page, panel);
      await page.locator(`#mnemocode-${prefix}-mode`).selectOption("seedshift");
      await this.#dates(page, prefix);
    }
    await this.#tab(page, "forgotten");
    await page.locator("#mnemocode-forgotten-kind-date").check();
    await this.#dates(page, "forgotten");
    await this.#tab(page, "restore");
    await page.locator("#mnemocode-restore-mode-seedshift").check();
    await this.#dates(page, "restore");
    await this.#tab(page, "forgotten");
    await page.locator("#mnemocode-forgotten-kind-share").check();
    await page.locator("#mnemocode-forgotten-shares-wallet-fingerprint-choice").check();
    await page.locator("#mnemocode-forgotten-shares-mode-seedshift").check();
    await this.#dates(page, "forgotten-shares");

    await this.#tab(page, "restore");
    await page.locator("#mnemocode-restore-mode-direct").check();
    const shares = page.locator("#mnemocode-restore-shares");
    await shares.fill("");
    const chooser = page
      .locator("#mnemocode-restore-panel label.file-choice")
      .filter({ hasText: "Add a shares file" })
      .locator('input[type="file"]');
    let expected = "";
    for (const [index, share] of BrowserFixtures.sskrShares.entries()) {
      await chooser.setInputFiles({
        name: `public-share-${index + 1}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from(`${share}\r\n`),
      });
      expected = expected === "" ? share : `${expected}\n${share}`;
      await page.waitForFunction(
        (text) => document.querySelector("#mnemocode-restore-shares")?.value === text,
        expected,
      );
    }
    await page.locator("#mnemocode-restore").click();
    await waitText(page, "#mnemocode-restore-status", /The phrase is restored\./u);
    const phrase = page.locator("#mnemocode-restore-result textarea").last();
    assert.equal(await phrase.inputValue(), BrowserFixtures.sskrPhrase);
    assert.deepEqual(run.requests, []);
    run.checks.push(
      "Six date file ports and a published two-of-three quorum assembled from two local files.",
    );
  }

  static async #tab(page, panel) {
    await page.locator(`[data-operation-tab][aria-controls="mnemocode-${panel}-panel"]`).click();
  }

  static async #dates(page, prefix) {
    const field = page.locator(`#mnemocode-${prefix}-dates`);
    assert.equal(await field.isVisible(), true, prefix);
    assert.equal(await field.isDisabled(), false, prefix);
    assert.equal(
      await page.locator(`#mnemocode-${prefix}-dates-field label label.file-choice`).count(),
      0,
      `The date control and the file chooser have separate labels: ${prefix}`,
    );
    await page
      .locator(`#mnemocode-${prefix}-dates + .file-choice input[type="file"]`)
      .setInputFiles({
        name: "public-dates.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(`${DATES.replaceAll("\n", "\r\n")}\r\n`),
      });
    await page.waitForFunction(({ id, text }) => document.getElementById(id)?.value === text, {
      id: `mnemocode-${prefix}-dates`,
      text: DATES,
    });
    assert.equal(await field.inputValue(), DATES);
  }
}

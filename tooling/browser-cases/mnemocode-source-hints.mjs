import assert from "node:assert/strict";
import { BrowserFixtures } from "../browser-regressions/fixtures.mjs";

/** Manual Encode input keeps its Show choice and completion when obsolete records are cleared. */
export class MnemoCodeSourceHintsCase {
  /** Old, still-referenced encoded nodes lose their payload before source replacement. */
  static async retirement(context, profile, run, openBackupPanel, format = "english") {
    const { page } = await openBackupPanel(context, profile, run, "mnemocode-panel");
    await page.locator("#mnemocode-source").fill(BrowserFixtures.mnemonic);
    // MnemoCode writes English words only masked: they are encoded with Seedshift and a date.
    if (format === "english") {
      await page.locator("#mnemocode-encode-mode").selectOption("seedshift");
      await page.locator("#mnemocode-encode-dates").fill("23-09-2026");
    } else await page.locator("#mnemocode-encode-mode").selectOption("direct");
    await page.locator("#mnemocode-encode-format").selectOption(format);
    await page.locator("#encode-mnemocode").click();
    const result = page.locator("#mnemocode-encode-result .share-secret");
    await result.first().waitFor({ state: "attached" });
    const apart = page.locator("#mnemocode-encode-result .apart-codes");
    assert.equal(await apart.count(), format === "english" ? 0 : 1);
    const nodes = await page
      .locator("#mnemocode-encode-result .share-secret, #mnemocode-encode-result .apart-codes")
      .elementHandles();
    try {
      assert.ok(nodes.length > 0);
      for (const node of nodes) assert.ok((await node.textContent()).length > 0);
      await page.locator("#mnemocode-source").fill("aban");
      for (const node of nodes) assert.equal(await node.textContent(), "");
    } finally {
      for (const node of nodes) await node.dispose();
    }
    assert.deepEqual(run.requests, []);
    run.checks.push(
      `${format}: joined and separated payload nodes retire before source replacement.`,
    );
  }

  static async run(context, profile, run, openBackupPanel, waitText) {
    const { page } = await openBackupPanel(context, profile, run, "mnemocode-panel");
    const field = page.locator("#mnemocode-source");
    const toggle = page.locator("#toggle-mnemocode-source");
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    await page.locator("#toggle-mnemocode-created").click();
    assert.equal(await page.locator("#toggle-mnemocode-created").textContent(), "Hide records");
    await field.fill("aban");
    assert.equal(await toggle.getAttribute("aria-pressed"), "true", "Typing preserves Show");
    assert.doesNotMatch((await field.getAttribute("class")) ?? "", /\bconcealed\b/u);
    await waitText(page, "#mnemocode-source ~ .word-hint", /^abandon$/u);
    assert.equal(await page.locator("#toggle-mnemocode-created").textContent(), "Show records");
    await field.press("Tab");
    assert.equal(await field.inputValue(), "abandon ");
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    await page.locator("#clear-all").evaluate((button) => button.click());
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    assert.match((await field.getAttribute("class")) ?? "", /\bconcealed\b/u);
    assert.deepEqual(run.requests, []);
    run.checks.push("Manual Encode: hints and Tab completion survive edits; Clear conceals input.");
  }
}

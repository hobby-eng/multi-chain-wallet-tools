import assert from "node:assert/strict";

/**
 * Editing clears obsolete results while preserving explicit input disclosure; Clear conceals it.
 * Shares being typed get no word hints: MnemoCode's binding does not export its share hints.
 */
export class MnemoCodeShareHintsCase {
  static async run(context, profile, run, openWithLinkedPhrase, _waitText, operation) {
    const { page } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
    const panel = operation === "restore" ? "restore" : "forgotten";
    await page.locator(`[data-operation-tab][aria-controls="mnemocode-${panel}-panel"]`).click();
    if (operation === "repair") await page.locator("#mnemocode-forgotten-kind-share").check();
    const prefix = operation === "restore" ? "mnemocode-restore" : "mnemocode-forgotten";
    const field = page.locator(`#${prefix}-shares`);
    const toggle = page.locator(`#toggle-${prefix}-shares`);
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    if (operation === "repair") {
      await page.locator("#toggle-mnemocode-forgotten-shares-result").click();
      assert.equal(
        await page.locator("#toggle-mnemocode-forgotten-shares-result").textContent(),
        "Hide shares",
      );
    }
    await field.fill("tuna acid; ta");
    assert.equal(await toggle.getAttribute("aria-pressed"), "true", "Typing preserves Show");
    assert.doesNotMatch((await field.getAttribute("class")) ?? "", /\bconcealed\b/u);
    assert.equal(await page.locator(`#${prefix}-shares ~ .word-hint`).count(), 0);
    if (operation === "repair")
      assert.equal(
        await page.locator("#toggle-mnemocode-forgotten-shares-result").textContent(),
        "Show shares",
        "Obsolete output disclosure resets independently",
      );
    await page.locator("#clear-all").evaluate((button) => button.click());
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    assert.match((await field.getAttribute("class")) ?? "", /\bconcealed\b/u);
    assert.deepEqual(run.requests, []);
    run.checks.push(`${operation}: typing preserves Show; Clear conceals input.`);
  }
}

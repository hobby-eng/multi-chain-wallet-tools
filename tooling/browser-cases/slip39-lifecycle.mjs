import assert from "node:assert/strict";

// Published BIP39 zero-entropy phrase; only synthetic SLIP-39 shares are generated.
const PHRASE = `${"abandon ".repeat(11)}about`;

/** Actual file:// worker transport, restoration and page-side revocation in either edition. */
export class Slip39LifecycleCase {
  static async run(page) {
    await page.locator("#recovery-backup-mode").click();
    await page.locator('[data-recovery-tab][aria-controls="slip39-panel"]').click();
    await page.locator('[data-operation-tab][aria-controls="slip39-create-panel"]').click();
    await page.locator("#slip39-source-mnemonic").fill(PHRASE);
    await page.locator("#create-slip39-shares").click();
    const created = page.locator("#slip39-create-result .share-secret");
    await created.first().waitFor();
    const shares = (await created.allTextContents()).slice(0, 2).join("\n");
    assert.equal((await created.count()) >= 2, true);
    await page.locator('[data-operation-tab][aria-controls="slip39-restore-panel"]').click();
    await page.locator("#slip39-shares").fill(shares);
    await page.locator("#restore-slip39-shares").click();
    const recovered = page.locator("#slip39-restore-result textarea");
    await recovered.waitFor();
    assert.equal(await recovered.inputValue(), PHRASE);
    assert.equal(await page.locator("#slip39-restore-stop").isHidden(), true);
    await page.locator("#slip39-restore-passphrase").fill("changed public fixture");
    assert.equal(await recovered.count(), 0);
    await page.locator("#slip39-restore-passphrase").fill("");
    // Dispatch both actions in one page turn so Cancel precedes any queued native result.
    await page.evaluate(() => {
      document.getElementById("restore-slip39-shares").click();
      document.getElementById("slip39-restore-stop").click();
    });
    await page.waitForFunction(() => document.getElementById("slip39-restore-stop").hidden);
    assert.match(await page.locator("#slip39-restore-result").textContent(), /^Stopped\./u);
    assert.equal(await recovered.count(), 0);
    await page.locator("#derive-generate-mode").click();
    await page.locator("#clear-all").click();
    assert.equal(await page.locator("#slip39-shares").inputValue(), "");
    assert.equal(await page.locator("#slip39-restore-passphrase").inputValue(), "");
    assert.equal(await recovered.count(), 0);
  }
}

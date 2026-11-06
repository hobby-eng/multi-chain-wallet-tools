import assert from "node:assert/strict";
import { BrowserFixtures } from "../browser-regressions/fixtures.mjs";

/** Observe real native diagnostic nodes through concealment and bounded-input refusal. */
export class MnemonicDiagnosticLifetimeCase {
  static async run(page) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    await page.locator("#clear-all").click();
    const retired = [];
    try {
      await page.locator("#mnemonic").fill(BrowserFixtures.mnemonic);
      assert.equal(await page.locator("#seed-diagnostic .seed-word-table").count(), 0);
      await page.locator("#toggle-sensitive-values").click();
      const first = page
        .locator("#seed-diagnostic .seed-word-table tbody tr td:nth-child(2)")
        .first();
      assert.equal(await first.textContent(), "abandon");
      retired.push(...(await page.locator("#seed-diagnostic .secret-value").elementHandles()));
      assert.ok(retired.length > 0);
      await page.locator("#toggle-sensitive-values").click();
      for (const node of retired) assert.equal(await node.textContent(), "");
      assert.equal(await page.locator("#seed-diagnostic .seed-word-table").count(), 0);
      // Independent policy boundary, deliberately not imported from the production admission rule.
      const oversized = " ".repeat(8193) + BrowserFixtures.mnemonic;
      await page.locator("#mnemonic").fill(oversized);
      assert.equal((await page.locator("#mnemonic").inputValue()).length, oversized.length);
      assert.equal(await page.locator("#word-count").textContent(), "Word count unavailable");
      assert.match(
        await page.locator("#seed-diagnostic").textContent(),
        /8192 UTF-16 code unit limit/u,
      );
      assert.equal(await page.locator("#copy-mnemonic").isDisabled(), true);
      return { retiredDiagnosticNodesCleared: true, oversizedInputRefusedWithoutTruncation: true };
    } finally {
      await page.locator("#clear-all").click();
      for (const node of retired) await node.dispose();
    }
  }
}

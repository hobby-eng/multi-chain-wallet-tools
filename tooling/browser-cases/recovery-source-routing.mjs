import assert from "node:assert/strict";
import { BrowserFixtures } from "../browser-regressions/fixtures.mjs";

/** Exercise actual routing and linked cards; only native action attributes are forged. */
export class RecoverySourceRoutingCase {
  static async run(page) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    await page.locator("#clear-all").click();
    await page.locator("#mnemonic").fill(BrowserFixtures.mnemonic);
    try {
      for (const source of ["", "synthetic-unknown-source"]) {
        await this.#click(page, source, "seedqr");
        assert.equal(await page.locator('[data-linked-source-for="seedqr"]').count(), 0);
        assert.equal(
          await page.locator("#error").textContent(),
          "Select the original phrase or a BIP85 child phrase.",
        );
      }
      await this.#click(page, "main", "synthetic-private-target");
      assert.equal(
        await page.locator("#error").textContent(),
        "Select a supported recovery workflow.",
      );
      assert.equal(await page.locator("#mnemonic").inputValue(), BrowserFixtures.mnemonic);
      await page
        .locator('[data-recovery-source="main"][data-recovery-target="seedqr"]')
        .evaluate((button) => button.click());
      assert.equal(await page.locator('[data-linked-source-for="seedqr"]').count(), 1);
      assert.equal(await page.locator("#seedqr-source").inputValue(), "");
      const linked = page.locator('[data-linked-source-for="seedqr"] textarea');
      assert.equal(await linked.inputValue(), "");
      assert.equal(await linked.isHidden(), true);
      return { unknownRoutesRefused: true, originalCapabilityLinkedWithoutPhraseCopy: true };
    } finally {
      // Clear sits with the derivation controls, which the recovery workspace hides.
      await page.locator("#clear-all").evaluate((button) => button.click());
    }
  }

  static async #click(page, source, target) {
    await page.evaluate(
      ({ source, target }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.recoverySource = source;
        button.dataset.recoveryTarget = target;
        document.body.append(button);
        try {
          button.click();
        } finally {
          button.remove();
        }
      },
      { source, target },
    );
  }
}

import assert from "node:assert/strict";

const PHRASE = `${"abandon ".repeat(11)}about`; // Published BIP39 zero-entropy phrase.

/** Native keyboard selection leaves a supplemental workspace exactly as pointer selection does. */
export class ProtocolNavigationCase {
  static async run(page) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    await page.locator("#clear-all").click();
    await page.locator("#count").fill("1");
    await page.locator("#mnemonic").fill(PHRASE);
    await page.locator("#include-bip85").check();
    await page.locator("#bip85-tab").click();
    await page.locator("#bip85-result").waitFor({ state: "visible" });
    await page.locator("#protocol-tabs [data-adapter-id]").first().press("ArrowRight");
    await page.waitForFunction(() => !document.getElementById("derive-button").disabled);
    assert.equal(await page.locator("#bip85-panel").isHidden(), true);
    assert.equal(await page.locator("#results").isVisible(), true);
    assert.equal(
      await page
        .locator("#derivation-panel")
        .evaluate((panel) => panel.classList.contains("feature-tab-active")),
      false,
    );
    const active = await page
      .locator("#protocol-tabs [data-adapter-id]:focus")
      .getAttribute("data-adapter-id");
    assert.equal(
      await page.locator("#protocol-tabs [aria-checked=true]").getAttribute("data-adapter-id"),
      active,
    );
    await page.locator("#clear-all").click();
    return {
      keyboardLeavesSupplementalPanel: true,
      visibleOrdinaryResults: true,
      focusedProtocol: active,
    };
  }
}

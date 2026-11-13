import assert from "node:assert/strict";

// Public BIP39 zero-entropy vector; the unchanged exact address is retained by the startup check.
const PHRASE = `${"abandon ".repeat(11)}about`;
const ADDRESS =
  "sp1qqfqnnv8czppwysafq3uwgwvsc638hc8rx3hscuddh0xa2yd746s7xqh6yy9ncjnqhqxazct0fzh98w7lpkm5fvlepqec2yy0sxlq4j6ccc3h6t0g";

/** Actual file:// derivation, parameter refusal and Clear; Dash asserts feature absence. */
export class SilentPaymentLifecycleCase {
  static async run(page, enabled) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    if (!enabled) {
      for (const id of [
        "derive-silent-payment",
        "include-silent-payment",
        "bip85-wallet-derive-silent-payment",
      ])
        assert.equal(await page.locator(`#${id}`).count(), 0);
      return;
    }
    await page.locator("#mnemonic").fill(PHRASE);
    await page.locator("#passphrase").fill("");
    await page.locator("#count").fill("1");
    await SilentPaymentLifecycleCase.#bitcoinOnly(page);
    await page.locator("#include-silent-payment").check();
    await page.locator("#silent-payment-tab").click();
    await page.locator("#silent-payment-result").waitFor({ state: "visible" });
    assert.equal(await page.locator("#silent-payment-address").textContent(), ADDRESS);
    await page.locator("#silent-payment-labels").fill(PHRASE);
    await page.locator("#derive-silent-payment").click();
    assert.match(
      await page.locator("#silent-payment-error").textContent(),
      /labels must be integers/u,
    );
    assert.equal(
      (await page.locator("#silent-payment-error").textContent()).includes(PHRASE),
      false,
    );
    await page.locator("#silent-payment-labels").fill("3,1,1");
    await page.locator("#derive-silent-payment").click();
    await page.locator("#silent-payment-result").waitFor({ state: "visible" });
    assert.deepEqual(
      await page.locator("#silent-payment-labeled-list .row-label").allTextContents(),
      ["Label 1", "Label 3"],
    );
    await page.evaluate(() => {
      document.getElementById("derive-silent-payment").click();
      document.getElementById("clear-all").click();
    });
    assert.equal(await page.locator("#silent-payment-result").isHidden(), true);
    assert.equal(await page.locator("#silent-payment-address").textContent(), "");
    assert.equal(await page.locator("#silent-payment-labels").inputValue(), "");
    assert.equal(await page.locator("#mnemonic").inputValue(), "");
  }

  /**
   * Silent Payments are Bitcoin's (BIP352): under another coin the option, its "?" and its tab are
   * hidden; back under Bitcoin the kept tick shows the tab again.
   */
  static async #bitcoinOnly(page) {
    const option = page.locator("#include-silent-payment");
    const row = option.locator("xpath=ancestor::div[contains(@class, 'field-heading-row')][1]");
    const tab = page.locator("#silent-payment-tab");
    assert.equal(await row.isVisible(), true, "offered under Bitcoin");
    await option.check();
    await tab.waitFor({ state: "visible" });
    for (const coin of ["ethereum", "solana", "cardano", "dash"]) {
      await page.locator("#coin").selectOption(coin);
      assert.equal(await row.isVisible(), false, `no Silent Payments option under ${coin}`);
      assert.equal(await tab.isVisible(), false, `no Silent Payments tab under ${coin}`);
    }
    await page.locator("#coin").selectOption("bitcoin");
    assert.equal(await row.isVisible(), true, "offered again under Bitcoin");
    assert.equal(await option.isChecked(), true, "the tick is kept");
    await tab.waitFor({ state: "visible" });
    await option.uncheck();
  }
}

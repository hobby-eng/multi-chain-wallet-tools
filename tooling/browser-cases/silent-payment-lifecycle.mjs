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
}

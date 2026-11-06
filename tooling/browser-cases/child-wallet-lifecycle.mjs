import assert from "node:assert/strict";
import { AccountExportLifecycleCase } from "./account-export-lifecycle.mjs";

const PHRASE = `${"abandon ".repeat(11)}about`;

/** Exercise the shipped parent/child operation and Clear using only the public BIP39 fixture. */
export class ChildWalletLifecycleCase {
  static async run(page, coin) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    await page.locator("#mnemonic").fill(PHRASE);
    await page.locator("#passphrase").fill("");
    await page.locator("#count").fill("1");
    await page.locator("#include-bip85").check();
    await page.locator("#bip85-tab").click();
    await page.locator("#bip85-words").selectOption("12");
    await page.locator("#derive-bip85").click();
    await page.locator("#bip85-result").waitFor({ state: "visible" });
    await page.locator("#open-bip85-wallet").click();
    await page.locator("#bip85-wallet-coin").selectOption(coin);
    await page.locator("#bip85-wallet-count").fill("1");
    await page.locator("#derive-bip85-wallet").click();
    await page.locator("#bip85-wallet-results").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.getElementById("derive-bip85-wallet").disabled);
    assert.equal(await page.locator("#bip85-wallet-selected-count").textContent(), "1");
    assert.equal(await page.locator("#bip85-wallet-list [data-select-row]").count(), 1);
    await AccountExportLifecycleCase.run(page, true);
    await ChildWalletLifecycleCase.#fieldCopies(page);
    await page.locator("#bip85-wallet-toggle-secrets").click();
    // This case checks native ownership/UI composition; cryptographic known answers are separate checks.
    await page.evaluate(() => {
      window.__retiredChildSecretNodes = [
        ...document.querySelectorAll("#bip85-wallet-results .secret-value"),
      ];
      document.getElementById("derive-bip85-wallet").click();
      document.getElementById("clear-all").click();
    });
    assert.equal(await page.locator("#bip85-wallet-results").isHidden(), true);
    assert.equal(await page.locator("#bip85-wallet-list").textContent(), "");
    assert.equal(await page.locator("#mnemonic").inputValue(), "");
    assert.equal(
      await page.evaluate(() => {
        const retired = window.__retiredChildSecretNodes;
        delete window.__retiredChildSecretNodes;
        return retired.length > 0 && retired.every((node) => node.textContent === "");
      }),
      true,
    );
  }

  static async #fieldCopies(page) {
    await page.locator("#bip85-wallet-advanced").click();
    await page.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
      const state = { descriptor, copies: [] };
      window.__childFieldClipboardNative = state;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            state.copies.push(text);
          },
        },
      });
    });
    try {
      const publicCopy = page
        .locator('#bip85-wallet-list [data-copy-field][data-secret="false"]')
        .first();
      const privateCopy = page
        .locator('#bip85-wallet-list [data-copy-field][data-secret="true"]')
        .first();
      await publicCopy.click();
      await page.waitForFunction(() => window.__childFieldClipboardNative.copies.length === 1);
      assert.equal(await privateCopy.isDisabled(), true);
      assert.equal(
        await privateCopy.evaluate(
          (button) => button.closest(".row").querySelector(".value").textContent,
        ),
        "Hidden",
      );
      // A forged native event must still pass the shared disclosure owner, beyond disabled UI.
      await privateCopy.dispatchEvent("click");
      assert.equal(await page.evaluate(() => window.__childFieldClipboardNative.copies.length), 1);
      await page.locator("#bip85-wallet-toggle-secrets").click();
      assert.equal(await privateCopy.isDisabled(), false);
      const expected = await privateCopy.evaluate(
        (button) => button.closest(".row").querySelector(".value").textContent,
      );
      assert.ok(expected.length > 0);
      assert.notEqual(expected, "Hidden");
      await privateCopy.click();
      await page.waitForFunction(() => window.__childFieldClipboardNative.copies.length === 2);
      assert.equal(
        await page.evaluate(() => window.__childFieldClipboardNative.copies[1]),
        expected,
      );
      await page.locator("#bip85-wallet-toggle-secrets").click();
      assert.equal(
        await privateCopy.evaluate(
          (button) => button.closest(".row").querySelector(".value").textContent,
        ),
        "Hidden",
      );
    } finally {
      await page.evaluate(() => {
        const { descriptor } = window.__childFieldClipboardNative;
        if (descriptor === undefined) delete navigator.clipboard;
        else Object.defineProperty(navigator, "clipboard", descriptor);
        delete window.__childFieldClipboardNative;
      });
    }
  }
}

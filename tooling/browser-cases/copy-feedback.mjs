import assert from "node:assert/strict";

const PHRASE = `${"abandon ".repeat(11)}about`;
// Native-clock fixture targets the existing copy feedback deadline; no wallet rule is replaced.
const FEEDBACK_DELAY_MS = 900;

/** Repeated successful copies cancel old feedback and restore the original public icon title. */
export class CopyFeedbackCase {
  static async run(page) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    await page.locator("#mnemonic").fill(PHRASE);
    await page.locator("#count").fill("1");
    await page.locator("#derive-button").click();
    await page.waitForFunction(() => !document.getElementById("derive-button").disabled);
    const copy = page.locator('#address-list [data-copy-field="address"]').first();
    const title = await copy.getAttribute("title");
    await page.evaluate((delay) => {
      const clock = {
        set: window.setTimeout,
        clear: window.clearTimeout,
        held: new Map(),
        clipboard: Object.getOwnPropertyDescriptor(navigator, "clipboard"),
        copies: 0,
      };
      let next = -1;
      window.__copyFeedbackNative = clock;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            clock.copies += 1;
          },
        },
      });
      window.setTimeout = (callback, timeout, ...args) => {
        if (timeout !== delay) return clock.set.call(window, callback, timeout, ...args);
        const id = next--;
        clock.held.set(id, () => callback(...args));
        return id;
      };
      window.clearTimeout = (id) => {
        if (!clock.held.delete(id)) clock.clear.call(window, id);
      };
    }, FEEDBACK_DELAY_MS);
    try {
      await copy.click();
      await copy.click();
      assert.equal(await page.evaluate(() => window.__copyFeedbackNative.copies), 2);
      assert.equal(await page.evaluate(() => window.__copyFeedbackNative.held.size), 1);
      await page.evaluate(() => {
        for (const done of window.__copyFeedbackNative.held.values()) done();
      });
      assert.equal(await copy.getAttribute("title"), title);
      assert.equal(await copy.evaluate((button) => button.classList.contains("copied")), false);
      return { repeatedCopiesRestoreOriginalControl: true };
    } finally {
      await page.evaluate(() => {
        const clock = window.__copyFeedbackNative;
        window.setTimeout = clock.set;
        window.clearTimeout = clock.clear;
        if (clock.clipboard === undefined) delete navigator.clipboard;
        else Object.defineProperty(navigator, "clipboard", clock.clipboard);
        delete window.__copyFeedbackNative;
        document.getElementById("clear-all").click();
      });
    }
  }
}

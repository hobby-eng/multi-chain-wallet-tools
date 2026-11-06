import assert from "node:assert/strict";

const PHRASE = `${"abandon ".repeat(11)}about`;
// Native clock fixture targets the existing BIP85 edit debounce, not a cryptographic limit.
const EDIT_DELAY_MS = 300;

/** A manual BIP85 start consumes the pending edit timer, so it cannot replace the new child later. */
export class Bip85ManualStartCase {
  static async run(page) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    await page.locator("#clear-all").click();
    await page.locator("#mnemonic").fill(PHRASE);
    await page.locator("#include-bip85").check();
    await page.locator("#bip85-tab").click();
    await page.locator("#bip85-result").waitFor({ state: "visible" });
    await page.evaluate((delay) => {
      const nativeSet = window.setTimeout;
      const nativeClear = window.clearTimeout;
      const held = new Map();
      let next = -1;
      window.__bip85EditClock = { nativeSet, nativeClear, held };
      window.setTimeout = (callback, timeout, ...args) => {
        if (timeout !== delay) return nativeSet.call(window, callback, timeout, ...args);
        const id = next--;
        held.set(id, () => callback(...args));
        return id;
      };
      window.clearTimeout = (id) => {
        if (!held.delete(id)) nativeClear.call(window, id);
      };
    }, EDIT_DELAY_MS);
    try {
      await page.locator("#bip85-index").fill("1");
      assert.equal(await page.evaluate(() => window.__bip85EditClock.held.size), 1);
      await page.locator("#derive-bip85").click();
      await page.locator("#bip85-result").waitFor({ state: "visible" });
      assert.equal(await page.evaluate(() => window.__bip85EditClock.held.size), 0);
      return { manualStartRevokesPendingEdit: true };
    } finally {
      await page.evaluate(() => document.getElementById("clear-all").click());
      await page.evaluate(() => {
        const clock = window.__bip85EditClock;
        window.setTimeout = clock.nativeSet;
        window.clearTimeout = clock.nativeClear;
        delete window.__bip85EditClock;
      });
    }
  }
}

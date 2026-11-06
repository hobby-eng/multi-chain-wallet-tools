import assert from "node:assert/strict";

const PHRASE = `${"abandon ".repeat(11)}about`;

/** Delay only the actual internal-branch worker reply; the external partial stays visible/exportable. */
export class CoinJoinPartialCase {
  static async run(page) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    await page.locator("#clear-all").click();
    if ((await page.locator("#coin").inputValue()) !== "dash")
      await page.locator("#coin").selectOption("dash");
    await page.locator("#count").fill("1");
    await page.locator("#mnemonic").fill(PHRASE);
    await page.evaluate(() => {
      const NativeWorker = window.Worker;
      const probe = { NativeWorker, replies: [] };
      window.__coinJoinPartialNative = probe;
      window.Worker = class extends NativeWorker {
        #internal = new Set();
        postMessage(message, transfer) {
          // DIP9 internal branch is 1; no secret input or result is recorded in the report.
          if (message?.type === "derive" && message.input?.branch === 1)
            this.#internal.add(message.id);
          return super.postMessage(message, transfer);
        }
        addEventListener(type, listener, options) {
          if (type !== "message") return super.addEventListener(type, listener, options);
          return super.addEventListener(
            type,
            (event) => {
              const deliver = () => {
                if (typeof listener === "function") listener.call(this, event);
                else listener?.handleEvent(event);
              };
              if (this.#internal.has(event.data?.id)) probe.replies.push(deliver);
              else deliver();
            },
            options,
          );
        }
      };
    });
    try {
      await page.locator("#include-coinjoin-addresses").check();
      await page.locator("#coinjoin-tab").click();
      await page.waitForFunction(() => window.__coinJoinPartialNative.replies.length === 1);
      assert.equal(await page.locator("#results").isVisible(), true);
      assert.equal(await page.locator("#address-list [data-select-row]").count(), 1);
      await page.locator("#cancel-derivation").click();
      await page.waitForFunction(() => !document.getElementById("derive-button").disabled);
      assert.match(await page.locator("#status").textContent(), /cancelled/u);
      assert.equal(await page.locator("#results").isVisible(), true);
      assert.equal(await page.locator("#result-coinjoin-internal-tab").isDisabled(), true);
      await page.locator("#toggle-result-secrets").click();
      assert.equal(await page.locator("#download-selection").isEnabled(), true);
      const download = page.waitForEvent("download");
      await page.locator("#download-selection").click();
      const exported = await download;
      assert.match(exported.suggestedFilename(), /-1-rows\./u);
      await page.evaluate(() => window.__coinJoinPartialNative.replies.shift()());
      assert.equal(await page.locator("#address-list [data-select-row]").count(), 1);
      return {
        externalPartialVisible: true,
        partialExportAvailable: true,
        lateInternalRefused: true,
      };
    } finally {
      await page.evaluate(() => {
        document.getElementById("clear-all").click();
        window.Worker = window.__coinJoinPartialNative.NativeWorker;
        delete window.__coinJoinPartialNative;
      });
    }
  }
}

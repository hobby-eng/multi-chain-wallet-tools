import assert from "node:assert/strict";
import { AccountExportLifecycleCase } from "./account-export-lifecycle.mjs";

// Official BIP39 zero-entropy phrase, never a person's wallet.
const PHRASE = `${"abandon ".repeat(11)}about`;

/** Pending native Blob assembly never publishes after concealment or Clear. */
export class ResultExportLifecycleCase {
  static async run(page) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    await page.locator("#mnemonic").fill(PHRASE);
    await page.locator("#passphrase").fill("");
    await page.locator("#count").fill("1");
    await page.locator("#derive-button").click();
    await page.locator("#results").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.getElementById("derive-button").disabled);
    await AccountExportLifecycleCase.run(page);
    let downloads = 0;
    const downloaded = () => {
      downloads += 1;
    };
    page.on("download", downloaded);
    try {
      await page.evaluate(() => {
        const NativeResponse = Response;
        window.__exportNative = { NativeResponse, release: [] };
        window.Response = class extends NativeResponse {
          blob() {
            const pending = super.blob();
            return new Promise((resolve, reject) => {
              window.__exportNative.release.push(async () => {
                try {
                  resolve(await pending);
                } catch (cause) {
                  reject(cause);
                }
              });
            });
          }
        };
      });
      for (const action of ["conceal", "clear"]) {
        await page.locator("#toggle-result-secrets").click();
        await page.locator("#download-selection").click();
        await page.waitForFunction(() => window.__exportNative.release.length === 1);
        await page.locator(action === "conceal" ? "#toggle-result-secrets" : "#clear-all").click();
        await page.evaluate(async () => {
          await window.__exportNative.release.shift()();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        assert.equal(downloads, 0);
      }
      assert.equal(await page.locator("#results").isHidden(), true);
      assert.equal(await page.locator("#mnemonic").inputValue(), "");
    } finally {
      page.off("download", downloaded);
      await page.evaluate(() => {
        window.Response = window.__exportNative.NativeResponse;
        delete window.__exportNative;
      });
    }
  }
}

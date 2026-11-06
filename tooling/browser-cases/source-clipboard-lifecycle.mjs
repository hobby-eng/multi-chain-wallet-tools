import assert from "node:assert/strict";

/** Delay only the native clipboard edge; obsolete source writes cannot announce success. */
export class SourceClipboardLifecycleCase {
  static async run(page, publicPhrase) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    await page.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
      const execDescriptor = Object.getOwnPropertyDescriptor(document, "execCommand");
      const state = {
        descriptor,
        execDescriptor,
        written: "",
        finish: undefined,
        refuse: undefined,
        fallbacks: 0,
      };
      window.__sourceClipboardNative = state;
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: () => {
          state.fallbacks += 1;
          return false;
        },
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText(text) {
            state.written = text;
            return new Promise((resolve, reject) => {
              state.finish = resolve;
              state.refuse = () => reject(new Error("Synthetic native clipboard denial"));
            });
          },
        },
      });
    });
    try {
      for (const action of ["conceal", "clear"]) {
        await page.locator("#clear-all").click();
        await page.locator("#mnemonic").fill(publicPhrase);
        await page.locator("#toggle-sensitive-values").click();
        await page.locator("#copy-mnemonic").click();
        await page.waitForFunction(
          (phrase) => window.__sourceClipboardNative.written === phrase,
          publicPhrase,
        );
        await page
          .locator(action === "conceal" ? "#toggle-sensitive-values" : "#clear-all")
          .click();
        await SourceClipboardLifecycleCase.#complete(page, "resolve");
      }
      await SourceClipboardLifecycleCase.#generation(page, publicPhrase);
      await page.locator("#mnemonic").fill(publicPhrase);
      await page.locator("#passphrase").fill("synthetic public passphrase");
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
      assert.equal(await page.locator("#mnemonic").inputValue(), "");
      assert.equal(await page.locator("#passphrase").inputValue(), "");
      assert.equal(await page.locator("#results").isHidden(), true);
    } finally {
      await page.evaluate(() => {
        const { descriptor, execDescriptor } = window.__sourceClipboardNative;
        if (descriptor === undefined) delete navigator.clipboard;
        else Object.defineProperty(navigator, "clipboard", descriptor);
        if (execDescriptor === undefined) delete document.execCommand;
        else Object.defineProperty(document, "execCommand", execDescriptor);
        delete window.__sourceClipboardNative;
      });
      await page.locator("#clear-all").click();
    }
  }

  static async #generation(page, publicPhrase) {
    for (const completion of ["resolve", "reject"]) {
      await page.locator("#clear-all").click();
      await page.locator("#mnemonic").fill(publicPhrase);
      await page.locator("#chosen-words-enabled").check();
      await page.locator("#chosen-words-never").fill("zoo");
      await page.locator("#toggle-sensitive-values").click();
      await page.evaluate(() => {
        const descriptor = Object.getOwnPropertyDescriptor(crypto, "getRandomValues");
        Object.defineProperty(crypto, "getRandomValues", {
          configurable: true,
          value: (bytes) => {
            bytes.fill(0xaa);
            return bytes;
          },
        });
        try {
          // Actual chosen-word generation samples synchronously, then publication awaits its promise.
          document.getElementById("generate-12").click();
          document.getElementById("copy-mnemonic").click();
        } finally {
          if (descriptor === undefined) delete crypto.getRandomValues;
          else Object.defineProperty(crypto, "getRandomValues", descriptor);
        }
      });
      await page.waitForFunction(
        (phrase) => document.getElementById("mnemonic").value !== phrase,
        publicPhrase,
      );
      await page.waitForFunction(() => !document.getElementById("derive-button").disabled);
      assert.equal(await page.evaluate(() => window.__sourceClipboardNative.written), publicPhrase);
      await SourceClipboardLifecycleCase.#complete(page, completion);
    }
  }

  static async #complete(page, completion) {
    await page.evaluate(async (kind) => {
      const state = window.__sourceClipboardNative;
      if (kind === "resolve") state.finish();
      else state.refuse();
      state.written = "";
      await new Promise((resolve) => setTimeout(resolve, 0));
    }, completion);
    assert.equal(
      await page
        .locator("#copy-mnemonic")
        .evaluate((button) => button.classList.contains("copied")),
      false,
    );
    assert.doesNotMatch(await page.locator("#status").textContent(), /copied/iu);
    assert.equal(await page.evaluate(() => window.__sourceClipboardNative.fallbacks), 0);
  }
}

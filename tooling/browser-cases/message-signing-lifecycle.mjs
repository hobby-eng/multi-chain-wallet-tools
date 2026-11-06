import assert from "node:assert/strict";

/** Native dialog admission and result retirement, after the real worker produced a signature. */
export class MessageSigningLifecycleCase {
  #page;

  constructor(page) {
    this.#page = page;
  }

  /** Runs on the currently open signing dialog in either edition and either browser. */
  async run(message) {
    const page = this.#page;
    await page.locator("#message-signer-message").fill(`${message} replacement`);
    assert.equal(await page.locator("#message-signature-output").inputValue(), "");
    assert.equal(await page.locator("#message-signature-result").isVisible(), false);
    await page.evaluate(() => {
      const NativeWorker = globalThis.Worker;
      const probe = { NativeWorker, constructions: 0 };
      globalThis.__messageSigningLifecycle = probe;
      globalThis.Worker = class extends NativeWorker {
        constructor(...args) {
          probe.constructions += 1;
          super(...args);
        }
      };
    });
    try {
      const oversized = "a".repeat(65537);
      await page.locator("#message-signer-message").fill(oversized);
      assert.equal(await page.locator("#message-signer-message").inputValue(), oversized);
      await page.locator("#sign-message-button").click();
      await page.waitForFunction(() =>
        document.querySelector("#message-signer-error").textContent.includes("64 KiB"),
      );
      assert.equal(
        await page.evaluate(() => globalThis.__messageSigningLifecycle.constructions),
        0,
      );
      assert.equal(await page.locator("#message-signature-result").isVisible(), false);
      await page.locator("#message-signer-message").fill(message);
      if (await page.locator("#message-signer-format-field").isVisible()) {
        const selected = await page.locator("#message-signer-format-select").inputValue();
        await page.evaluate(() => {
          const input = document.querySelector("#message-signer-format-select");
          input.value = "unoffered format";
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await page.locator("#sign-message-button").click();
        assert.equal(
          await page.locator("#message-signer-error").innerText(),
          "Select an offered message-signing format for this address.",
        );
        assert.equal(
          await page.evaluate(() => globalThis.__messageSigningLifecycle.constructions),
          0,
        );
        await page.locator("#message-signer-format-select").selectOption(selected);
      }
      await page.evaluate(() => {
        globalThis.Worker = class {
          constructor() {
            throw new Error("Synthetic native worker refusal detail");
          }
        };
      });
      await page.locator("#sign-message-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#message-signer-error").textContent === "Message signing failed.",
      );
      assert.equal(await page.locator("#sign-message-button").isDisabled(), false);
      assert.equal(await page.locator("#message-signature-output").inputValue(), "");
    } finally {
      await page.evaluate(() => {
        globalThis.Worker = globalThis.__messageSigningLifecycle.NativeWorker;
        delete globalThis.__messageSigningLifecycle;
      });
    }
  }
}

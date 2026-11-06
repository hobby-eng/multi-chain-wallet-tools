import assert from "node:assert/strict";

/** Real account controls use one policy for raw/Core exports and refuse unknown formats. */
export class AccountExportLifecycleCase {
  static async run(page, child = false) {
    const prefix = child ? "bip85-wallet-" : "";
    const dialog = page.locator(`#${prefix}account-export-dialog`);
    const copy = child
      ? dialog.locator('[data-bip85-descriptor="publicCopy"]')
      : page.locator("#copy-public-descriptors");
    const privateCopy = child
      ? dialog.locator('[data-bip85-descriptor="privateCopy"]')
      : page.locator("#copy-private-descriptors");
    const format = page.locator(`#${prefix}account-export-format`);
    await page.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
      const state = { descriptor, copies: [] };
      window.__accountClipboardNative = state;
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
      await page.locator(`#${prefix}open-account-export`).click();
      assert.equal(await privateCopy.isDisabled(), true);
      await format.selectOption("raw");
      await copy.click();
      await format.selectOption("core");
      await copy.click();
      const expected = await page.evaluate(() => {
        const [raw, core] = window.__accountClipboardNative.copies;
        const requests = JSON.parse(core.slice("importdescriptors '".length, -1));
        return { lines: raw.split("\n"), requests };
      });
      assert.equal(expected.lines.length, 2);
      assert.deepEqual(expected.requests, [
        { desc: expected.lines[0], timestamp: 0, active: true, internal: false },
        { desc: expected.lines[1], timestamp: 0, active: true, internal: true },
      ]);
      await format.evaluate((select) => {
        select.append(new Option("Synthetic refused format", "synthetic-refused-format"));
        select.value = "synthetic-refused-format";
      });
      await copy.click();
      assert.equal(await page.evaluate(() => window.__accountClipboardNative.copies.length), 2);
      assert.equal(
        await page.locator("#error").textContent(),
        "Choose a supported account export format.",
      );
    } finally {
      await format.selectOption("core");
      await page.locator(`#${prefix}close-account-export`).click();
      await page.evaluate(() => {
        const { descriptor } = window.__accountClipboardNative;
        if (descriptor === undefined) delete navigator.clipboard;
        else Object.defineProperty(navigator, "clipboard", descriptor);
        delete window.__accountClipboardNative;
      });
    }
  }
}

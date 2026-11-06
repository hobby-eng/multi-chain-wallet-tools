import assert from "node:assert/strict";

/** Challenge the native input boundary against the library's 100-code-point card-text allowance. */
export class MnemoCodeCardTextLengthsCase {
  static async run(context, profile, run, openWithLinkedPhrase) {
    const { page } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
    await page.locator("#mnemocode-encode-format").selectOption("colors");
    await page.locator("#mnemocode-cards-section > summary").click();
    await page.locator("#mnemocode-card-own-details").check();
    // This tests text admission, not whether a particular embedded font draws an emoji.
    // One supplementary scalar occupies two UTF-16 units in a browser's native input.
    const admitted = "\u{1f600}".repeat(100);
    for (const id of ["mnemocode-card-company", "mnemocode-card-slogan"]) {
      const input = page.locator(`#${id}`);
      await input.focus();
      await input.press("ControlOrMeta+A");
      await input.press("Backspace");
      await page.keyboard.insertText(admitted);
      assert.equal(await input.inputValue(), admitted, `Full admitted card text: ${id}`);
    }
    // Refused text remains intact, including supplementary scalars beyond the logical limit.
    let downloads = 0;
    page.on("download", () => {
      downloads += 1;
    });
    for (const text of ["X".repeat(101), "\u{1f600}".repeat(101)]) {
      const input = page.locator("#mnemocode-card-company");
      await input.focus();
      await input.press("ControlOrMeta+A");
      await input.press("Backspace");
      await page.keyboard.insertText(text);
      assert.equal(await input.inputValue(), text, "Refused input must not be truncated");
      await page.locator("#export-mnemocode-cards").click();
      await page.waitForFunction(() =>
        /maximum 100 characters/u.test(
          document.querySelector("#mnemocode-cards-status")?.textContent ?? "",
        ),
      );
      assert.equal(await input.inputValue(), text);
    }
    assert.equal(downloads, 0);
    assert.deepEqual(run.requests, []);
    run.checks.push(
      "Native profile/copy fields preserve 100 supplementary scalars; 101 ASCII or supplementary code points remain intact and are refused without an export.",
    );
  }
}

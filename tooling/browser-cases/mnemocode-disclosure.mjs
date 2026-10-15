import assert from "node:assert/strict";

/** Release-only browser regression; ordinary integration uses fake DOM/worker controls. */
export class MnemoCodeDisclosureCase {
  static async run(context, profile, run, openWithLinkedPhrase, waitText) {
    const { page } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
    const original = page.locator("#mnemocode-show-original");
    const masked = page.locator("#mnemocode-show-masked-words");
    assert.equal(await original.inputValue(), "none");
    assert.equal(await masked.isChecked(), false);
    await page.locator("#mnemocode-encode-mode").selectOption("seedshift");
    await page.locator("#mnemocode-encode-format").selectOption("colors");
    await page.locator("#mnemocode-encode-dates").fill("23-09-2026");
    await page.locator("#mnemocode-split-section > summary").click();
    await original.selectOption("both");
    await masked.check();
    await page.locator("#mnemocode-split").click();
    await waitText(page, "#mnemocode-split-status", /Split into/u);
    const result = page.locator("#mnemocode-split-result");
    assert.equal(
      await result
        .locator("article strong")
        .filter({ hasText: "Original wallet seed phrase" })
        .count(),
      2,
    );
    assert.equal(
      await result
        .locator("article strong")
        .filter({ hasText: "Masked/decoy seed phrase" })
        .count(),
      1,
    );
    const hiddenCopies = result
      .locator("article")
      .filter({ hasText: /Original wallet|Masked\/decoy seed/u });
    for (const copy of await hiddenCopies.all())
      assert.equal(
        await copy
          .locator(".share-secret")
          .evaluate((node) => node.classList.contains("concealed")),
        true,
      );
    await original.selectOption("none");
    assert.equal(await result.locator("article").count(), 0);
    await page.locator("#encode-mnemocode").click();
    assert.equal(
      await page
        .locator("#mnemocode-encode-result article strong")
        .filter({ hasText: "Masked/decoy seed phrase" })
        .count(),
      1,
    );
    run.checks.push(
      "Separate original/masked opt-ins, concealed copies and invalidation; no gallery.",
    );
  }
}

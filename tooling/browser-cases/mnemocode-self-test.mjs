import assert from "node:assert/strict";

/** Exercise MnemoCode's own self-test button in the composed browser feature. */
export class MnemoCodeSelfTestCase {
  static async run(context, profile, run, openWithLinkedPhrase, waitText) {
    const { page } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
    const before = await page.locator("#mnemonic").inputValue();
    await page.locator('[data-operation-tab][aria-controls="mnemocode-self-test-panel"]').click();
    await page.locator("#mnemocode-self-test").click();
    await waitText(page, "#mnemocode-self-test-status", /^(Every check passed:|Failed:)/u);
    assert.equal(
      await page.locator("#mnemocode-self-test-status").textContent(),
      "Every check passed: this copy of MnemoCode works.",
    );
    assert.ok((await page.locator("#mnemocode-self-test-result table tr").count()) > 1);
    assert.equal(await page.locator("#mnemonic").inputValue(), before);
    assert.deepEqual(run.requests, []);
    run.checks.push(
      "The MnemoCode self-test button runs its composed checks, reports success and preserves the existing source; library/vector evidence remains separate.",
    );
  }
}

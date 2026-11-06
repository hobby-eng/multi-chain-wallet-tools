import assert from "node:assert/strict";
import { BrowserFixtures } from "../browser-regressions/fixtures.mjs";

/** Confirm an old backup, make a new dated representation, then revoke the old confirmation. */
export class MnemoCodeReEncodingCase {
  static async run(context, profile, run, openWithLinkedPhrase) {
    const { page } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
    const expected = BrowserFixtures.sskrPhrase;
    assert.notEqual(expected, BrowserFixtures.mnemonic, "Handoff must replace the linked source");
    await page.locator('[data-operation-tab][aria-controls="mnemocode-reencode-panel"]').click();
    await page.locator("#mnemocode-reencode-mode").selectOption("direct");
    await page.locator("#mnemocode-reencode-format").selectOption("english");
    await page.locator("#mnemocode-reencode-input").fill(expected);
    await page.locator("#mnemocode-reencode-read").click();
    const oldPhrase = page.locator("#mnemocode-reencode-result textarea").first();
    await oldPhrase.waitFor({ state: "attached" });
    assert.equal(await oldPhrase.inputValue(), expected);
    assert.match(
      await page.locator("#mnemocode-reencode-result").textContent(),
      /They do not reveal the phrase\./u,
    );
    const continuation = page.locator("#mnemocode-reencode-continue");
    assert.equal(await continuation.isDisabled(), true);
    await page.locator("#mnemocode-reencode-person").check();
    assert.equal(await continuation.isDisabled(), false);
    await continuation.click();
    await page.locator("#mnemocode-create-panel").waitFor();

    await page.locator("#mnemocode-encode-mode").selectOption("seedshift");
    await page.locator("#mnemocode-encode-dates").fill("23-09-2026");
    await page.locator("#mnemocode-encode-format").selectOption("colors-unicode");
    await page.locator("#encode-mnemocode").click();
    const encoded = page.locator("#mnemocode-encode-result article .share-secret").first();
    await encoded.waitFor({ state: "attached" });
    const text = await encoded.textContent();
    assert.ok(typeof text === "string" && text.length > 0);
    await page.locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]').click();
    await page.locator("#mnemocode-decode-mode").selectOption("seedshift");
    await page.locator("#mnemocode-decode-dates").fill("23-09-2026");
    await page.locator("#mnemocode-decode-format").selectOption("colors-unicode");
    await page.locator("#mnemocode-input").fill(text);
    await page.locator("#decode-mnemocode").click();
    const recovered = page.locator("#mnemocode-decode-result textarea").first();
    await recovered.waitFor({ state: "attached" });
    assert.equal(await recovered.inputValue(), expected);
    assert.match(
      await page.locator("#mnemocode-decode-result").textContent(),
      /They do not reveal the phrase\./u,
    );

    await page.locator('[data-operation-tab][aria-controls="mnemocode-reencode-panel"]').click();
    await page.locator("#mnemocode-reencode-input").fill("");
    assert.equal(await page.locator("#mnemocode-reencode-confirmation").isHidden(), true);
    assert.equal(await continuation.isDisabled(), true);
    assert.equal(await page.locator("#mnemocode-reencode-person").isChecked(), false);
    assert.equal(await page.locator("#mnemocode-reencode-result").textContent(), "");
    assert.deepEqual(run.requests, []);
    run.checks.push(
      "Re-encode requires explicit confirmation, links the confirmed phrase into a new dated backup, and revokes confirmation on editing; host binding proof, not an independent cryptographic oracle.",
    );
  }
}

import assert from "node:assert/strict";
import { BrowserFixtures } from "../browser-regressions/fixtures.mjs";

// MHFE's published zero-12 vector: the 24-word container of the public BIP39 test phrase under
// "public test password" at the suite defaults (tooling/verify-mhfe-vector.mjs). The second
// password is synthetic and recovers another phrase, as a hidden wallet's password would.
const CONTAINER =
  "donate stove tower picnic iron rescue trick shrimp roof rib home cigar bag pledge also nerve cycle famous provide heart ahead chunk caution peace";
const PASSWORD = "public test password";
const OTHER_PASSWORD = "another public test password";

/** MHFE's Decode with two passwords: every phrase on one screen, each under its password. */
export class MhfeSeveralPasswordsCase {
  static async run(context, profile, run, openBackupPanel, storageSnapshot) {
    const { page, before } = await openBackupPanel(context, profile, run, "mhfe-panel");
    await page
      .locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-restore-panel"]')
      .click();
    await page.locator("#mhfe-container").fill(CONTAINER);
    // The container is read when the field is left, as a person moves on to the password.
    await page.locator("#mhfe-container").blur();
    // A 24-word container asks the original seed phrase's passphrase for its 16-bit check.
    await page.locator("#mhfe-decrypt-check-passphrase-field").waitFor();
    await page.locator("#mhfe-decrypt-password").fill(PASSWORD);
    const add = page.locator("#mhfe-decrypt-add-password");
    await add.click();
    await page.locator("#mhfe-decrypt-2-password").fill(OTHER_PASSWORD);
    assert.equal(
      await page.locator('label[for="mhfe-decrypt-password"]').innerText(),
      "Password 1",
    );
    assert.equal(
      await page.locator('label[for="mhfe-decrypt-2-password"]').innerText(),
      "Password 2",
    );
    // A stated length with a built-in check takes the container's own password alone, as mhfe.
    const length = page.locator("#mhfe-decrypt-source-words");
    await length.selectOption("12");
    assert.equal(await add.isVisible(), false);
    assert.equal(await page.locator("#mhfe-decrypt-2-password").isVisible(), false);
    assert.equal(await page.locator("#mhfe-decrypt-check-passphrase-field").isVisible(), false);
    await length.selectOption("0");
    assert.equal(await page.locator("#mhfe-decrypt-2-password").isVisible(), true);

    await page.locator("#mhfe-decrypt").click();
    // Two recoveries of 2 GiB each, one after the other: 4 to 7 minutes each in slow mode.
    await page.waitForFunction(
      () =>
        /^Recovery complete: the seed phrases of every password are below\.$|warning/u.test(
          `${document.querySelector("#mhfe-decrypt-status")?.textContent ?? ""}${
            document.querySelector("#mhfe-decrypt-status")?.classList.contains("warning") === true
              ? " warning"
              : ""
          }`,
        ),
      undefined,
      { timeout: 1_200_000 },
    );
    assert.equal(
      await page.locator("#mhfe-decrypt-status").textContent(),
      "Recovery complete: the seed phrases of every password are below.",
    );
    const result = page.locator("#mhfe-decrypt-result");
    assert.deepEqual(await result.locator("h3.mhfe-password-heading").allInnerTexts(), [
      "Password 1",
      "Password 2",
    ]);
    const phrases = result.locator("textarea");
    assert.ok((await phrases.count()) >= 2);
    assert.equal(await phrases.first().inputValue(), BrowserFixtures.mnemonic);
    assert.notEqual(await phrases.nth(1).inputValue(), BrowserFixtures.mnemonic);
    assert.match(await result.innerText(), /Recovered · 12 words · the built-in check passed/u);
    // Both passwords and the passphrase leave their fields once the work starts.
    assert.equal(await page.locator("#mhfe-decrypt-password").inputValue(), "");
    assert.equal(await page.locator("#mhfe-decrypt-2-password").inputValue(), "");
    assert.deepEqual(await storageSnapshot(page), before);
    assert.equal(run.requests.length, 0);
    run.checks.push(
      "MHFE Decode with two passwords: the second offered, left out for a stated length with a built-in check, both recovered in turn and shown under their own headings; fields emptied; storage/no HTTP",
    );
  }
}

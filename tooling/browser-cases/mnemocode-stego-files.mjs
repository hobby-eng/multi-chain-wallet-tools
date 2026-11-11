import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { literalJpeg } from "../../test/support/synthetic-carrier.ts";

const PASSWORD = "Public audit primary password 2026";
const DECOY_PASSWORD = "Different fictional decoy credential 9407";
const MESSAGE = "Public browser payload. ".repeat(9).slice(0, 187);
const DECOY = "Public browser decoy. ".repeat(10).slice(0, 187);
const PREFIX = "#mnemocode-stego";
// A bounded public acceptance fixture, not a carrier-size limit of the application.
const MAX_MP3_FIXTURE_BYTES = 8 * 1024 * 1024;

/** Actual worker, downloaded JPEG/MP3 bytes, password isolation and Clear acceptance. */
export class MnemoCodeStegoFilesCase {
  static async run(context, profile, run, openWithLinkedPhrase, waitText) {
    // A public MP3 is not in the repository: one is given by path, such as a synthetic tone.
    const mp3 = process.env.BROWSER_STEGO_PUBLIC_MP3;
    if (mp3 !== undefined) {
      const mp3Stat = statSync(mp3);
      assert.ok(mp3Stat.isFile() && mp3Stat.size > 0 && mp3Stat.size <= MAX_MP3_FIXTURE_BYTES);
    }
    const { page } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
    await page.locator('[data-operation-tab][aria-controls="mnemocode-stego-panel"]').click();
    const carriers = [
      {
        name: "public-synthetic.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from(literalJpeg(512, 512)),
      },
      ...(mp3 === undefined
        ? []
        : [{ name: "public-audio.mp3", mimeType: "audio/mpeg", buffer: readFileSync(mp3) }]),
    ];
    if (mp3 === undefined)
      run.checks.push("audio/mpeg: not run; set BROWSER_STEGO_PUBLIC_MP3 to a public MP3 file.");
    let lastSaved;
    for (const carrier of carriers) {
      const saved = await this.#hide(page, carrier, waitText);
      lastSaved = saved;
      assert.notDeepEqual(
        saved.buffer,
        carrier.buffer,
        "The downloaded carrier must contain changes.",
      );
      await this.#opened(page, saved, PASSWORD, MESSAGE, waitText);
      await this.#opened(page, saved, DECOY_PASSWORD, DECOY, waitText);
      await this.#wrongPassword(page, saved, waitText);
      run.checks.push(
        `${carrier.mimeType}: real downloaded bytes recover exact original/decoy; wrong password publishes no record.`,
      );
    }
    assert.ok(lastSaved);
    await this.#opened(page, lastSaved, PASSWORD, MESSAGE, waitText);
    assert.equal(await page.locator(`${PREFIX}-open-result .share-secret`).count(), 1);
    assert.ok((await page.locator(`${PREFIX}-hide-result button`).count()) > 0);
    // Back on the hide task, the last saved carrier's notice is still in view after Open.
    await page.locator(`${PREFIX}-task-hide`).check();
    const keepSourcePrivate = page
      .locator(`${PREFIX}-hide-result`)
      .getByText(/^Keep each source file private: /u);
    assert.equal(
      await keepSourcePrivate.isVisible(),
      true,
      "The last saved carrier's notice stands.",
    );
    await this.#clear(page);
    // Clear all drops the written result, and the notice with it.
    assert.equal(await keepSourcePrivate.count(), 0);
    assert.deepEqual(run.requests, []);
    run.checks.push("Clear removes stego secret fields, selected files and obsolete save actions.");
  }

  static async #hide(page, carrier, waitText) {
    await page.locator(`${PREFIX}-task-hide`).check();
    await page.locator(`${PREFIX}-kind-message`).check();
    await page.locator(`${PREFIX}-carriers`).setInputFiles(carrier);
    await page.locator(`${PREFIX}-text`).fill(MESSAGE);
    await page.locator(`${PREFIX}-password`).fill(PASSWORD);
    await page.locator(`${PREFIX}-password-again`).fill(PASSWORD);
    await page.locator(`${PREFIX}-decoy-enabled`).check();
    await page.locator(`${PREFIX}-decoy-text`).fill(DECOY);
    await page.locator(`${PREFIX}-decoy-password`).fill(DECOY_PASSWORD);
    await page.locator(`${PREFIX}-decoy-password-again`).fill(DECOY_PASSWORD);
    await page.locator(`${PREFIX}-analyze`).click();
    await waitText(page, `${PREFIX}-hide-status`, /Space checked in /u);
    const choices = page.locator(`${PREFIX}-capacity input[type="radio"]`);
    assert.equal(await choices.count(), 6);
    assert.ok(
      (await choices.locator(":scope:checked").count()) > 0,
      "A fitting density must be selected.",
    );
    await page.locator(`${PREFIX}-hide-run`).click();
    await waitText(page, `${PREFIX}-hide-status`, /Hidden in /u);
    const result = page.locator(`${PREFIX}-hide-result`);
    assert.match(await result.innerText(), /exact password-authenticated readback/u);
    const keepSourcePrivate = result.getByText(/^Keep each source file private: /u);
    assert.equal(await keepSourcePrivate.isVisible(), false, "Nothing is saved yet.");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      result.getByRole("button", { name: /^Save /u }).click(),
    ]);
    // After the save, MnemoCode's notice to keep the source private stays in view.
    assert.equal(await keepSourcePrivate.isVisible(), true);
    const path = await download.path();
    assert.ok(path);
    const buffer = readFileSync(path);
    const name = download.suggestedFilename();
    await download.delete();
    return { name, mimeType: carrier.mimeType, buffer };
  }

  static async #opened(page, saved, password, expected, waitText) {
    await page.locator(`${PREFIX}-task-open`).check();
    await page.locator(`${PREFIX}-open-carriers`).setInputFiles(saved);
    await page.locator(`${PREFIX}-open-password`).fill(password);
    await page.locator(`${PREFIX}-open-run`).click();
    await waitText(page, `${PREFIX}-open-status`, /Opened in /u);
    const result = page.locator(`${PREFIX}-open-result`);
    const secret = result.locator(".share-secret");
    assert.equal(await secret.textContent(), expected);
    assert.match(await secret.getAttribute("class"), /concealed/u);
    const save = result.getByRole("button", { name: "Save", exact: true });
    assert.equal(await save.isDisabled(), true);
    await page.locator("#toggle-mnemocode-stego-opened").click();
    assert.equal(await save.isEnabled(), true);
    const [download] = await Promise.all([page.waitForEvent("download"), save.click()]);
    const path = await download.path();
    assert.ok(path);
    assert.equal(readFileSync(path, "utf8"), expected);
    await download.delete();
  }

  static async #wrongPassword(page, saved, waitText) {
    await page.locator(`${PREFIX}-open-carriers`).setInputFiles(saved);
    await page.locator(`${PREFIX}-open-password`).fill("Wrong public browser password 8026");
    await page.locator(`${PREFIX}-open-run`).click();
    await waitText(page, `${PREFIX}-open-status`, /No hidden data found/u);
    assert.equal(await page.locator(`${PREFIX}-open-result .share-secret`).count(), 0);
    assert.equal(await page.locator(`${PREFIX}-open-result button`).count(), 0);
  }

  static async #clear(page) {
    await page.locator("#clear-all").evaluate((button) => button.click());
    assert.equal(await page.locator(`${PREFIX}-decoy-enabled`).isChecked(), false);
    for (const suffix of [
      "text",
      "decoy-text",
      "password",
      "password-again",
      "decoy-password",
      "decoy-password-again",
      "open-password",
    ])
      assert.equal(await page.locator(`${PREFIX}-${suffix}`).inputValue(), "", suffix);
    for (const suffix of ["carriers", "open-carriers"])
      assert.equal(
        await page.locator(`${PREFIX}-${suffix}`).evaluate((input) => input.files.length),
        0,
        suffix,
      );
    for (const suffix of ["hide-result", "open-result"])
      assert.equal(await page.locator(`${PREFIX}-${suffix} button`).count(), 0, suffix);
  }
}

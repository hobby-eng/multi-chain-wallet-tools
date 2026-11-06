import assert from "node:assert/strict";

// MHFE's public full-size zero-12 vector and independently generated four-word repair card,
// retained in producer scripts/public-test-data.mjs and scripts/browser-check/page-values.mjs.
const CONTAINER =
  "donate stove tower picnic iron rescue trick shrimp roof rib home cigar bag pledge also nerve cycle famous provide heart ahead chunk caution peace";
const CARD = ["shaft", "pupil", "patient", "jewel"];
// The page's admission of an MHFE field: MHFE's typed line (TYPED_LINE_BYTES), in raw UTF-8 bytes.
const RAW_INPUT_BYTES = 8192;

/** Actual host/WASM repair and raw-input admission; no Argon2 recovery or application-module fake. */
export class MhfeInputLifecycleCase {
  #page;
  constructor(page) {
    this.#page = page;
  }

  /** Checks both raw overflow paths, one exact card, and one repaired public container. */
  async run() {
    const page = this.#page;
    await page.locator('#mhfe-panel [aria-controls="mhfe-create-panel"]').click();
    const raw = " ".repeat(RAW_INPUT_BYTES + 1);
    await page.locator("#mhfe-source").fill(raw);
    assert.equal((await page.locator("#mhfe-source").inputValue()).length, raw.length);
    await page.locator("#mhfe-encrypt").click();
    await this.#refusal("#mhfe-encrypt-status");
    assert.equal(await page.locator("#mhfe-encrypt-result").locator("textarea").count(), 0);
    assert.equal(await page.locator("#mhfe-source").inputValue(), raw);
    await page.locator('#mhfe-panel [aria-controls="mhfe-repair-panel"]').click();
    await page.locator("#mhfe-repair-words-container").fill(CONTAINER);
    await page.locator("#mhfe-repair-words-count-4").check();
    await page.locator("#mhfe-repair-words-run").click();
    const card = page.locator("#mhfe-repair-words-result .mhfe-repair-grid");
    await card.waitFor();
    assert.deepEqual(
      await card.locator("span").allTextContents(),
      CARD.map((word, at) => `${at + 1}/${CARD.length} ${word}`),
    );
    assert.equal(await card.getAttribute("class"), "mhfe-repair-grid concealed share-secret");
    const damaged = CONTAINER.split(" ");
    damaged[2] = "?";
    await page.locator("#mhfe-repair-container").fill(damaged.join(" "));
    await page.locator("#mhfe-repair-card").fill(CARD.join(" "));
    await page.locator("#mhfe-repair-container-run").click();
    const recovered = page.locator("#mhfe-repair-container-result textarea");
    await recovered.waitFor();
    assert.equal(await recovered.inputValue(), CONTAINER);
    assert.ok((await recovered.getAttribute("class")).includes("concealed"));
    await page.locator("#mhfe-repair-card").fill("a".repeat(RAW_INPUT_BYTES + 1));
    await page.locator("#mhfe-repair-container-run").click();
    await this.#refusal("#mhfe-repair-container-result");
    assert.equal(await page.locator("#mhfe-repair-container-result textarea").count(), 0);
    return {
      exactCard: true,
      repairedPublicContainer: true,
      rawEncodeRefused: true,
      rawRepairRefused: true,
      argon2RecoveryRun: false,
    };
  }

  async #refusal(selector) {
    await this.#page.waitForFunction(
      ({ selector, limit }) =>
        document.querySelector(selector).textContent.includes(`longer than ${limit} bytes`),
      { selector, limit: RAW_INPUT_BYTES.toLocaleString("en-US") },
    );
  }
}

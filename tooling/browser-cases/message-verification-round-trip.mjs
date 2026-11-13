import assert from "node:assert/strict";

/**
 * The signing dialog's own verification, on the signatures its worker just made: valid for the
 * row's address, not valid once the message changes, a blank signature refused; and, where the
 * address also offers the compact format, a compact signature signed and checked in it, and
 * pointed to it when pasted under the default format. No seed or key is involved in a check.
 */
export class MessageVerificationRoundTripCase {
  #page;

  constructor(page) {
    this.#page = page;
  }

  /**
   * Runs on the open dialog after `signature` of `message` came out, in either edition; answers
   * whether the address offered a compact format, which was then checked too. `tampered` is another
   * message in the same format, such as more hex bytes for a binary payload.
   */
  async run(message, signature, tampered = `${message} tampered`) {
    const page = this.#page;
    const address = await page.locator("#message-signer-address").innerText();
    await page.locator("#message-verification-signature").fill(signature);
    await this.#verify(new RegExp(`^Valid for ${address} · `, "u"));
    await page.locator("#message-signer-message").fill(tampered);
    // An edit retires the earlier answer before anything is checked again.
    assert.equal(await page.locator("#message-verification-result").innerText(), "");
    await this.#verify(/^Not valid for this address · /u);
    await page.locator("#message-verification-signature").fill(" ");
    await this.#refused("Paste the signature to verify.");
    await page.locator("#message-signer-message").fill(message);
    return await this.#compact(address);
  }

  /** Signs and checks in the address's compact format, if it offers one beside its default. */
  async #compact(address) {
    const page = this.#page;
    if (!(await page.locator("#message-signer-format-field").isVisible())) return false;
    const select = page.locator("#message-signer-format-select");
    const initial = await select.inputValue();
    const compact = await select.evaluate((menu) =>
      [...menu.options].map((option) => option.value).find((value) => value.endsWith("-compact")),
    );
    if (compact === undefined) return false;
    await select.selectOption(compact);
    await page.locator("#sign-message-button").click();
    await page.locator("#message-signature-result").waitFor({ state: "visible" });
    const signature = await page.locator("#message-signature-output").inputValue();
    await page.locator("#message-verification-signature").fill(signature);
    await this.#verify(new RegExp(`^Valid for ${address} · .*compact`, "u"));
    await select.selectOption(initial);
    await this.#refused(/^This is a compact signature: choose “.+” as the signature format/u);
    return true;
  }

  async #verify(expected) {
    const page = this.#page;
    await page.locator("#verify-message-signature-button").click();
    await page.waitForFunction(
      () => document.querySelector("#message-verification-result")?.textContent !== "",
    );
    assert.match(await page.locator("#message-verification-result").innerText(), expected);
    assert.equal(await page.locator("#message-verification-error").isVisible(), false);
  }

  async #refused(expected) {
    const page = this.#page;
    await page.locator("#verify-message-signature-button").click();
    await page.locator("#message-verification-error").waitFor({ state: "visible" });
    const text = await page.locator("#message-verification-error").innerText();
    if (typeof expected === "string") assert.equal(text, expected);
    else assert.match(text, expected);
    assert.equal(await page.locator("#message-verification-result").innerText(), "");
  }
}

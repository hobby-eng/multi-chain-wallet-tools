import assert from "node:assert/strict";

// Published BIP38 Satoshi scalar; Dash/test-network encodings independently computed
// with Python secp256k1/scrypt and OpenSSL AES after reproducing its published mainnet answer.
const PASSWORD = "Satoshi";
const PRIVATE_HEX = "09c2686880095b1a4c249ee3ac4eea8a014f11e6f986d0b5025ac1f39afbd9ae";
const ANSWERS = {
  bitcoin: {
    encryptedKey: "6PYLtMnXvfG3oJde97zRyLYFZCYizPU5T3LwgdYJz1fRhh16bU7u6PPmY7",
    address: "1HmPbwsvG5qJ3KJfxzsZRZWhbm1xBMuS8B",
    wif: "KwYgW8gcxj1JWJXhPSu4Fqwzfhp5Yfi42mdYmMa4XqK7NJxXUSK7",
  },
  dash: {
    encryptedKey: "6PYMfcjoDw2h66ho6AkKVzv9tQVv5dbeBG4mUQEaTzVQtJ2A2Ts4Sn4BpH",
    address: "XsTESCXpDo3tCFuFptBnH6CVS6beCGeKVh",
    wif: "XBcbxQ4zGQdkZdY5RCtvm591aj5ezUKJQLyTHsuFrCbCmU6nVyFo",
  },
};
const REGTEST = {
  encryptedKey: "6PYR63Hbut6L25z7t9mufV6wiiqcjfkV3AEKkyKCCNUZXoE6f8yoAc4JPq",
  address: "mxHLtzxu57GYpRnHgZqwFUj2Tkcf5LPQg5",
  wif: "cMufy3gUPnhZfjzxmriBdAT4Hw7VD7ok6on1sn2a2wy7d41whF9n",
};

/** Native page controls with actual KDFs; no application module or cryptographic replacement. */
export class Bip38LifecycleCase {
  #page;
  constructor(page) {
    this.#page = page;
  }

  /** Checks exact outputs, concealment, retained-field cleanup and stale queued-request admission. */
  async run() {
    const page = this.#page;
    await page.locator('[data-mode="bip38"]').click();
    const bitcoin = (await page.locator('#bip38-chain option[value="bitcoin"]').count()) > 0;
    const chain = bitcoin ? "bitcoin" : "dash";
    const answer = ANSWERS[chain];
    await page.locator("#bip38-chain").selectOption(chain);
    await page.locator("#bip38-network").selectOption("mainnet");
    await this.#recover(answer);
    await this.#retainedFields();
    await this.#staleQueue(answer);
    if (bitcoin) {
      await page.locator("#bip38-network").selectOption("regtest");
      await this.#recover(REGTEST);
    } else {
      assert.equal(await page.locator('#bip38-network option[value="regtest"]').count(), 0);
      await this.#recover(answer);
    }
    const fields = await page.locator("[data-bip38-secret]").elementHandles();
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    for (const field of fields) assert.equal(await field.evaluate((input) => input.value), "");
    assert.equal(await page.locator("#bip38-password").inputValue(), "");
    assert.equal(await page.locator("#bip38-result-list").locator("input").count(), 0);
    return {
      chain,
      exactKey: true,
      queuedLiteralGuard: true,
      retainedFieldsCleared: true,
      regtest: bitcoin,
      dispatchedPageHide: true,
    };
  }

  async #recover(answer) {
    const page = this.#page;
    await page.locator("#bip38-encrypted-key").fill(answer.encryptedKey);
    await page.locator("#bip38-password").fill(PASSWORD);
    await page.locator("#decrypt-bip38").click();
    await page.waitForFunction(() =>
      document.getElementById("bip38-progress").textContent.startsWith("Finished "),
    );
    assert.equal(await page.locator("#bip38-error").isVisible(), false);
    assert.match(await page.locator("#bip38-result-list").innerText(), new RegExp(answer.address));
    assert.deepEqual(
      await page
        .locator("[data-bip38-secret]")
        .evaluateAll((inputs) => inputs.map((input) => input.value)),
      [answer.wif, PRIVATE_HEX],
    );
    assert.equal(await page.locator("#bip38-password").inputValue(), "");
    assert.deepEqual(
      await page
        .locator("[data-bip38-secret]")
        .evaluateAll((inputs) => inputs.map((input) => input.type)),
      ["password", "password"],
    );
  }

  async #retainedFields() {
    const page = this.#page;
    const fields = await page.locator("[data-bip38-secret]").elementHandles();
    const copy = await page.locator("[data-copy-bip38-secret]").elementHandles();
    await page.locator("#toggle-bip38-result").click();
    assert.equal(await fields[0].evaluate((input) => input.type), "text");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal(await fields[0].evaluate((input) => input.type), "password");
    await page.locator("#clear-bip38").click();
    for (const field of fields) assert.equal(await field.evaluate((input) => input.value), "");
    for (const button of copy) assert.equal(await button.evaluate((input) => input.disabled), true);
  }

  async #staleQueue(answer) {
    const page = this.#page;
    const changed = "Synthetic literal typed after queueing";
    // One native event-loop turn guarantees both clicks occur before a KDF completion publishes.
    const queued = await page.evaluate(
      ({ key, password, changed }) => {
        const input = document.getElementById("bip38-encrypted-key");
        const secret = document.getElementById("bip38-password");
        const button = document.getElementById("decrypt-bip38");
        input.value = key;
        secret.value = "Synthetic preceding password";
        button.click();
        document.getElementById("clear-bip38").click();
        input.value = key;
        secret.value = password;
        button.click();
        secret.value = changed;
        return button.textContent;
      },
      { key: answer.encryptedKey, password: PASSWORD, changed },
    );
    assert.match(queued, /preceding/);
    await page.waitForFunction(
      () => document.getElementById("decrypt-bip38").textContent === "Decrypt keys",
    );
    assert.equal(await page.locator("#bip38-password").inputValue(), changed);
    assert.equal(await page.locator("[data-bip38-secret]").count(), 0);
    assert.equal(await page.locator("#bip38-results").isVisible(), false);
    assert.equal(await page.locator("#bip38-error").isVisible(), false);
  }
}

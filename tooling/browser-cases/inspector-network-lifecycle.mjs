import assert from "node:assert/strict";

const SCRIPT = "76a914751e76e8199196d454941c45d1b3a323f1433bd688ac";
const DESCRIPTOR = "pkh(0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798)";
// Public generator HASH160, independently reproduced with Python Base58Check.
const MAINNET = "XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE";
const TESTNET = "yWziQMcwmKjRdzi7eWjwiQX8EjWcd6dSg6";

/** Real Script and descriptor controls must never label a mainnet address as a test result. */
export class InspectorNetworkLifecycleCase {
  #page;

  constructor(page) {
    this.#page = page;
  }

  /** Tests the offered Dash networks and, where offered, the Bitcoin-regtest transition. */
  async run() {
    const page = this.#page;
    const hasDash = (await page.locator('#script-chain option[value="dash"]').count()) > 0;
    if (!hasDash) return { dash: false, transition: false };
    const hasBitcoin = (await page.locator('#script-chain option[value="bitcoin"]').count()) > 0;
    const before = await page.evaluate(() =>
      Object.fromEntries(
        [
          "script-chain",
          "script-network",
          "script-role",
          "script-branch",
          "script-wildcard-index",
          "script-input",
        ].map((id) => [id, document.getElementById(id).value]),
      ),
    );
    try {
      await page.locator("#script-role").selectOption("script-pubkey");
      await page.locator("#script-branch").selectOption("0");
      await page.locator("#script-wildcard-index").fill("0");
      for (const input of [SCRIPT, DESCRIPTOR]) {
        if (hasBitcoin) {
          await page.locator("#script-chain").selectOption("bitcoin");
          await page.locator("#script-network").selectOption("regtest");
          await this.#decode(input);
          await page.locator("#script-chain").selectOption("dash");
          assert.equal(await page.locator("#script-network").inputValue(), "testnet");
          assert.equal(await page.locator("#script-results").isVisible(), false);
          assert.equal(
            await page.locator('#script-network option[value="regtest"]').isDisabled(),
            true,
          );
        } else {
          assert.equal(await page.locator("#script-chain").inputValue(), "dash");
          await page.locator("#script-network").selectOption("testnet");
          assert.equal(await page.locator('#script-network option[value="regtest"]').count(), 0);
        }
        await this.#decode(input, TESTNET);
        assert.equal((await page.locator("#script-results").innerText()).includes(MAINNET), false);
        await page.locator("#script-network").selectOption("mainnet");
        assert.equal(await page.locator("#script-results").isVisible(), false);
        await this.#decode(input, MAINNET);
      }
      return { dash: true, transition: hasBitcoin };
    } finally {
      if (hasBitcoin) await page.locator("#script-chain").selectOption(before["script-chain"]);
      await page.locator("#script-network").selectOption(before["script-network"]);
      await page.locator("#script-role").selectOption(before["script-role"]);
      await page.locator("#script-branch").selectOption(before["script-branch"]);
      await page.locator("#script-wildcard-index").fill(before["script-wildcard-index"]);
      await page.locator("#script-input").fill(before["script-input"]);
    }
  }

  async #decode(input, expected) {
    await this.#page.locator("#script-input").fill(input);
    await this.#page.locator("#decode-script").click();
    await this.#page.locator("#script-results").waitFor({ state: "visible" });
    assert.equal(await this.#page.locator("#script-error").isVisible(), false);
    if (expected !== undefined)
      assert.ok((await this.#page.locator("#script-results").innerText()).includes(expected));
  }
}

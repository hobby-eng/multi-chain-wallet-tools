import assert from "node:assert/strict";

// The public BIP39 test phrase, typed into Encode's phrase field; nothing is encrypted.
const PHRASE = `${"abandon ".repeat(11)}about`;
// MHFE 0.8.0's memory levels 0 to 21 (its core parameters' maxMemoryLevel).
const LEVELS = 22;
// A synthetic container password, typed into Encode's own password fields.
const PASSWORD = "public browser test password";
// The owner's example of 2026-11-11, checked against mhfe 0.8.0's encrypt options.
const OWNER_EXAMPLE =
  "mhfe encrypt --pim 3 --mem 2 --same-length --new-password check-word --repair-words 4";

/**
 * Encode's memory level and the mhfe command beside it: shown only for a PIM or level other than
 * 0, with the exact text for every choice and a refusal for an empty PIM, copied exactly with the
 * phrase hidden and shown, with no phrase word, typed password or made password in it, no password
 * made or shown above level 0 (one made at level 0 comes back unchanged), and Encrypt closed there. Copy writes to a recording stand-in for the
 * clipboard; no Argon2 runs.
 */
export class MhfeEncryptCommandCase {
  #page;
  constructor(page) {
    this.#page = page;
  }

  async run() {
    const page = this.#page;
    await page.locator('#mhfe-panel [aria-controls="mhfe-create-panel"]').click();
    await page.waitForFunction(
      (count) => document.querySelectorAll("#mhfe-encrypt-memory-level option").length === count,
      LEVELS,
    );
    await page.locator("#mhfe-repair-count-4").check();
    await this.#recordCopies();
    const level = page.locator("#mhfe-encrypt-memory-level");
    assert.equal(await level.inputValue(), "0");
    assert.equal(await level.locator("option").first().textContent(), "0 · 2 GiB (default)");
    assert.equal(await level.locator("option").last().textContent(), "21 · 3 TiB");
    await this.#expect(null, { encrypt: true });
    await page.locator("#mhfe-source").fill(PHRASE);
    await page.locator("#mhfe-encrypt-password").fill(PASSWORD);
    await page.locator("#mhfe-encrypt-password-confirm").fill(PASSWORD);

    // A custom PIM still encrypts here, and the command is shown in addition.
    await page.locator("#mhfe-encrypt-use-pim").check();
    await page.locator("#mhfe-encrypt-pim").fill("");
    await this.#refused("Type the PIM as a whole number, or untick “Use a custom PIM”.");
    await page.locator("#mhfe-encrypt-pim").fill("3");
    const own = "mhfe encrypt --pim 3 --mem 0 --new-password own --repair-words 4";
    await this.#expect(own, { encrypt: true, lengthNote: true, madeNote: false });
    await this.#copy(own);

    // At level 0 the page makes the password it would encrypt with; it never enters the command.
    await page.locator("#mhfe-encrypt-password-kind-words").check();
    await page.waitForFunction(
      () => (document.querySelector("#mhfe-encrypt-made-text")?.textContent ?? "") !== "",
    );
    const made = await page.locator("#mhfe-encrypt-made-text").textContent();
    const words = "mhfe encrypt --pim 3 --mem 0 --new-password words --repair-words 4";
    await this.#expect(words, { encrypt: true, madeNote: true });
    await this.#copy(words);

    // Raised above level 0, the page keeps that password out of sight: only mhfe makes one there.
    const raised = "mhfe encrypt --pim 3 --mem 2 --new-password words --repair-words 4";
    await level.selectOption("2");
    await this.#noPasswordMade(raised);
    await this.#expect(raised, { encrypt: false, madeNote: true });
    // Back at level 0 it asks for the same password as written down, not a new one.
    await level.selectOption("0");
    await page.locator("#mhfe-encrypt-made-copy-field").waitFor();
    assert.equal(await page.locator("#mhfe-encrypt-made-text").textContent(), "");
    await page.locator("#mhfe-encrypt-made-again").click();
    assert.equal(await page.locator("#mhfe-encrypt-made-text").textContent(), made);
    await level.selectOption("2");
    await this.#noPasswordMade(raised);
    await page.locator("#mhfe-length-same").check();
    await page.locator("#mhfe-encrypt-password-kind-checkWord").check();
    await this.#noPasswordMade(OWNER_EXAMPLE);
    await this.#expect(OWNER_EXAMPLE, { encrypt: false, lengthNote: false, madeNote: true });
    await this.#copy(OWNER_EXAMPLE);
    await page.locator("#toggle-mhfe-source").click();
    const shown = await page
      .locator("#mhfe-source")
      .evaluate((field) => !field.classList.contains("concealed"));
    assert.equal(shown, true);
    await this.#expect(OWNER_EXAMPLE, { encrypt: false });
    await this.#copy(OWNER_EXAMPLE);

    await page.locator("#mhfe-encrypt-password-kind-characters").check();
    await page.locator("#mhfe-length-24").check();
    await page.locator("#mhfe-repair-count-none").check();
    const chars = "mhfe encrypt --pim 3 --mem 2 --new-password chars --repair-words 0";
    await this.#noPasswordMade(chars);
    await this.#expect(chars, { encrypt: false, lengthNote: true });
    await page.locator("#mhfe-encrypt-password-kind-own").check();
    await page.locator("#mhfe-encrypt-use-pim").uncheck();
    await level.selectOption("21");
    await this.#expect("mhfe encrypt --pim 0 --mem 21 --new-password own --repair-words 0", {
      encrypt: false,
      madeNote: false,
    });

    // Back at the defaults the command goes away and Encrypt opens again.
    await level.selectOption("0");
    await this.#expect(null, { encrypt: true });
    const copied = await page.evaluate(() => window.__mhfeCommandCopies);
    assert.deepEqual(copied, [own, words, OWNER_EXAMPLE, OWNER_EXAMPLE]);
    const secrets = [...new Set(PHRASE.split(" ")), PASSWORD, made];
    for (const secret of secrets)
      assert.ok(!copied.some((text) => text.includes(secret)), "a secret was copied");
    return {
      commandOnlyAboveDefaults: true,
      exactCommandText: true,
      emptyPimRefused: true,
      copiedWithPhraseHiddenAndShown: true,
      noSecretInCommandOrCopies: true,
      noPasswordMadeAboveLevelZero: true,
      encryptClosedAboveLevelZero: true,
      argon2Run: false,
    };
  }

  /**
   * No password made is shown or asked for: above level 0 the made kinds only set the command.
   * The page decides in the same event that renders the command, so once `line` shows, the
   * decision for the choice just made is on the page.
   */
  async #noPasswordMade(line) {
    const page = this.#page;
    await page.waitForFunction(
      (expected) => document.querySelector("#mhfe-encrypt-command-text").textContent === expected,
      line,
    );
    assert.equal(await page.locator("#mhfe-encrypt-made-shown").isVisible(), false);
    assert.equal(await page.locator("#mhfe-encrypt-made-text").textContent(), "");
    assert.equal(await page.locator("#mhfe-encrypt-made-copy-field").isVisible(), false);
  }

  /** The command offered but refused for a setting, with Copy off and the refusal said. */
  async #refused(message) {
    const page = this.#page;
    assert.equal(await page.locator("#mhfe-encrypt-command").isVisible(), true);
    assert.equal(await page.locator("#mhfe-encrypt-command-text").textContent(), "");
    assert.equal(await page.locator("#mhfe-encrypt-command-copy").isDisabled(), true);
    assert.equal(await page.locator("#mhfe-encrypt-command-status").textContent(), message);
  }

  /** Records what Copy writes instead of reaching the system clipboard. */
  async #recordCopies() {
    await this.#page.evaluate(() => {
      window.__mhfeCommandCopies = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__mhfeCommandCopies.push(text);
          },
        },
      });
    });
  }

  /** The command shown, or none for null, with Encrypt open or closed and the notes beside it. */
  async #expect(line, { encrypt, lengthNote, madeNote }) {
    const page = this.#page;
    assert.equal(await page.locator("#mhfe-encrypt").isEnabled(), encrypt);
    assert.equal(await page.locator("#mhfe-encrypt-command").isVisible(), line !== null);
    if (line === null) return;
    assert.equal(await page.locator("#mhfe-encrypt-command-text").textContent(), line);
    if (lengthNote !== undefined)
      assert.equal(await page.locator("#mhfe-encrypt-command-length").isVisible(), lengthNote);
    if (madeNote !== undefined)
      assert.equal(await page.locator("#mhfe-encrypt-command-made").isVisible(), madeNote);
  }

  /** Presses Copy and checks that exactly `line` was written and the page says so. */
  async #copy(line) {
    const page = this.#page;
    const before = await page.evaluate(() => window.__mhfeCommandCopies.length);
    await page.locator("#mhfe-encrypt-command-copy").click();
    await page.waitForFunction(
      (count) =>
        window.__mhfeCommandCopies.length === count + 1 &&
        document.querySelector("#mhfe-encrypt-command-status").textContent ===
          "Copied to clipboard.",
      before,
    );
    assert.equal(await page.evaluate(() => window.__mhfeCommandCopies.at(-1)), line);
  }
}

import assert from "node:assert/strict";
import { MhfeEncryptCommandCase } from "./mhfe-encrypt-command.mjs";

// MHFE 0.8.0's memory levels 0 to 21 (its core parameters' maxMemoryLevel).
const LEVELS = 22;
// Synthetic values typed into the tabs' secret fields; none may reach a command or a copy.
const SECRETS = {
  password: "public browser test password",
  passphrase: "public browser test passphrase",
  address: "public-browser-test-address",
  // The master key fingerprint of the public BIP39 test phrase "abandon … about".
  fingerprint: "73c5da0a",
};
// The coin and one path of an address check in each edition: mhfe's docs/CLI.md examples.
const ADDRESS = {
  "multi-chain": { coin: "bitcoin", path: "m/84'/0'/0'/0/5", loaded: "" },
  // The Dash edition offers Dash alone, chosen once the coins load.
  "dash-community": { coin: "dash", path: "m/44'/5'/0'/0/0", loaded: " --coin dash" },
};

/**
 * The mhfe command on every MHFE tab: Encode's steps (MhfeEncryptCommandCase), then Decode, Check,
 * Change password and Hidden wallets. On each: every memory level offered, no command at the
 * defaults, the exact command for a PIM and a higher level, copied exactly, the tab's work closed
 * above level 0, and nothing typed into a secret field in a command or a copy. Hidden wallets
 * shows Decode's command. Copy writes to a recording stand-in for the clipboard; no Argon2 runs.
 */
export class MhfeCommandCase {
  #page;
  #edition;

  constructor(page, edition) {
    this.#page = page;
    this.#edition = edition;
  }

  async run() {
    const encode = await new MhfeEncryptCommandCase(this.#page).run();
    const before = await this.#copies();
    await this.#decode();
    await this.#check();
    await this.#rekey();
    await this.#wallets();
    const copied = (await this.#copies()).slice(before.length);
    assert.equal(copied.length, 4);
    for (const secret of Object.values(SECRETS))
      assert.ok(!copied.some((text) => text.includes(secret)), "a secret was copied");
    return {
      ...encode,
      everyTabOffersEveryLevel: true,
      exactCommandOnEveryTab: true,
      hiddenWalletsShowDecodesCommand: true,
      workClosedAboveLevelZeroOnEveryTab: true,
      noSecretInCommandOrCopiesOnEveryTab: true,
      passphraseAnswerNeverWritten: true,
    };
  }

  async #decode() {
    const page = this.#page;
    await this.#open("restore", "decrypt");
    await page.locator("#mhfe-decrypt-password").fill(SECRETS.password);
    await this.#expect("decrypt", null, "#mhfe-decrypt", true);
    await this.#settings("decrypt", { pim: "3", level: "2" });
    await this.#expect("decrypt", "mhfe decrypt --pim 3 --mem 2", "#mhfe-decrypt", false);
    await page.locator("#mhfe-decrypt-source-words").selectOption("24");
    const line = "mhfe decrypt --pim 3 --mem 2 --words 24";
    await this.#expect("decrypt", line, "#mhfe-decrypt", false);
    assert.equal(await page.locator("#mhfe-decrypt-command-more").isVisible(), true);
    // A stated length with a built-in check takes one password: mhfe offers no other.
    await page.locator("#mhfe-decrypt-source-words").selectOption("12");
    await this.#expect(
      "decrypt",
      "mhfe decrypt --pim 3 --mem 2 --words 12",
      "#mhfe-decrypt",
      false,
    );
    assert.equal(await page.locator("#mhfe-decrypt-command-one").isVisible(), true);
    assert.equal(await page.locator("#mhfe-decrypt-command-more").isVisible(), false);
    await page.locator("#mhfe-decrypt-source-words").selectOption("24");
    await this.#expect("decrypt", line, "#mhfe-decrypt", false);
    await this.#copy("decrypt", line);
    await page.locator("#mhfe-decrypt-source-words").selectOption("0");
    await page.locator("#mhfe-decrypt-use-pim").uncheck();
    await this.#settings("decrypt", { level: "0" });
    await this.#expect("decrypt", null, "#mhfe-decrypt", true);
  }

  async #check() {
    const page = this.#page;
    const { coin, path, loaded } = ADDRESS[this.#edition];
    await this.#open("check", "check");
    await page.locator("#mhfe-check-password").fill(SECRETS.password);
    await page.locator("#mhfe-check-passphrase").fill(SECRETS.passphrase);
    await this.#settings("check", { pim: "3", level: "2" });
    await this.#expect("check", "mhfe check --pim 3 --mem 2", "#mhfe-check", false);
    assert.equal(await page.locator("#mhfe-check-command-list").isVisible(), true);
    await page.locator("#mhfe-check-ref-address").check();
    await page.locator(`#mhfe-check-coin option[value="${coin}"]`).waitFor({ state: "attached" });
    // The command follows the coin the list shows once loaded, before any further edit.
    const address = `mhfe check --pim 3 --mem 2 --address${loaded}`;
    await this.#expect("check", address, "#mhfe-check", false);
    await page.locator("#mhfe-check-coin").selectOption(coin);
    await page.locator("#mhfe-check-address").fill(SECRETS.address);
    await page.locator("#mhfe-check-use-path").check();
    await page.locator("#mhfe-check-path").fill(path);
    const line = `mhfe check --pim 3 --mem 2 --address --coin ${coin} --path "${path}"`;
    await this.#expect("check", line, "#mhfe-check", false);
    assert.equal(await page.locator("#mhfe-check-command-list").isVisible(), false);
    await this.#copy("check", line);
    await page.locator("#mhfe-check-ref-fingerprint").check();
    await page.locator("#mhfe-check-fingerprint").fill(SECRETS.fingerprint);
    await this.#expect("check", "mhfe check --pim 3 --mem 2 --fingerprint", "#mhfe-check", false);
    await page.locator("#mhfe-check-ref-builtInCheck").check();
    await page.locator("#mhfe-check-words").selectOption("12");
    await this.#expect("check", "mhfe check --pim 3 --mem 2 --words 12", "#mhfe-check", false);
    await page.locator("#mhfe-check-use-pim").uncheck();
    await this.#settings("check", { level: "0" });
    await this.#expect("check", null, "#mhfe-check", true);
  }

  async #rekey() {
    const page = this.#page;
    await this.#open("rekey", "rekey");
    await this.#levels("rekey-new");
    await page.locator("#mhfe-rekey-password").fill(SECRETS.password);
    await this.#settings("rekey", { pim: "1", level: "1" });
    await page.locator("#mhfe-rekey-words").selectOption("24");
    await page.locator("#mhfe-rekey-ref-fingerprint").check();
    await page.locator("#mhfe-rekey-wallet-passphrase-yes").check();
    await page.locator("#mhfe-rekey-fingerprint").fill(SECRETS.fingerprint);
    await page.locator("#mhfe-rekey-passphrase").fill(SECRETS.passphrase);
    await page.locator("#mhfe-rekey-new-memory-level").selectOption("2");
    await page.locator("#mhfe-rekey-new-password-kind-checkWord").check();
    await page.locator("#mhfe-rekey-repair-count-8").check();
    const line =
      "mhfe rekey --pim 1 --mem 1 --words 24 --confirm fingerprint --new-pim 0 --new-mem 2 --new-password check-word --repair-words 8";
    await this.#expect("rekey", line, "#mhfe-rekey", false);
    assert.equal(await page.locator("#mhfe-rekey-command-made").isVisible(), true);
    // Above level 0 mhfe makes the password: the page neither makes nor shows one.
    assert.equal(await page.locator("#mhfe-rekey-new-made-shown").isVisible(), false);
    assert.equal(await page.locator("#mhfe-rekey-new-made-text").textContent(), "");
    await this.#copy("rekey", line);
    await page.locator("#mhfe-rekey-new-password-kind-own").check();
    await page.locator("#mhfe-rekey-use-pim").uncheck();
    await this.#settings("rekey", { level: "0" });
    await page.locator("#mhfe-rekey-new-memory-level").selectOption("0");
    await this.#expect("rekey", null, "#mhfe-rekey", true);
  }

  async #wallets() {
    const page = this.#page;
    await this.#open("wallets", "wallets");
    await page.locator("#mhfe-wallets-main-passphrase").fill(SECRETS.passphrase);
    await this.#settings("wallets", { pim: "3", level: "2" });
    // Decode's command at the same settings, so a shell history cannot tell them apart.
    const line = "mhfe decrypt --pim 3 --mem 2";
    await this.#expect("wallets", line, "#mhfe-wallets-start", false);
    await this.#copy("wallets", line);
    await page.locator("#mhfe-wallets-use-pim").uncheck();
    await this.#settings("wallets", { level: "0" });
    await this.#expect("wallets", null, "#mhfe-wallets-start", true);
  }

  /** Opens an operation tab and waits for every memory level of its first choice. */
  async #open(panel, prefix) {
    await this.#page.locator(`#mhfe-panel [aria-controls="mhfe-${panel}-panel"]`).click();
    await this.#levels(prefix);
  }

  async #levels(prefix) {
    const select = this.#page.locator(`#mhfe-${prefix}-memory-level`);
    await this.#page.waitForFunction(
      ([selector, count]) => document.querySelectorAll(`${selector} option`).length === count,
      [`#mhfe-${prefix}-memory-level`, LEVELS],
    );
    assert.equal(await select.inputValue(), "0");
    assert.equal(await select.locator("option").last().textContent(), "21 · 3 TiB");
  }

  /** Ticks the PIM and types `pim`, and chooses `level`, where given. */
  async #settings(prefix, { pim, level }) {
    const page = this.#page;
    if (pim !== undefined) {
      await page.locator(`#mhfe-${prefix}-use-pim`).check();
      await page.locator(`#mhfe-${prefix}-pim`).fill(pim);
    }
    if (level !== undefined) await page.locator(`#mhfe-${prefix}-memory-level`).selectOption(level);
  }

  /** The command shown, or none for null, and whether the tab's work button is open. */
  async #expect(prefix, line, button, open) {
    const page = this.#page;
    const block = `#mhfe-${prefix}-command`;
    await page.waitForFunction(
      ([selector, expected]) => {
        const shown = document.querySelector(selector);
        return expected === null
          ? shown.hidden
          : !shown.hidden && document.querySelector(`${selector}-text`).textContent === expected;
      },
      [block, line],
    );
    assert.equal(await page.locator(button).isEnabled(), open);
    if (line === null) return;
    assert.ok(!line.includes("--passphrase-used"));
    const text = await page.locator(`${block}-text`).textContent();
    for (const secret of Object.values(SECRETS)) assert.ok(!text.includes(secret));
  }

  /** Presses Copy and checks that exactly `line` was written and the page says so. */
  async #copy(prefix, line) {
    const page = this.#page;
    const before = (await this.#copies()).length;
    await page.locator(`#mhfe-${prefix}-command-copy`).click();
    await page.waitForFunction(
      ([count, selector]) =>
        window.__mhfeCommandCopies.length === count + 1 &&
        document.querySelector(selector).textContent === "Copied to clipboard.",
      [before, `#mhfe-${prefix}-command-status`],
    );
    assert.equal((await this.#copies()).at(-1), line);
  }

  #copies() {
    return this.#page.evaluate(() => [...window.__mhfeCommandCopies]);
  }
}

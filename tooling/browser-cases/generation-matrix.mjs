// Every combination of the Deriver's generation options in the browser (check
// every combination, and how the page looks while it runs). For each state of {MHFE wallet check,
// TON, chosen words} the start line is under the Generate buttons within a moment of the click, a
// screenshot shows the draw running and finished, and Node's own cryptography checks the phrase.
// Draws that would take minutes or hours are made repeatable by RandomFixtures: all-zero entropy
// that misses for a while, then a public phrase that passes. The long modes also run on the
// browser's own randomness, for their start, rising count, estimate, warning and Stop. The Dash
// Community Edition has no TON: its four states run without it.
import assert from "node:assert/strict";
import { createHash, createHmac, pbkdf2Sync } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { RandomFixtures } from "./random-fixtures.mjs";

/** The public profile vector that passes the wallet check with TREZOR (counter 76562). */
const ABOVE_COUNTER = 76_562;
const ABOVE = entropyToMnemonic(
  Uint8Array.from({ length: 32 }, (_, index) => (index < 29 ? 0 : [0x01, 0x2b, 0x12][index - 29])),
  wordlist,
);
/**
 * The synthetic BIP39 phrase that passes TON's check, and the public test passphrase with which it
 * passes the wallet check too (packages/crypto-core/tests/bip39-wallet-check.test.ts).
 */
const BOTH =
  "theme bubble daring setup grass park apart mountain orbit donate mosquito indicate lonely history strategy produce demand rookie demise myth flower length occur carry";
const BOTH_PASSPHRASE = "TON wallet check 23613";
const BOTH_HEX = Buffer.from(mnemonicToEntropy(BOTH, wordlist)).toString("hex");
/** Draws of all-zero entropy before the vector: a few seconds of a visible run. */
const FILLER = { ton: 2_500, check: 600, both: 3_000 };

/** TON's check by Node's HMAC and PBKDF2 (ton-crypto's isBasicSeed), an independent oracle. */
function passesTon(phrase) {
  const entropy = createHmac("sha512", Buffer.from(phrase, "utf8")).digest();
  return pbkdf2Sync(entropy, "TON seed version", 390, 64, "sha512")[0] === 0;
}

/** The MHFE wallet check by Node's PBKDF2 and SHA-256 (MHFE-WALLET-CHECK-SEED-1). */
function passesCheck(phrase, passphrase) {
  const seed = pbkdf2Sync(phrase.normalize("NFKD"), `mnemonic${passphrase}`, 2048, 64, "sha512");
  const digest = createHash("sha256")
    .update("MHFE-WALLET-CHECK-SEED-1", "ascii")
    .update(Buffer.from([0, 0, 1, 0]))
    .update(seed)
    .digest();
  return digest[0] === 0 && digest[1] === 0;
}

const waitText = (page, selector, pattern, timeout = 60_000) =>
  page.waitForFunction(
    ({ selector, source }) =>
      new RegExp(source, "u").test(document.querySelector(selector)?.textContent ?? ""),
    { selector, source: pattern.source },
    { timeout },
  );

export class GenerationMatrixCase {
  /**
   * Runs every state the build offers. `open` opens the Deriver; screenshots go to `output`.
   * Returns the checks made, for the run's record.
   */
  static async run(context, profile, run, open, storageSnapshot, output) {
    await RandomFixtures.walletCheckDraw(context);
    await RandomFixtures.page(context);
    const page = await open(context, profile, "key-derivation", run);
    const matrix = new GenerationMatrixCase(page, `${run.browser}-${profile.id}`, output);
    await page.locator("#crypto-self-test-status.passed").waitFor({ timeout: 120_000 });
    const before = await storageSnapshot(page);
    const checks = await matrix.#all((await page.locator("#ton-generation-enabled").count()) > 0);
    assert.deepEqual(await storageSnapshot(page), before);
    assert.equal(run.requests.length, 0);
    return checks;
  }

  #page;
  /** The engine and edition, which every screenshot's name starts with. */
  #label;
  #shots;
  #checks = [];

  constructor(page, label, output) {
    this.#page = page;
    this.#label = label;
    this.#shots = resolve(output, "generation-matrix");
    mkdirSync(this.#shots, { recursive: true });
  }

  async #all(withTon) {
    // The preconditions of the fixtures, by the oracles: the fillers miss every condition.
    const zero = entropyToMnemonic(new Uint8Array(32), wordlist);
    assert.equal(passesTon(zero) || passesCheck(zero, "TREZOR"), false);
    assert.equal(passesTon(BOTH) && passesCheck(BOTH, BOTH_PASSPHRASE), true);
    assert.equal(passesCheck(ABOVE, "TREZOR") && !passesTon(ABOVE), true);
    await this.#threads();
    await this.#plain();
    await this.#chosen();
    if (withTon) {
      await this.#ton();
      await this.#tonChosen();
    }
    await this.#check(false);
    await this.#check(true);
    if (withTon) {
      await this.#tonCheck(false);
      await this.#tonCheck(true);
    }
    return this.#checks;
  }

  /** The thread choice: 1 up to what the browser reports, 4 or fewer at first. */
  async #threads() {
    const page = this.#page;
    const reported = await page.evaluate(() => navigator.hardwareConcurrency);
    await this.#tick("#wallet-check-enabled", true);
    const options = await page.locator("#draw-threads option").count();
    assert.equal(options, reported);
    assert.equal(await page.locator("#draw-threads").inputValue(), String(Math.min(2, reported)));
    assert.match(await page.locator("#draw-threads-note").innerText(), /always add heat/u);
    await this.#tick("#wallet-check-enabled", false);
    this.#checks.push(`Threads 1 to ${reported}, ${Math.min(2, reported)} at first`);
  }

  async #plain() {
    // The announced line and alert stay in the page while empty, so that the first line is heard.
    for (const id of ["generation-line", "generation-error"])
      assert.notEqual(
        await this.#page.evaluate(
          (id) => getComputedStyle(document.getElementById(id)).display,
          id,
        ),
        "none",
      );
    await this.#press(12);
    await waitText(
      this.#page,
      "#generation-line",
      /^Generated a new 12-word BIP39 recovery phrase/u,
      500,
    );
    await this.#shoot("1-plain-finished");
    assert.equal(validateMnemonic(await this.#phrase(), wordlist), true);
    this.#checks.push("Plain: done line within 500 ms");
  }

  async #chosen() {
    await this.#wish("happy", "2");
    await this.#press(12);
    await waitText(
      this.#page,
      "#generation-line",
      /^Generated a new 12-word BIP39 recovery phrase .* that meets your chosen words\./u,
      500,
    );
    await this.#shoot("2-chosen-finished");
    assert.equal((await this.#phrase()).split(" ")[1], "happy");
    await this.#unwish();
    this.#checks.push("Chosen word: happy as word 2, done within 500 ms");
  }

  /** TON alone: a run held by all-zero draws, then the public TON phrase. */
  async #ton() {
    const page = this.#page;
    await this.#tick("#ton-generation-enabled", true);
    await waitText(page, "#generation-bits", /keeps about 248 of its 256 random bits/u);
    await this.#heldOnPage(FILLER.ton, "3-ton");
    assert.equal(await this.#phrase(), BOTH);
    await this.#tick("#ton-generation-enabled", false);
    this.#checks.push("TON: start line, count, Stop offered, the public TON phrase drawn");
  }

  /** TON with the owner's chosen word, "happy" as word 2, on the browser's own randomness. */
  async #tonChosen() {
    const page = this.#page;
    await this.#tick("#ton-generation-enabled", true);
    await this.#wish("happy", "2");
    await waitText(page, "#generation-bits", /^Not recommended: the phrase keeps about 237 /u);
    await this.#press(24);
    await waitText(page, "#generation-line", /^Generated a new 24-word BIP39 recovery phrase/u);
    await this.#shoot("4-ton-chosen-happy-finished");
    const phrase = await this.#phrase();
    assert.equal(phrase.split(" ")[1], "happy");
    assert.equal(validateMnemonic(phrase, wordlist) && passesTon(phrase), true);
    // The same state held by the fixture for its running screenshot: "bubble" as word 2.
    await this.#unwish();
    await this.#wish("bubble", "2");
    await this.#heldOnPage(FILLER.ton, "4-ton-chosen");
    assert.equal(await this.#phrase(), BOTH);
    await this.#unwish();
    await this.#tick("#ton-generation-enabled", false);
    this.#checks.push("TON + chosen word: happy as word 2 passes TON's check; held run shown");
  }

  /** The wallet check, alone or with a chosen word, held by the fixture until its vector. */
  async #check(chosen) {
    const page = this.#page;
    const name = chosen ? "6-check-chosen" : "5-check";
    await this.#tick("#wallet-check-enabled", true);
    await page.locator("#passphrase").fill("TREZOR");
    if (chosen) await this.#wish("abandon", "1");
    await this.#estimate(/no fixed end/u);
    await this.#heldOnWorkers(ABOVE_COUNTER, FILLER.check, name, /about 65,536 draws\.$/u);
    assert.equal(await this.#phrase(), ABOVE);
    assert.equal(await page.locator("#passphrase").inputValue(), "TREZOR");
    if (chosen) await this.#unwish();
    await this.#tick("#wallet-check-enabled", false);
    this.#checks.push(
      `${name}: estimate, start line, count, Stop offered, the profile vector drawn`,
    );
  }

  /** TON and the wallet check: Stop on the browser's randomness, then the combined vector. */
  async #tonCheck(chosen) {
    const page = this.#page;
    const name = chosen ? "8-ton-check-chosen" : "7-ton-check";
    await this.#tick("#ton-generation-enabled", true);
    await this.#tick("#wallet-check-enabled", true);
    await page.locator("#passphrase").fill(BOTH_PASSPHRASE);
    if (chosen) await this.#wish("bubble", "2");
    await waitText(page, "#generation-note", /without the BIP39 passphrase/u);
    const estimate = await this.#estimate(/no fixed end/u);
    // The browser's own randomness: the draw runs, its count rises, and Stop ends it at once.
    await this.#press(24);
    await waitText(page, "#generation-line", /about 16,777,216 draws\.$/u, 500);
    await waitText(page, "#generation-count", /tried/u);
    const first = await page.locator("#generation-count").innerText();
    // No average before the reports span 2 s; then the count goes on rising with one.
    assert.doesNotMatch(first, /on average/u);
    await waitText(page, "#generation-count", /tried · .* on average at this speed$/u);
    assert.notEqual(await page.locator("#generation-count").innerText(), first);
    await this.#shoot(`${name}-running`);
    await page.locator("#generation-stop").click();
    await waitText(
      page,
      "#generation-line",
      /^Stopped after [\d,]+ draws in .*\. No phrase was taken\.$/u,
    );
    await this.#shoot(`${name}-stopped`);
    // Stop hid itself; the focus went back to the button that started the draw.
    assert.equal(await page.evaluate(() => document.activeElement?.id), "generate-24");
    const stopped = await page.locator("#generation-line").innerText();
    await page.waitForTimeout(1_000);
    assert.equal(await page.locator("#generation-line").innerText(), stopped);
    assert.equal(await page.locator("#generation-count").isVisible(), false);
    // The combined vector, held by all-zero draws that miss TON's check.
    await this.#heldOnWorkers(
      BOTH_HEX,
      FILLER.both,
      `${name}-vector`,
      /about 16,777,216 draws\.$/u,
    );
    assert.equal(await this.#phrase(), BOTH);
    assert.equal(await page.locator("#passphrase").inputValue(), BOTH_PASSPHRASE);
    assert.match(
      await page.locator("#generation-line").innerText(),
      /without the BIP39 passphrase/u,
    );
    if (chosen) await this.#unwish();
    await this.#tick("#wallet-check-enabled", false);
    await this.#tick("#ton-generation-enabled", false);
    this.#checks.push(`${name}: ${estimate}; running count, Stop, the combined vector drawn`);
  }

  /** A main-thread draw held by `filler` all-zero draws, then BOTH: running and finished. */
  async #heldOnPage(filler, name) {
    const page = this.#page;
    await page.evaluate(
      (plan) => {
        window.pageRandom = plan;
      },
      { filler, entropy: BOTH_HEX },
    );
    await this.#press(24);
    await waitText(
      page,
      "#generation-line",
      /that the Telegram wallet accepts: about 256 draws\.$/u,
      500,
    );
    assert.equal(await page.locator("#generation-stop").isVisible(), true);
    await waitText(page, "#generation-count", /tried · /u);
    await this.#shoot(`${name}-running`);
    await waitText(page, "#generation-line", /^Generated a new 24-word BIP39 recovery phrase/u);
    await this.#shoot(`${name}-finished`);
    await page.evaluate(() => {
      window.pageRandom = null;
    });
  }

  /** A draw on the workers held by `filler` all-zero draws, then `random`: running and finished. */
  async #heldOnWorkers(random, filler, name, start) {
    const page = this.#page;
    await page.evaluate(
      ({ random, filler }) => {
        window.mhfeRandom = random;
        window.mhfeFillerDraws = filler;
      },
      { random, filler },
    );
    await this.#press(24);
    await waitText(page, "#generation-line", start, 500);
    assert.equal(await page.locator("#generation-stop").isVisible(), true);
    await waitText(page, "#generation-count", /tried · /u);
    await this.#shoot(`${name}-running`);
    await waitText(
      page,
      "#generation-line",
      /^Generated a new 24-word BIP39 recovery phrase/u,
      120_000,
    );
    await this.#shoot(`${name}-finished`);
    await page.evaluate(() => {
      window.mhfeRandom = null;
      window.mhfeFillerDraws = 0;
    });
  }

  /** The measured time under the options; returns its line. */
  async #estimate(pattern) {
    const page = this.#page;
    await waitText(
      page,
      "#generation-time",
      /^On this computer with \d+ threads?, a phrase takes about /u,
    );
    const line = await page.locator("#generation-time").innerText();
    assert.match(line, pattern);
    await this.#shoot(`estimate-${this.#checks.length}`);
    return line;
  }

  async #press(words) {
    await this.#page.locator(`#generate-${words}`).click();
  }

  async #phrase() {
    return this.#page.locator("#mnemonic").inputValue();
  }

  async #tick(selector, checked) {
    const box = this.#page.locator(selector);
    if ((await box.isChecked()) !== checked) await box.setChecked(checked);
  }

  async #wish(word, position) {
    const page = this.#page;
    await this.#tick("#chosen-words-enabled", true);
    await page.locator("#chosen-word-1-position").selectOption(position);
    await page.locator("#chosen-word-1").fill(word);
  }

  async #unwish() {
    const page = this.#page;
    await page.locator("#chosen-word-1").fill("");
    await page.locator("#chosen-word-1-position").selectOption("anywhere");
    await this.#tick("#chosen-words-enabled", false);
  }

  /** The phrase panel: the phrase, the Generate buttons and their lines, options, passphrase. */
  async #shoot(name) {
    await this.#page.locator("section.input-panel").screenshot({
      path: resolve(this.#shots, `${this.#label}-${name}.png`),
      animations: "disabled",
    });
  }
}

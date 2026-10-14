// Synthetic, direct-file integration tests. Never point this at a live browser profile.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { p2tr } from "@scure/btc-signer";
import upngModule from "@pdf-lib/upng";
import { unzipSync } from "fflate";
import decodeQr from "qr/decode.js";
import { launchForReport, loadPlaywright } from "./playwright-loader.mjs";
import { BUILD_PROFILES, getToolBuild, profileToolIds } from "./build-profiles.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const { chromium, firefox } = await loadPlaywright();
const output =
  process.env.BROWSER_OUTPUT_DIR ??
  resolve(root, "test-results/browser-regressions", new Date().toISOString().replaceAll(":", "-"));
mkdirSync(output, { recursive: true });
// Trezor's official BIP39 English zero-entropy vector. Everything below is public test data.
const mnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const parentPassphrase = "TREZOR";
const childPassphrase = "browser-child-only";
const encryptionPassphrase = "browser-bip38-only";
const message = "Standalone browser regression: public synthetic wallet only";
const parent = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic, parentPassphrase));
const childEntropy = hmac(
  sha512,
  new TextEncoder().encode("bip-entropy-from-k"),
  parent.derive("m/83696968'/39'/0'/12'/0'").privateKey,
).slice(0, 16);
const childMnemonic = entropyToMnemonic(childEntropy, wordlist);
const childKey = HDKey.fromMasterSeed(mnemonicToSeedSync(childMnemonic, childPassphrase)).derive(
  "m/86'/0'/0'/0/0",
);
const childAddress = p2tr(childKey.publicKey.slice(1)).address;
const report = {
  startedAt: new Date().toISOString(),
  scope:
    "Fresh isolated file:// contexts; public synthetic fixtures; no live providers, broadcasts, or real wallet data.",
  runs: [],
};
const save = () =>
  writeFileSync(
    resolve(output, process.env.BROWSER_REPORT_NAME ?? "report.json"),
    JSON.stringify(report, null, 2),
  );
// Targeted preview builds can be checked without replacing the canonical profile artifacts.
const artifactDirectory = process.env.BROWSER_ARTIFACT_DIR ?? resolve(root, "dist");
const artifact = (profile, tool) =>
  resolve(artifactDirectory, getToolBuild(profile, tool).artifactRelativePath);
const waitText = (page, selector, pattern) =>
  page.waitForFunction(
    ({ selector, source }) =>
      new RegExp(source).test(document.querySelector(selector)?.textContent ?? ""),
    { selector, source: pattern.source },
    { timeout: 120000 },
  );
// A full self-test ends with either line; a failure is reported with its message at once.
const fullSelfTestPasses = async (page, selector) => {
  await waitText(page, selector, /^(Every check passed|✗ Failed)/u);
  assert.match(await page.locator(selector).innerText(), /^Every check passed/u);
};
const values = (page, field) =>
  page
    .locator(`#address-list [data-copy-field="${field}"]`)
    .evaluateAll((buttons) =>
      buttons.map(
        (button) =>
          button.parentElement.querySelector(".value")?.textContent ??
          button.closest(".row")?.querySelector(".value")?.textContent,
      ),
    );

async function storageSnapshot(scope, run) {
  const snapshot = await scope.locator("body").evaluate(async () => {
    const result = {};
    for (const name of ["localStorage", "sessionStorage"]) {
      try {
        result[name] = Object.fromEntries(Object.entries(window[name]));
      } catch (error) {
        result[name] = error.name;
      }
    }
    try {
      result.caches = await caches.keys();
    } catch (error) {
      result.caches = error.name;
    }
    try {
      result.cookie = document.cookie;
    } catch (error) {
      result.cookie = error.name;
    }
    return result;
  });
  // Chromium emits an additional undefined pageerror for databases() denied in
  // an opaque sandbox, even when its SecurityError is caught. Keep only that
  // specific, deliberately triggered event separate from application errors.
  if (run) run.probingOpaqueIndexedDB = snapshot.localStorage === "SecurityError";
  snapshot.indexedDB = await scope.locator("body").evaluate(async () => {
    try {
      return (await indexedDB.databases()).map(({ name, version }) => ({ name, version }));
    } catch (error) {
      return error.name;
    }
  });
  await scope.locator("body").evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  if (run) run.probingOpaqueIndexedDB = false;
  return snapshot;
}

async function open(context, profile, tool, run) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => {
    const expectedProbeError = run.probingOpaqueIndexedDB && String(error) === "undefined";
    (expectedProbeError ? (run.indexedDBProbeErrors ??= []) : run.pageErrors).push(String(error));
  });
  page.on("console", (entry) => run.console.push({ type: entry.type(), text: entry.text() }));
  const path = artifact(profile, tool);
  run.artifacts[relative(root, path)] = createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
  await page.goto(pathToFileURL(path).href);
  if (tool === "key-derivation") await page.locator("#crypto-self-test-status.passed").waitFor();
  if (tool === "activity-viewer")
    await page.locator("#viewer-crypto-self-test-status.passed").waitFor();
  if (tool === "discovery-scanner")
    await page
      .frameLocator("#recovery-secret-vault")
      .locator("#recovery-self-test.passed")
      .waitFor();
  if (tool === "psbt-inspector") await page.locator("#psbt-self-test-status.passed").waitFor();
  return page;
}

/**
 * The Deriver with the public test phrase in Generate & Derive, linked to the recovery panel of
 * `target`; `before` is the page's storage before anything was typed.
 */
async function openWithLinkedPhrase(context, profile, run, target) {
  const page = await open(context, profile, "key-derivation", run);
  const before = await storageSnapshot(page);
  await page.locator("#mnemonic").fill(mnemonic);
  await page.locator("#main-recovery-source-menu summary").click();
  await page.locator(`#main-recovery-source-menu [data-recovery-target="${target}"]`).click();
  return { page, before };
}

/** MnemoCode's encoding of the linked test phrase, in date-shift masking with one public date. */
async function openSeedShiftEncoding(context, profile, run) {
  const opened = await openWithLinkedPhrase(context, profile, run, "mnemocode");
  const { page } = opened;
  await page.locator('[data-operation-tab][aria-controls="mnemocode-create-panel"]').click();
  await page.locator("#mnemocode-encode-mode").selectOption("seedshift");
  await page.locator("#mnemocode-encode-dates").fill("23-09-2026");
  return opened;
}

/**
 * Waits until the panel `panelId` takes input: a panel with startup checks (MHFE's) stays inert
 * until they pass, and an inert field silently ignores Playwright's fill.
 */
async function waitPanelReady(page, panelId) {
  await page.waitForFunction((id) => !document.getElementById(id).inert, panelId);
}

/**
 * The Deriver in Recovery & backup with the panel `panelId` open and ready; `before` is the page's
 * storage before anything was typed.
 */
async function openBackupPanel(context, profile, run, panelId) {
  const page = await open(context, profile, "key-derivation", run);
  const before = await storageSnapshot(page);
  await page.locator("#recovery-backup-mode").click();
  await page.locator(`[data-recovery-tab][aria-controls="${panelId}"]`).click();
  await waitPanelReady(page, panelId);
  return { page, before };
}

/**
 * The self-tests of every tool: the Deriver's and the Inspector's full self-tests pass, and the
 * startup checks of the Scanner and the Viewer include their feature checks.
 */
async function selfTests(context, profile, run) {
  const deriver = await open(context, profile, "key-derivation", run);
  await deriver.locator("#full-self-test").click();
  await fullSelfTestPasses(deriver, "#full-self-test-status");
  assert.match(await deriver.locator("#full-self-test-result").innerText(), /BIP38/u);
  assert.match(await deriver.locator("#crypto-self-test-details").innerText(), /BIP85/u);

  const inspector = await open(context, profile, "psbt-inspector", run);
  assert.match(
    await inspector.locator("#psbt-self-test-details").innerText(),
    /known-answer checks passed/u,
  );
  await inspector.locator("#psbt-full-self-test").click();
  await fullSelfTestPasses(inspector, "#psbt-full-self-test-status");

  const scanner = await open(context, profile, "discovery-scanner", run);
  const scannerChecks = await scanner
    .frameLocator("#recovery-secret-vault")
    .locator("#recovery-crypto-self-test-details")
    .innerText();
  assert.match(scannerChecks, /Candidate list import/u);
  // Watch-only discovery screens its inputs with the guard, so its known answers run too.
  assert.match(scannerChecks, /Public-input guard refuses/u);

  const viewer = await open(context, profile, "activity-viewer", run);
  assert.match(
    await viewer.locator("#viewer-crypto-self-test-details").innerText(),
    /Public-input guard/u,
  );
  if (profile.id === "multi-chain")
    assert.match(
      await viewer.locator("#viewer-external-self-test").innerText(),
      /^Address checks passed: Public-input guard refuses/u,
    );
  run.checks.push(
    "Self-tests: Deriver and Inspector full self-tests; Scanner candidate lists and Viewer public-input guard and address checks at start",
  );
}

/**
 * A failed startup self-test keeps every control that derives from the phrase closed, BIP85 and
 * Silent Payments included (AUD-023-SEC001): a constant random source fails the startup check of
 * the Web Crypto randomness.
 */
async function selfTestFailure(context, profile, run) {
  await context.addInitScript(() => {
    globalThis.crypto.getRandomValues = (array) => array.fill(7);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => run.pageErrors.push(String(error)));
  const path = artifact(profile, "key-derivation");
  run.artifacts[relative(root, path)] = createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
  await page.goto(pathToFileURL(path).href);
  await page.locator("#crypto-self-test-status.failed").waitFor();
  const closed = ["#derive-button", "#derive-bip85", "#full-self-test"];
  if (profile.id === "multi-chain") closed.push("#derive-silent-payment");
  for (const selector of closed)
    assert.equal(await page.locator(selector).isDisabled(), true, `${selector} stays closed`);
  // A complete phrase starts no BIP85 derivation by itself either.
  await page.locator("#mnemonic").fill(mnemonic);
  await page.locator("#include-bip85").check();
  await page.locator("#bip85-tab").click();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator("#bip85-output").inputValue(), "");
  assert.equal(await page.locator("#bip85-result").isHidden(), true);
  run.checks.push(
    "A failed startup self-test keeps Generate, BIP85, Silent Payments and the full self-test closed",
  );
}

/**
 * Cards of a phrase that changes while they are drawn: the export saves nothing and brings back no
 * QR image of the old phrase (AUD-023-SEC002). The phrase is the one linked from Generate & Derive,
 * so its change also reaches the panel as an expired link.
 */
async function mnemocodeLateCards(context, profile, run) {
  const { page } = await openSeedShiftEncoding(context, profile, run);
  await page.locator("#mnemocode-encode-format").selectOption("colors");
  await page.locator("#mnemocode-cards-section > summary").click();
  await page.locator("#mnemocode-card-qr").check();
  let downloads = 0;
  page.on("download", () => (downloads += 1));
  const images = page.locator("#mnemocode-cards-qr-images");
  // The control: an export whose phrase stays offers its sheet's QR code as an image.
  await page.locator("#export-mnemocode-cards").click();
  await waitText(page, "#mnemocode-cards-status", /^Saved /u);
  assert.equal(await images.isVisible(), true);
  assert.equal(downloads, 1);
  // The phrase of Generate & Derive changes while the next export draws: separate cards as PNG
  // images are drawn one after the other, and the page changes the phrase between two of them,
  // after the export has read it (one frame after the press). One sheet would keep the page busy
  // until it is saved, so nothing could change during it.
  await page.locator("#mnemocode-card-file-format").selectOption("png");
  await page.locator("#mnemocode-card-page-size").selectOption("business");
  await page.locator("#mnemonic").evaluate((field) => {
    const status = document.querySelector("#mnemocode-cards-status");
    new MutationObserver((_, observer) => {
      if (!status.textContent.startsWith("Rendering cards")) return;
      observer.disconnect();
      setTimeout(() => {
        field.value = "";
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }, 150);
    }).observe(status, { childList: true, characterData: true, subtree: true });
  });
  await page.locator("#export-mnemocode-cards").click();
  await waitText(page, "#mnemocode-cards-status", /nothing was saved/u);
  assert.equal(await images.isHidden(), true);
  assert.equal(await images.locator("button").count(), 0);
  assert.equal(downloads, 1);
  run.checks.push(
    "Cards of a phrase changed while they were drawn: no file and no QR image of the old phrase",
  );
}

/**
 * A new container password made by MHFE (mhfe made_password.rs): offered where a container password
 * is set, shown once, refused as a wrong copy and shown again, and used as an exact copy; the
 * encryption is stopped at its first round, so no full Argon2 runs.
 */
async function mhfeMadePassword(context, profile, run) {
  const { page, before } = await openBackupPanel(context, profile, run, "mhfe-panel");
  for (const [prefix, legend] of [
    ["encrypt", "The container password: type your own, or let MHFE make one?"],
    ["new", "The container password: type your own, or let MHFE make one?"],
    ["rekey-new", "The new container password: yours, or made?"],
  ])
    assert.equal(await page.locator(`#mhfe-${prefix}-password-kind legend`).textContent(), legend);
  // Change password warns every user about the wallets of other passwords and asks nothing, in
  // the owner's wording, without advice to destroy the old container (mhfe 0.6.0).
  await page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-rekey-panel"]').click();
  const keepOld =
    "! Wallets that other passwords open on the old container do not move to the new one: keep the old container, its passwords and its settings until you have moved their funds.";
  assert.equal(await page.locator("#mhfe-rekey-warning").innerText(), keepOld);
  // A PIM changes nothing in it: "its settings" covers the PIM.
  await page.locator("#mhfe-rekey-use-pim").check();
  await page.locator("#mhfe-rekey-pim").fill("2");
  assert.equal(await page.locator("#mhfe-rekey-warning").innerText(), keepOld);
  await page.locator("#mhfe-rekey-use-pim").uncheck();
  await page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-create-panel"]').click();
  await page.locator("#mhfe-source").fill(mnemonic);
  await page.locator("#mhfe-encrypt-password-kind-words").check();
  await page.waitForFunction(
    () => (document.querySelector("#mhfe-encrypt-made-text")?.textContent ?? "") !== "",
  );
  const made = await page.locator("#mhfe-encrypt-made-text").textContent();
  assert.equal(made.split(" ").length, 5);
  assert.equal(
    await page.locator("#mhfe-encrypt-made-strength").textContent(),
    "5 words from the EFF list, about 64.6 bits.",
  );
  assert.equal(await page.locator("#mhfe-encrypt-own-password").isVisible(), false);
  await page.locator("#mhfe-encrypt-made-written").click();
  assert.equal(await page.locator("#mhfe-encrypt-made-text").textContent(), "");
  await page.locator("#mhfe-encrypt-made-copy").fill(`${made}x`);
  await page.locator("#mhfe-encrypt").click();
  await waitText(
    page,
    "#mhfe-encrypt-status",
    /^That is not the password shown: correct your copy/u,
  );
  assert.equal(await page.locator("#mhfe-encrypt-made-text").textContent(), made);
  await page.locator("#mhfe-encrypt-made-written").click();
  await page.locator("#mhfe-encrypt-made-copy").fill(made);
  await page.locator("#mhfe-encrypt").click();
  await waitText(page, "#mhfe-encrypt-status", /Encrypting · round 1 of 12/u);
  assert.equal(await page.locator("#mhfe-encrypt-made-copy").inputValue(), "");
  await page.locator("#mhfe-encrypt-stop").click();
  await waitText(page, "#mhfe-encrypt-status", /worker and its memory were discarded/u);
  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "MHFE made password: offered in Encode, New wallet and Change password; five dice words shown once, a wrong copy refused and shown again, an exact copy used; storage/no HTTP",
  );
}

/**
 * A container phrase with words typed as ? in MHFE's Decode (MHFE 0.6.0, mhfe container_repair.rs
 * and container_search.rs): word 24 of mhfe's zero-12 container is found without the repair words
 * by the container's own fingerprint, 487a156e, and used only after Use it; a container with a
 * wrong first word says why and is repaired with its four repair words. No Argon2 runs.
 */
async function mhfeMissingWords(context, profile, run) {
  const container =
    "donate stove tower picnic iron rescue trick shrimp roof rib home cigar bag pledge also nerve cycle famous provide heart ahead chunk caution peace";
  const words = container.split(" ");
  const { page, before } = await openBackupPanel(context, profile, run, "mhfe-panel");
  await page
    .locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-restore-panel"]')
    .click();

  await page.locator("#mhfe-container").fill([...words.slice(0, 23), "?"].join(" "));
  await page.locator("#mhfe-decrypt").click();
  await waitText(
    page,
    "#mhfe-decrypt-marked-reading",
    /^Word 24 of the container phrase cannot be read/u,
  );
  await page.locator("#mhfe-decrypt-marked-no-card").click();
  await waitText(page, "#mhfe-decrypt-missing-candidates", /: 8 candidates\.$/u);
  // A passphrase the container phrase is not used with finds nothing, and the question stays.
  await page.locator("#mhfe-decrypt-missing-known-container").check();
  await page.locator("#mhfe-decrypt-missing-reference").fill("487a156e");
  assert.equal(await page.locator("#mhfe-decrypt-missing-coin-field").isVisible(), false);
  await page.locator("#mhfe-decrypt-missing-passphrase-used-yes").check();
  await page.locator("#mhfe-decrypt-missing-passphrase").fill("TREZOR");
  await page.locator("#mhfe-decrypt-missing-run").click();
  await waitText(
    page,
    "#mhfe-decrypt-marked-status",
    /^The container's own wallet does not match/u,
  );
  assert.equal(await page.locator("#mhfe-decrypt-missing").isVisible(), true);
  await page.locator("#mhfe-decrypt-missing-passphrase-used-no").check();
  await page.locator("#mhfe-decrypt-missing-run").click();
  const result = page.locator("#mhfe-decrypt-marked-result");
  await waitText(page, "#mhfe-decrypt-marked-result", /Found container phrase, 24 words/u);
  // The words found are words of the container: concealed with it until Show.
  assert.doesNotMatch(await result.innerText(), /peace/u);
  await result.getByRole("button", { name: "Show container" }).click();
  assert.match(
    await result.innerText(),
    /Found word 24: peace, with the container's own wallet\./u,
  );
  // Nothing is used before Use it.
  assert.equal(
    await page.locator("#mhfe-container").inputValue(),
    [...words.slice(0, 23), "?"].join(" "),
  );
  await result.getByRole("button", { name: "Use it" }).click();
  assert.equal(await page.locator("#mhfe-container").inputValue(), container);

  // Two missing words: only the container's own wallet can tell them, so only it is offered.
  await openMarkedMhfeWithoutCard(
    page,
    [...words.slice(0, 2), "?", ...words.slice(3, 23), "?"].join(" "),
  );
  await waitText(page, "#mhfe-decrypt-missing-candidates", /: 16,384 candidates\.$/u);
  assert.match(
    await page.locator("#mhfe-decrypt-missing-limits").innerText(),
    /^Two words are missing: only a fingerprint or an address of the container's own wallet/u,
  );
  for (const known of ["original", "passphrase", "nothing"])
    assert.equal(await page.locator(`#mhfe-decrypt-missing-known-${known}`).isVisible(), false);
  // By an address, the coin and how far the wallet goes are asked, the usual 20 addresses chosen,
  // and the scope is stated before any work.
  await page.locator("#mhfe-decrypt-missing-known-container").check();
  await page.locator("#mhfe-decrypt-missing-reference").fill("3FWJwUxDaXoGrxZQHT4EHBDZCZw7iHUaRn");
  await page.locator("#mhfe-decrypt-missing-coin-field").waitFor();
  assert.equal(await page.locator("#mhfe-decrypt-missing-gap-field").isVisible(), true);
  assert.equal(await page.locator("#mhfe-decrypt-missing-gap-20").isChecked(), true);
  if (profile.id === "dash-community") {
    // The Dash edition offers Dash alone, so a Bitcoin address of the container is not searched.
    await page.waitForFunction(
      () => document.querySelectorAll("#mhfe-decrypt-missing-coin option").length > 0,
    );
    assert.deepEqual(
      await page
        .locator("#mhfe-decrypt-missing-coin option")
        .evaluateAll((options) => options.map((option) => option.value)),
      ["dash"],
    );
  } else {
    await page.locator("#mhfe-decrypt-missing-coin").selectOption("bitcoin");
    await waitText(page, "#mhfe-decrypt-missing-search", /Search: .*, 40 addresses$/u);
  }
  await page.locator("#mhfe-decrypt-missing-back").click();

  // Another valid word in place of the first fails the checksum: said, then repaired.
  await page.locator("#mhfe-container").fill(["abandon", ...words.slice(1)].join(" "));
  await page.locator("#mhfe-decrypt").click();
  await page.locator("#mhfe-decrypt-marked-again-choice").waitFor();
  await page.locator("#mhfe-decrypt-marked-repair-it").click();
  assert.equal(await page.locator("#mhfe-decrypt-marked-no-card").isVisible(), false);
  await page.locator("#mhfe-decrypt-marked-card").fill("shaft pupil patient jewel");
  await page.locator("#mhfe-decrypt-marked-repair").click();
  await waitText(page, "#mhfe-decrypt-marked-result", /Repaired word 1 of the container phrase\./u);
  await result.getByRole("button", { name: "Use it" }).click();
  assert.equal(await page.locator("#mhfe-container").inputValue(), container);

  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "MHFE Decode: word 24 marked ? not found with a passphrase the container phrase lacks, found by its own fingerprint without one and used only after Use it; two missing words offered only the container's own wallet, its address searched in the first 20 of each chain; a wrong first word said and repaired with four repair words; storage/no HTTP",
  );
}

/** Opens the missing-word questions without repair words, without starting a search. */
async function openMarkedMhfeWithoutCard(page, container) {
  await page.locator("#mhfe-container").fill(container);
  await page.locator("#mhfe-decrypt").click();
  await page.locator("#mhfe-decrypt-marked-no-card").click(); // Opening reads candidates asynchronously and resets the previous answers before showing.
  await page.locator("#mhfe-decrypt-missing").waitFor({ state: "visible" });
}

/** Selects the Decode search's address and its optional exact path. */
async function chooseMissingMhfeAddressPath(page, coin, address, path = "") {
  await page.locator("#mhfe-decrypt-missing-known-container").check();
  await page.locator("#mhfe-decrypt-missing-reference").fill(address);
  await page.locator("#mhfe-decrypt-missing-coin").selectOption(coin);
  await page.locator("#mhfe-decrypt-missing-use-path").check();
  await page.locator("#mhfe-decrypt-missing-path").fill(path);
}

/**
 * Missing-word recovery at one explicit path. These public zero-12 container addresses were
 * independently derived with @scure/bip32/bip39 and standard address encodings, after reproducing
 * the published BIP84 abandon vector and MHFE's known Dash m/44'/5'/0'/0/0 answer. All eight
 * checksum-valid final-word candidates give one match at this path and none at its wrong index.
 * The container's own wallet is searched: no MHFE password or Argon2 recovery is needed.
 */
async function mhfeCustomPath(context, profile, run) {
  const container =
    "donate stove tower picnic iron rescue trick shrimp roof rib home cigar bag pledge also nerve cycle famous provide heart ahead chunk caution peace";
  const knownPath = "m/123'/4/9'/8";
  const enteredPath = "m/123h/4/9h/8";
  const wrongPath = "m/123'/4/9'/9";
  const coin = profile.id === "dash-community" ? "dash" : "bitcoin";
  const address =
    coin === "dash"
      ? "XbTRnErdGtvGpfkNXN9SWDfPE2Cw8XLNVz"
      : "bc1qpph2gpw6eyuhl0gm6w5hcml80rvy3th3l0l9qu";
  const { page, before } = await openBackupPanel(context, profile, run, "mhfe-panel");
  for (const prefix of [
    "mhfe-decrypt-missing",
    "mhfe-check-missing",
    "mhfe-rekey-missing",
    "mhfe-wallets-missing",
    "mhfe-check-no-length",
  ]) {
    assert.equal(await page.locator(`#${prefix}-use-path`).count(), 1);
    assert.equal(await page.locator(`#${prefix}-path`).count(), 1);
    assert.equal(
      await page.locator(`#${prefix}-path-label`).textContent(),
      "Only one derivation path",
    );
    assert.equal(await page.locator(`#${prefix}-path`).getAttribute("placeholder"), "m/…");
  }
  await page
    .locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-restore-panel"]')
    .click();
  const words = container.split(" ");
  const marked = [...words.slice(0, 23), "?"].join(" ");
  await openMarkedMhfeWithoutCard(page, marked);
  await waitText(page, "#mhfe-decrypt-missing-candidates", /: 8 candidates\.$/u);
  await chooseMissingMhfeAddressPath(page, coin, address);
  await page.locator("#mhfe-decrypt-missing-passphrase-used-no").check();

  // Choosing a path but leaving it empty must not silently start the usual wider search.
  await page.locator("#mhfe-decrypt-missing-run").click();
  await waitText(page, "#mhfe-decrypt-marked-status", /derivation path/iu);
  assert.equal(await page.locator("#mhfe-decrypt-marked-result > *").count(), 0);
  await page.locator("#mhfe-decrypt-missing-path").fill("m/2147483648");
  await waitText(page, "#mhfe-decrypt-missing-search", /path/iu);
  await page.locator("#mhfe-decrypt-missing-run").click();
  await waitText(page, "#mhfe-decrypt-marked-status", /path/iu);
  assert.equal(await page.locator("#mhfe-decrypt-marked-result > *").count(), 0);

  await page.locator("#mhfe-decrypt-missing-path").fill(wrongPath);
  await waitText(page, "#mhfe-decrypt-missing-search", /m\/123'\/4\/9'\/9/u);
  await page.locator("#mhfe-decrypt-missing-run").click();
  await waitText(
    page,
    "#mhfe-decrypt-marked-status",
    /^The container's own wallet does not match/u,
  );
  assert.equal(await page.locator("#mhfe-container").inputValue(), marked);

  await page.locator("#mhfe-decrypt-missing-path").fill(enteredPath);
  await waitText(page, "#mhfe-decrypt-missing-search", /m\/123'\/4\/9'\/8/u);
  assert.equal(
    (await page.locator("#mhfe-decrypt-missing-search").innerText()).split("Search: ").at(-1),
    `only ${knownPath}`,
  );
  await page.locator("#mhfe-decrypt-missing-run").click();
  await waitText(page, "#mhfe-decrypt-marked-result", /Found container phrase, 24 words/u);
  const result = page.locator("#mhfe-decrypt-marked-result");
  await result.getByRole("button", { name: "Show container" }).click();
  assert.match(await result.innerText(), /Found word 24: peace/u);
  assert.equal(await page.locator("#mhfe-container").inputValue(), marked);

  // A completed search closes its questions. Reopen them to test a reference-kind change.
  await openMarkedMhfeWithoutCard(page, marked);
  await chooseMissingMhfeAddressPath(page, coin, address, enteredPath);
  // A fingerprint is a different reference; the previous exact path cannot follow it.
  await page.locator("#mhfe-decrypt-missing-reference").fill("487a156e");
  assert.equal(await page.locator("#mhfe-decrypt-missing-path-field").isVisible(), false);
  assert.equal(await page.locator("#mhfe-decrypt-missing-use-path").isChecked(), false);
  assert.equal(await page.locator("#mhfe-decrypt-missing-path").inputValue(), "");
  await page.locator("#mhfe-decrypt-missing-reference").fill(address);
  assert.equal(await page.locator("#mhfe-decrypt-missing-use-path").isChecked(), false);

  // With two missing words the exact path replaces the gap, including a stale invalid own gap.
  await openMarkedMhfeWithoutCard(
    page,
    [...words.slice(0, 2), "?", ...words.slice(3, 23), "?"].join(" "),
  );
  await page.locator("#mhfe-decrypt-missing-known-container").check();
  await page.locator("#mhfe-decrypt-missing-reference").fill(address);
  await page.locator("#mhfe-decrypt-missing-coin").selectOption(coin);
  await page.locator("#mhfe-decrypt-missing-gap-other").check();
  await page.locator("#mhfe-decrypt-missing-gap-own").fill("-1");
  await page.locator("#mhfe-decrypt-missing-use-path").check();
  await page.locator("#mhfe-decrypt-missing-path").fill(enteredPath);
  assert.equal(await page.locator("#mhfe-decrypt-missing-gap-field").isVisible(), false);
  await waitText(page, "#mhfe-decrypt-missing-search", /m\/123'\/4\/9'\/8/u);
  assert.equal(
    (await page.locator("#mhfe-decrypt-missing-search").innerText()).split("Search: ").at(-1),
    `only ${knownPath}`,
  );
  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "Missing-word custom path: all five hosts present; empty and overflow paths refuse; wrong path does not match; h spelling finds the independently computed Bitcoin/Dash address, describes the canonical path and finds the public final word; fingerprint clears the path; exact path excludes a stale invalid gap; no Argon2, storage or HTTP",
  );
}

/**
 * MnemoCode's Restore writes the candidate list of the shares' phrase to the Scanner's one-time
 * key, and the Scanner of the same edition opens it (AUD-022-API003, AUD-023-ARC001): two shares
 * of MnemoCode's public SSKR vector bip39-128-2-of-3, with the public BIP39 passphrase TREZOR.
 */
async function mnemocodeShareList(context, profile, run) {
  const vectorShares = [
    "ur:sskr/goemjzaeadaejoinoyvotkwlptsskispvwbkbwjnamstlubnampf",
    "ur:sskr/goemjzaeadadflihpkmhspcheycndschfhcmkelyvaveiesolrls",
  ];
  const scanner = await open(context, profile, "discovery-scanner", run);
  const vault = scanner.frameLocator("#recovery-secret-vault");
  await vault.locator('[data-input-mode="batch"]').click();
  await vault.locator("#candidate-list-import > summary").click();
  await vault.locator("#candidate-list-show-key").click();
  const key = vault.locator("#candidate-list-key");
  await key.waitFor({ state: "visible" });
  const recipient = await key.inputValue();
  assert.match(recipient, /^age1[0-9a-z]+$/u);

  const deriver = await open(context, profile, "key-derivation", run);
  await deriver.locator("#recovery-backup-mode").click();
  await deriver.locator('[data-recovery-tab][aria-controls="mnemocode-panel"]').click();
  await deriver.locator('[data-operation-tab][aria-controls="mnemocode-restore-panel"]').click();
  await deriver.locator("#mnemocode-restore-shares").fill(vectorShares.join("\n"));
  await deriver.locator("#mnemocode-restore-list").check();
  await deriver.locator("#mnemocode-restore-list-protect-key").check();
  await deriver.locator("#mnemocode-restore-list-key").fill(recipient);
  await deriver.locator("#mnemocode-restore-wallet-passphrase").fill("TREZOR");
  await deriver.locator("#mnemocode-restore").click();
  await waitText(deriver, "#mnemocode-restore-status", /The phrase is restored\./u);
  const result = deriver.locator("#mnemocode-restore-result");
  const [download] = await Promise.all([
    deriver.waitForEvent("download"),
    result.locator("button", { hasText: "Save candidate list" }).click(),
  ]);
  const bytes = readFileSync(await download.path());
  await download.delete();

  // The list file is chosen with a button in the shared style, the file's name beside it.
  const chooser = vault.locator("label.file-choice", {
    has: vault.locator("#candidate-list-file"),
  });
  assert.equal(await chooser.innerText(), "Choose the list file");
  const fileName = vault.locator(".file-choice-name");
  assert.equal(await fileName.innerText(), "No file chosen");
  await vault.locator("#candidate-list-file").setInputFiles({
    name: "candidates.age",
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  assert.equal(await fileName.innerText(), "candidates.age");
  const reveal = vault.locator("#reveal-recovery-input");
  assert.equal(await reveal.isVisible(), true);
  await vault.locator("#candidate-list-open").click();
  const status = vault.locator("#candidate-list-status");
  await status.filter({ hasText: /candidate from the list/u }).waitFor();
  assert.equal(
    await status.innerText(),
    "1 candidate from the list, with the BIP39 passphrase stored in the list. They are checked in place of the phrases typed above.",
  );
  // The list's candidates are never shown, so Show input, which would show nothing, is gone.
  assert.equal(await reveal.isVisible(), false);
  await vault.locator("#candidate-list-remove").click();
  assert.equal(await status.innerText(), "");
  assert.equal(await reveal.isVisible(), true);
  assert.equal(await fileName.innerText(), "No file chosen");
  run.checks.push(
    "Restore writes the shares' candidate list to the Scanner key; the Scanner chooses it with a shared-style file button, opens it, hides Show input while it stands in, and removes it",
  );
}

async function verifySignature(page, address, signature, chain) {
  await page.locator('[data-mode="verify"]').click();
  await page.locator("#verify-chain").selectOption(chain);
  await page.locator("#verify-address").fill(address);
  await page.locator("#verify-message").fill(message);
  await page.locator("#verify-signature").fill(signature);
  await page.locator("#verify-message-button").click();
  await waitText(page, "#verify-validity", /^VALID/);
  await page.locator("#verify-message").fill(`${message} tampered`);
  await page.locator("#verify-message-button").click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#verify-error").hidden ||
      (!document.querySelector("#verify-results").hidden &&
        document.querySelector("#verify-validity").textContent.startsWith("INVALID")),
  );
  assert.equal(
    (await page.locator("#verify-results").isVisible()) &&
      (await page.locator("#verify-validity").innerText()).startsWith("VALID"),
    false,
  );
}

async function sign(page, selector) {
  await page.locator(selector).first().click();
  await page.locator("#message-signer-dialog").waitFor({ state: "visible" });
  const address = await page.locator("#message-signer-address").innerText();
  await page.locator("#message-signer-message").fill(message);
  await page.locator("#sign-message-button").click();
  await page.locator("#message-signature-result").waitFor({ state: "visible" });
  assert.equal(await page.locator("#message-signer-error").isVisible(), false);
  const signature = await page.locator("#message-signature-output").inputValue();
  assert.ok(signature.length > 40);
  await page.locator("#close-message-signer").click();
  return { address, signature };
}

async function descriptorFollowup(context, profile, run) {
  const page = await open(context, profile, "psbt-inspector", run);
  await page.locator('[data-mode="script"]').click();
  const g = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
  const u =
    "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";
  const valid =
    profile.id === "multi-chain"
      ? `tr(musig(${parent.publicExtendedKey},${parent.deriveChild(1).publicExtendedKey})/<0;1>/*)`
      : `sh(pkh(${u}))`;
  await page.locator("#script-input").fill(valid);
  await page.locator("#decode-script").click();
  await page.locator("#script-results").waitFor({ state: "visible" });
  assert.equal(await page.locator("#script-error").isVisible(), false);
  assert.match(await page.locator("#script-results").innerText(), /Compiled descriptor data/);
  const invalid = profile.id === "multi-chain" ? `tr(${g},pk(musig([bad]${g},${g})))` : "combo(00)";
  await page.locator("#script-input").fill(invalid);
  await page.locator("#decode-script").click();
  await page.locator("#script-error").waitFor({ state: "visible" });
  assert.equal(await page.locator("#script-results").isVisible(), false);
  run.checks.push(
    "Valid descriptor compiles; malformed replacement hides all previous compiled results",
  );
}

async function verifierRevision(context, profile, run) {
  const page = await open(context, profile, "psbt-inspector", run);
  await page.locator('[data-mode="verify"]').click();
  await page.locator("#verify-chain").selectOption("dash");
  await page.locator("#verify-address").fill("XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE");
  await page.locator("#verify-message").fill("Dash verifier fixture");
  await page
    .locator("#verify-signature")
    .fill(
      "IIeeVV8PxEmSnk2FqMTPAHtJdezmn2tXQhHq8q8fhFu6IXrYcwT6yi7hS42BcpoinL8nRwFFJPqPLXF3prJLWmc=",
    );
  await page.locator("#verify-message-button").click();
  await waitText(page, "#verify-validity", /^VALID/);
  await page.evaluate(() => {
    document.querySelector("#verify-message-button").click();
    const field = document.querySelector("#verify-message");
    field.value = "Changed claim";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(50);
  assert.equal(await page.locator("#verify-results").isVisible(), false);
  await page.evaluate(() => {
    document.querySelector("#verify-message-button").click();
    document.querySelector("#clear-verifier").click();
  });
  await page.waitForTimeout(50);
  assert.equal(await page.locator("#verify-results").isVisible(), false);
  assert.equal(await page.locator("#verify-error").isVisible(), false);
  if (profile.id === "multi-chain") {
    await page.locator('[data-mode="builder"]').click();
    await page.locator("#policy-mode").selectOption("custom-miniscript");
    await page.locator("#custom-miniscript-context").selectOption("tapscript");
    for (const key of [
      "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      "ff".repeat(32),
    ]) {
      await page.locator("#custom-miniscript").fill(`multi_a(1,${key})`);
      await page.locator("#build-policy").click();
      assert.equal(await page.locator("#policy-results").isVisible(), false);
      assert.equal(await page.locator("#builder-error").isVisible(), true);
    }
  }
  run.checks.push(
    "Verification results invalidated on edit/Clear; unsafe custom Tapscript keys rejected before showing an output",
  );
}

async function boundaries(context, profile, tool, run) {
  const page = await open(context, profile, tool, run);
  const scopes = [page];
  if (tool === "discovery-scanner") {
    assert.equal(
      await page.locator("#recovery-secret-vault").getAttribute("sandbox"),
      "allow-scripts",
    );
    scopes.push(page.frameLocator("#recovery-secret-vault"));
  }
  for (const [index, scope] of scopes.entries()) {
    const networked = index === 0 && ["discovery-scanner", "activity-viewer"].includes(tool);
    const csp = await scope
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    assert.match(csp, networked ? /connect-src https:/ : /connect-src 'none'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    const before = await storageSnapshot(scope, run);
    const result = await scope.locator("body").evaluate(async () => {
      const violations = [];
      document.addEventListener("securitypolicyviolation", (event) =>
        violations.push(event.effectiveDirective),
      );
      const script = document.createElement("script");
      script.textContent = "window.__browserRegressionInlineExecuted = true";
      document.head.append(script);
      script.remove();
      let fetchAllowed = false;
      try {
        await fetch("https://browser-regression.invalid/probe");
        fetchAllowed = true;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
      let parentBlocked = null;
      if (window !== window.parent) {
        try {
          void window.parent.document.body;
          parentBlocked = false;
        } catch {
          parentBlocked = true;
        }
      }
      return {
        inlineExecuted: window.__browserRegressionInlineExecuted === true,
        fetchAllowed,
        violations,
        parentBlocked,
      };
    });
    assert.equal(result.inlineExecuted, false, "Unhashed injected script executed");
    assert.equal(result.fetchAllowed, networked, "Unexpected CSP network boundary");
    assert.ok(result.violations.some((value) => value.startsWith("script-src")));
    if (!networked) assert.ok(result.violations.includes("connect-src"));
    if (index === 1) assert.equal(result.parentBlocked, true);
    assert.deepEqual(await storageSnapshot(scope, run), before);
    run.checks.push({
      scope: index === 0 ? "top-level" : "opaque-vault",
      csp,
      storage: before,
      probes: result,
    });
  }
  await page.reload();
  assert.deepEqual(await context.cookies(), []);
  assert.equal(run.requests.filter((request) => !request.url.endsWith("/probe")).length, 0);
}

async function recoveryBackupRoundTrips(context, profile, run) {
  const page = await open(context, profile, "key-derivation", run);
  const clickStep = async (locator, label) => {
    try {
      await locator.click();
    } catch (error) {
      throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  };
  const before = await storageSnapshot(page);
  await clickStep(page.locator("#recovery-backup-mode"), "Open Recover & Back Up");
  // One help per recovery panel plus the option helps. MHFE adds the container length, the repair
  // words of Encode, New wallet, Change password and Repair, the wallet check and the password kinds.
  // MnemoCode adds the option helps of Encode and Decode, the split, the restore, the forgotten
  // words, the share repair, and each wallet question, including the share repair's own question
  // and Decode's for codes marked ?.
  // Generate & Derive has option helps of its own (the wallet check); count only this workspace's.
  const recoveryHelp = "#recovery-workspace .recovery-help";
  assert.equal(await page.locator(recoveryHelp).count(), 27);
  const firstHelp = page.locator(recoveryHelp).first();
  await firstHelp.locator("summary").hover();
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.hasAttribute("open"),
    recoveryHelp,
  );
  await page.locator("#recovery-workspace > .section-head").hover();
  await page.waitForFunction(
    (selector) => !document.querySelector(selector)?.hasAttribute("open"),
    recoveryHelp,
  );
  await firstHelp.locator("summary").evaluate((summary) => summary.click());
  assert.doesNotMatch(await firstHelp.locator(".recovery-help-popover").innerText(), /Example:/);
  await page.mouse.click(1, 1);
  assert.equal(await firstHelp.getAttribute("open"), null);

  await clickStep(page.locator('[data-recovery-tab][aria-controls="mhfe-panel"]'), "Open MHFE");
  await waitPanelReady(page, "mhfe-panel");
  // Every operation of the mhfe program has a tab of its own.
  assert.equal(await page.locator("#mhfe-panel [data-operation-tab]").count(), 9);
  await page.locator("#mhfe-source").fill(mnemonic);
  await page.locator("#mhfe-encrypt-password").fill("public browser test password");
  await page.locator("#mhfe-encrypt-password-confirm").fill("public browser test password");
  await page.locator("#mhfe-encrypt-use-pim").check();
  assert.equal(await page.locator("#mhfe-encrypt-pim-field").isVisible(), true);
  await page.locator("#mhfe-encrypt-use-pim").uncheck();
  // The final-word mode of the old module is gone, and the page says which speed it runs at.
  assert.equal(await page.locator("#mhfe-encrypt-preserve-final-word").count(), 0);
  // A 24-word container stays the default; the same length is the user's own choice.
  assert.equal(await page.locator("#mhfe-length-24").isChecked(), true);
  assert.equal(await page.locator("#mhfe-length-same").isChecked(), false);
  await waitText(page, "#mhfe-mode", /Slow mode|Fast mode/u);
  await clickStep(
    page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-restore-panel"]'),
    "Open MHFE recovery",
  );
  // Detection, the package's words 0, is chosen until the person chooses a length.
  assert.equal(await page.locator("#mhfe-decrypt-source-words").inputValue(), "0");
  await clickStep(
    page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-create-panel"]'),
    "Open MHFE encryption",
  );
  // Encode asks nothing about a BIP39 passphrase, as mhfe encrypt asks nothing; the list of what
  // to keep then names any passphrase of the wallet. Rekey still asks, and says why.
  assert.equal(await page.locator("#mhfe-encrypt-wallet-passphrase").count(), 0);
  assert.match(
    (await page.locator("#mhfe-rekey-wallet-passphrase").textContent()) ?? "",
    /Asked only so that the list of what to keep at the end is complete/u,
  );
  await clickStep(page.locator("#mhfe-encrypt"), "Start MHFE worker");
  await waitText(page, "#mhfe-encrypt-status", /Encrypting · round 1 of 12/u);
  assert.equal(await page.locator("#mhfe-encrypt-password").inputValue(), "");
  // One heavy job at a time: Decode waits, and the busy line says why.
  assert.equal(await page.locator("#mhfe-decrypt").isDisabled(), true);
  await waitText(page, "#recovery-busy", /^MHFE encryption is running\./u);
  await clickStep(page.locator("#mhfe-encrypt-stop"), "Stop MHFE worker");
  await waitText(page, "#mhfe-encrypt-status", /worker and its memory were discarded/u);

  const methods = [
    {
      panel: "seedqr-panel",
      source: "#seedqr-source",
      create: "#create-seedqr",
      createResult: "#seedqr-create-result",
      revealCreated: "#toggle-seedqr-created",
      restorePanel: "seedqr-restore-panel",
      shares: "#seedqr-payload",
      restore: "#restore-seedqr",
      restoreResult: "#seedqr-restore-result",
      needed: 1,
    },
    {
      panel: "mnemocode-panel",
      source: "#mnemocode-source",
      create: "#encode-mnemocode",
      createResult: "#mnemocode-encode-result",
      revealCreated: "#toggle-mnemocode-created",
      createPanel: "mnemocode-create-panel",
      restorePanel: "mnemocode-decode-panel",
      shares: "#mnemocode-input",
      restore: "#decode-mnemocode",
      restoreResult: "#mnemocode-decode-result",
      needed: 1,
    },
    {
      panel: "slip39-panel",
      source: "#slip39-source-mnemonic",
      create: "#create-slip39-shares",
      createResult: "#slip39-create-result",
      revealCreated: "#toggle-slip39-created",
      restorePanel: "slip39-restore-panel",
      shares: "#slip39-shares",
      restore: "#restore-slip39-shares",
      restoreResult: "#slip39-restore-result",
      needed: 2,
    },
    {
      panel: "codex32-panel",
      source: "#codex32-source",
      create: "#create-codex32",
      createResult: "#codex32-create-result",
      revealCreated: "#toggle-codex32-created",
      restorePanel: "codex32-restore-panel",
      shares: "#codex32-shares",
      restore: "#restore-codex32",
      restoreResult: "#codex32-restore-result",
      needed: 2,
    },
  ];

  let checkedQrPopoverInteractions = false;
  for (const method of methods) {
    await clickStep(
      page.locator(`[data-recovery-tab][aria-controls="${method.panel}"]`),
      `Open ${method.panel}`,
    );
    const createPanel =
      method.createPanel ?? method.restorePanel.replace("-restore-panel", "-create-panel");
    await clickStep(
      page.locator(`[aria-controls="${createPanel}"][data-operation-tab]`),
      `Open ${createPanel}`,
    );
    await page.locator(method.source).fill(mnemonic);
    await clickStep(page.locator(method.create), `Create records in ${method.panel}`);
    const created = page.locator(`${method.createResult} .share-secret`);
    await created.nth(method.needed - 1).waitFor();
    const qrActions = page.locator(`${method.createResult} .share-qr-action`);
    assert.ok((await qrActions.count()) >= method.needed);
    if (!checkedQrPopoverInteractions) {
      const qrAction = qrActions.first();
      const qrTrigger = qrAction.locator(".qr-trigger");
      const qrPopover = qrAction.locator(".payment-qr-popover");
      await qrTrigger.hover();
      await qrPopover.waitFor({ state: "visible" });
      await page.mouse.move(1, 1);
      await qrPopover.waitFor({ state: "hidden" });
      await clickStep(qrTrigger, "Pin QR popover");
      await qrPopover.waitFor({ state: "visible" });
      assert.equal(await qrTrigger.getAttribute("aria-expanded"), "true");
      await clickStep(qrPopover.locator(".payment-qr-close"), "Close QR popover");
      await qrPopover.waitFor({ state: "hidden" });
      assert.equal(await qrTrigger.getAttribute("aria-expanded"), "false");
      const originalViewport = page.viewportSize();
      for (const viewport of [
        { width: 1024, height: 720 },
        { width: 800, height: 720 },
        { width: 390, height: 720 },
        { width: 390, height: 480 },
      ]) {
        await page.setViewportSize(viewport);
        await clickStep(qrTrigger, `Open QR at ${viewport.width}px`);
        const bounds = await qrPopover.boundingBox();
        assert.ok(bounds !== null);
        assert.ok(
          bounds.x >= 0 && bounds.y >= 0,
          "QR popover must not extend beyond the top or left edge",
        );
        assert.ok(
          bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height,
        );
        await clickStep(qrPopover.locator(".payment-qr-close"), `Close QR at ${viewport.width}px`);
        await qrPopover.waitFor({ state: "hidden" });
      }
      await page.setViewportSize(originalViewport);
      await clickStep(qrTrigger, "Reopen QR popover");
      await qrPopover.waitFor({ state: "visible" });
      await clickStep(qrTrigger, "Toggle QR popover closed");
      await qrPopover.waitFor({ state: "hidden" });
      checkedQrPopoverInteractions = true;
    }
    const copyActions = page.locator(`${method.createResult} .secret-copy-action`);
    if ((await copyActions.count()) > 0) {
      assert.ok(
        (
          await copyActions.evaluateAll((buttons) => buttons.map((button) => button.disabled))
        ).every(Boolean),
      );
    }
    const payloads = await created.allTextContents();
    await clickStep(page.locator(method.revealCreated), `Reveal records in ${method.panel}`);
    if ((await copyActions.count()) > 0) {
      assert.ok(
        (
          await copyActions.evaluateAll((buttons) => buttons.map((button) => button.disabled))
        ).every((disabled) => !disabled),
      );
    }
    await clickStep(
      page.locator(`[aria-controls="${method.restorePanel}"][data-operation-tab]`),
      `Open ${method.restorePanel}`,
    );
    await page.locator(method.shares).fill(payloads.slice(0, method.needed).join("\n"));
    await clickStep(page.locator(method.restore), `Restore records in ${method.panel}`);
    const recovered = page.locator(`${method.restoreResult} textarea`);
    await recovered.waitFor();
    assert.equal(await recovered.inputValue(), mnemonic);
    const recoveredCopy = page.locator(`${method.restoreResult} .secret-action`);
    assert.equal(await recoveredCopy.isDisabled(), true);
    await clickStep(
      page.locator(`${method.restoreResult} button`).filter({ hasText: "Show phrase" }),
      `Reveal restored phrase in ${method.panel}`,
    );
    assert.equal(
      await recoveredCopy.isEnabled(),
      true,
      `Copy stays disabled after revealing the phrase restored in ${method.panel}.`,
    );
  }

  await clickStep(
    page.locator("#codex32-restore-result button").filter({ hasText: "Use in Generate & Derive" }),
    "Return restored Codex32 phrase to Deriver",
  );
  assert.equal(await page.locator("#mnemonic").inputValue(), mnemonic);
  assert.equal(await page.locator("#derive-form").isVisible(), true);
  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "Recovery help popovers; MHFE Worker initialization/PIM/Stop; SeedQR, MnemoCode, SLIP-39, and Codex32 exact browser round trips; QR actions; reveal-gated copy; in-memory return to Derive; storage/no HTTP",
  );
}

// Poppler draws the same PDF for comparison; without it the comparison is skipped, not faked.
const hasPoppler = spawnSync("pdftocairo", ["-v"]).error === undefined;
const CARD_IMAGE_DPI = 300;
// Two programs smooth edges and scale photographs differently. Measured on 2026-09-29 in
// Chromium and Firefox: an average difference of 0.4 to 1.1 of 255, and 0.003% of the pixels
// with a strong difference. One missing line of text is a strong difference in about 0.4%.
const LARGEST_AVERAGE_DIFFERENCE = 2;
const STRONG_DIFFERENCE = 96;
const LARGEST_SHARE_OF_STRONG_DIFFERENCES = 0.0005;

function pngPixels(bytes) {
  const upng = upngModule.default ?? upngModule;
  const image = upng.decode(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return { width: image.width, height: image.height, data: new Uint8Array(upng.toRGBA8(image)[0]) };
}

function popplerPixels(pdf, width, height) {
  const directory = mkdtempSync(join(tmpdir(), "card-image-"));
  try {
    writeFileSync(join(directory, "card.pdf"), pdf);
    execFileSync("pdftocairo", [
      ...["-png", "-transp", "-singlefile", "-r", String(CARD_IMAGE_DPI)],
      ...["-x", "0", "-y", "0", "-W", String(width), "-H", String(height)],
      join(directory, "card.pdf"),
      join(directory, "card"),
    ]);
    return pngPixels(readFileSync(join(directory, "card.png")));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Fails when the image of the page differs from the image that Poppler makes of the PDF. */
function assertSamePicture(image, expected, label) {
  assert.deepEqual([image.width, image.height], [expected.width, expected.height], label);
  let sum = 0;
  let strong = 0;
  for (let pixel = 0; pixel < image.data.length; pixel += 4) {
    let largest = 0;
    // Red, green, blue and opacity.
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(image.data[pixel + channel] - expected.data[pixel + channel]);
      sum += difference;
      largest = Math.max(largest, difference);
    }
    if (largest > STRONG_DIFFERENCE) strong += 1;
  }
  const average = sum / image.data.length;
  const share = strong / (image.data.length / 4);
  assert.ok(
    average < LARGEST_AVERAGE_DIFFERENCE,
    `${label} differs from the PDF by ${average.toFixed(2)} on average`,
  );
  assert.ok(
    share < LARGEST_SHARE_OF_STRONG_DIFFERENCES,
    `${label} differs strongly from the PDF in ${(share * 100).toFixed(3)}% of its pixels`,
  );
}

function alphaAt(image, x, y) {
  return image.data[(y * image.width + x) * 4 + 3];
}

async function mnemocodeCardImages(page, save, pdfArchive) {
  await page.locator("#mnemocode-card-file-format").selectOption("png");
  assert.match(
    await page.locator("#mnemocode-card-output-note").innerText(),
    /own numbered PNG image/u,
  );
  const archive = await save();
  assert.equal(archive.name, "cards-business.zip");
  const documents = unzipSync(new Uint8Array(pdfArchive));
  const images = unzipSync(new Uint8Array(archive.bytes));
  assert.deepEqual(
    Object.keys(images),
    Object.keys(documents).map((name) => name.replace(/\.pdf$/u, ".png")),
  );
  for (const [name, bytes] of Object.entries(images)) {
    const card = pngPixels(bytes);
    // 90 x 50 mm at 300 dpi, in whole pixels.
    assert.deepEqual([card.width, card.height], [1062, 590], name);
    // The corners outside the rounded edge are transparent, the card itself is not.
    for (const [x, y] of [
      [0, 0],
      [card.width - 1, 0],
      [0, card.height - 1],
      [card.width - 1, card.height - 1],
    ])
      assert.equal(alphaAt(card, x, y), 0, `${name} corner`);
    assert.equal(alphaAt(card, card.width >> 1, card.height >> 1), 255, `${name} centre`);
    assert.equal(alphaAt(card, card.width >> 1, 0), 255, `${name} top edge`);
    if (hasPoppler) {
      const expected = popplerPixels(
        documents[name.replace(/\.png$/u, ".pdf")],
        card.width,
        card.height,
      );
      assertSamePicture(card, expected, name);
    }
  }

  // A sheet with a QR code: the code in the image must read like the code in the PDF.
  await page.locator("#mnemocode-card-page-size").selectOption("a6");
  await page.locator("#mnemocode-card-qr").check();
  const sheet = await save();
  assert.equal(sheet.name, "cards-a6.png");
  const pixels = pngPixels(sheet.bytes);
  assert.deepEqual([pixels.width, pixels.height], [1748, 1240]);
  const data = decodeQr(pixels);
  assert.match(data, /^#[0-9A-F]{6}( #[0-9A-F]{6})+$/u);
  if (hasPoppler) {
    await page.locator("#mnemocode-card-file-format").selectOption("pdf");
    const expected = popplerPixels((await save()).bytes, pixels.width, pixels.height);
    assert.equal(decodeQr(expected), data);
    assertSamePicture(pixels, expected, "The sheet");
  }
  await page.locator("#mnemocode-card-qr").uncheck();

  // The material templates use photographs stored as JPEG, which the browser decodes. A sheet
  // takes the orientation with the larger tiles, so its two sides are checked in either order.
  const template = page.locator("#mnemocode-card-template");
  const chosen = await template.inputValue();
  await template.selectOption("material-vehicle");
  await page.locator("#mnemocode-card-file-format").selectOption("png");
  const material = pngPixels((await save()).bytes);
  assert.deepEqual([material.width, material.height].sort(), [1240, 1748]);
  if (hasPoppler) {
    await page.locator("#mnemocode-card-file-format").selectOption("pdf");
    assertSamePicture(
      material,
      popplerPixels((await save()).bytes, material.width, material.height),
      "The material sheet",
    );
  }
  await template.selectOption(chosen);

  // The scenario continues with separate PDF cards.
  await page.locator("#mnemocode-card-file-format").selectOption("pdf");
  await page.locator("#mnemocode-card-page-size").selectOption("business");
}

async function mnemocodeCards(context, profile, run) {
  const { page, before } = await openSeedShiftEncoding(context, profile, run);

  // "How it works" follows the selected option, opens on hover and stays open after a click.
  const formatHelp = page.locator("#mnemocode-format-help");
  await page.locator("#mnemocode-encode-format").selectOption("unicode");
  await formatHelp.locator("summary").hover();
  await page.waitForFunction(() =>
    document.querySelector("#mnemocode-format-help")?.hasAttribute("open"),
  );
  assert.match(
    await formatHelp.locator(".recovery-help-popover").innerText(),
    /Traditional Chinese BIP39 list/u,
  );
  await formatHelp.locator("summary").click();
  await page.locator("#mnemocode-panel h2").hover();
  assert.equal(await formatHelp.getAttribute("open"), "");
  await page.locator("#mnemocode-encode-format").selectOption("indexes");
  assert.match(await formatHelp.locator(".recovery-help-popover").innerText(), /from 1 to 2048/u);
  await page.keyboard.press("Escape");
  assert.equal(await formatHelp.getAttribute("open"), null);
  // The mode popover is closed here, so its text is read without requiring it to be visible.
  assert.match(
    (await page.locator("#mnemocode-mode-help .recovery-help-popover").textContent()) ?? "",
    /sorted from the oldest/u,
  );

  // Cards print colors or Unicode codes, so the section exists only for those representations.
  for (const format of ["english", "indexes"]) {
    await page.locator("#mnemocode-encode-format").selectOption(format);
    assert.equal(await page.locator("#mnemocode-cards-section").isVisible(), false);
  }
  for (const format of ["unicode", "colors-unicode"]) {
    await page.locator("#mnemocode-encode-format").selectOption(format);
    assert.equal(await page.locator("#mnemocode-cards-section").isVisible(), true);
  }
  await page.locator("#mnemocode-encode-format").selectOption("colors");
  await page.locator("#mnemocode-cards-section > summary").click();

  // The list comes from the embedded MnemoCode registry.
  assert.equal(await page.locator("#mnemocode-card-template option").count(), 13);
  assert.deepEqual(
    await page
      .locator("#mnemocode-card-page-size option")
      .evaluateAll((options) => options.map((o) => o.value)),
    ["a6", "a5", "a4", "business"],
  );
  assert.deepEqual(
    await page
      .locator("#mnemocode-card-file-format option")
      .evaluateAll((options) => options.map((o) => o.value)),
    ["pdf", "png", "jpg"],
  );

  const save = async () => {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.locator("#export-mnemocode-cards").click(),
    ]);
    const bytes = readFileSync(await download.path());
    await waitText(page, "#mnemocode-cards-status", /^Saved /u);
    return { name: download.suggestedFilename(), bytes };
  };

  await page.locator("#mnemocode-card-template").selectOption({ index: 1 });
  await page.locator("#mnemocode-card-page-size").selectOption("a4");
  await page.locator("#mnemocode-card-qr").check();
  // Without own details the invented person stays the same for every size of this phrase.
  const printedFor = async () =>
    /Printed for ([^.]+)\./u.exec(await page.locator("#mnemocode-cards-status").innerText())?.[1];
  assert.equal(await page.locator("#mnemocode-card-profile").isVisible(), false);
  await save();
  const invented = await printedFor();
  assert.ok(invented !== undefined && invented.length > 3);
  await page.locator("#mnemocode-card-page-size").selectOption("a6");
  await save();
  assert.equal(await printedFor(), invented);
  await page.locator("#mnemocode-card-page-size").selectOption("a4");

  // Own details replace the invented ones; empty fields keep their invented value.
  await page.locator("#mnemocode-card-own-details").check();
  assert.equal(await page.locator("#mnemocode-card-profile").isVisible(), true);
  await page.locator("#mnemocode-card-name").fill("John Smith");
  const sheet = await save();
  assert.equal(await printedFor(), `John Smith, ${invented.split(", ")[1]}`);
  assert.equal(sheet.name, "cards-a4.pdf");
  assert.equal(sheet.bytes.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(sheet.bytes.length > 50_000, "The sheet must contain the embedded artwork.");

  // A card size means separate cards: no QR option, one numbered PDF per card.
  assert.equal(await page.locator("#mnemocode-card-output").count(), 0);
  await page.locator("#mnemocode-card-page-size").selectOption("business");
  assert.equal(await page.locator("#mnemocode-card-qr-row").isVisible(), false);
  assert.equal(await page.locator("#mnemocode-card-qr").isChecked(), false);
  assert.match(await page.locator("#mnemocode-card-output-note").innerText(), /own numbered PDF/u);
  const archive = await save();
  assert.equal(archive.name, "cards-business.zip");
  await page.locator("#mnemocode-card-page-size").selectOption("a6");
  assert.equal(await page.locator("#mnemocode-card-qr-row").isVisible(), true);
  await page.locator("#mnemocode-card-page-size").selectOption("business");
  assert.equal(archive.bytes.subarray(0, 2).toString("latin1"), "PK");
  // Eight codes, one a card, then at least one decoy (MnemoCode's plan of separate cards).
  const separateCards = /with (\d+) cards/u.exec(
    await page.locator("#mnemocode-cards-status").innerText(),
  );
  assert.ok(Number(separateCards?.[1]) > 8, "separate cards end with decoys");
  await mnemocodeCardImages(page, save, archive.bytes);

  await page.locator("#mnemocode-card-name").fill("1234");
  await page.locator("#export-mnemocode-cards").click();
  await waitText(page, "#mnemocode-cards-status", /Latin letters/u);
  assert.equal(await page.locator("#export-mnemocode-cards").isDisabled(), false);
  // Unticking the box ignores the fields and returns to the invented person.
  await page.locator("#mnemocode-card-own-details").uncheck();
  await save();
  assert.equal(await printedFor(), invented);

  await page.locator("#mnemocode-encode-format").selectOption("english");
  assert.equal(await page.locator("#mnemocode-cards-section").isVisible(), false);
  assert.equal(await page.locator("#export-mnemocode-cards").isVisible(), false);

  // The Decode tab explains its options in the same way.
  const helpText = async (id) =>
    (await page.locator(`#${id} .recovery-help-popover`).textContent()) ?? "";
  await page.locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]').click();
  assert.match(await helpText("mnemocode-decode-format-help"), /never guesses/u);
  await page.locator("#mnemocode-decode-format").selectOption("colors");
  assert.match(await helpText("mnemocode-decode-format-help"), /packed into colors/u);
  await page.locator("#mnemocode-decode-mode").selectOption("seedshift");
  assert.match(await helpText("mnemocode-decode-mode-help"), /move every word back/u);
  // Forgotten asks what is forgotten, as MnemoCode's menu does.
  await page.locator('[data-operation-tab][aria-controls="mnemocode-forgotten-panel"]').click();
  assert.equal(await page.locator('input[name="mnemocode-forgotten-kind"]').count(), 4);
  // Codes typed where the words are asked for are pointed to Decode, which reads them.
  const codesNotWords =
    /^These are the codes of an encoded seed phrase, not its words: Decode reads them/u;
  // The Unicode codes of the public test phrase, the last one unreadable.
  await page
    .locator("#mnemocode-forgotten-phrase")
    .fill(`${Array.from({ length: 11 }, () => "7684").join(" ")} ?`);
  await waitText(page, "#mnemocode-forgotten-count", codesNotWords);
  await page.locator("#mnemocode-forgotten-wallet-none").check();
  await page.locator("#mnemocode-forgotten-search").click();
  await waitText(page, "#mnemocode-forgotten-status", codesNotWords);
  await page.locator("#mnemocode-forgotten-phrase").fill("");
  // An unreadable code of an encoded seed phrase is searched in Decode, where codes are read.
  await page.locator("#mnemocode-forgotten-kind-code").check();
  assert.equal(await page.locator("#mnemocode-forgotten-search-fields").isVisible(), false);
  await page.locator("#mnemocode-forgotten-open-decode").click();
  await page.locator("#mnemocode-decode-panel").waitFor({ state: "visible" });
  await page.locator('[data-operation-tab][aria-controls="mnemocode-forgotten-panel"]').click();
  await page.locator("#mnemocode-forgotten-kind-word").check();

  assert.deepEqual(await storageSnapshot(page), before);
  assert.deepEqual(run.requests, []);
}

async function mnemocodeRoundTrip(context, profile, run) {
  const { page, before } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
  assert.equal(await page.locator("#recovery-workspace").isVisible(), true);
  assert.equal(await page.locator("#mnemocode-panel").isVisible(), true);
  assert.match(
    await page.locator("#mnemocode-panel .linked-recovery-source").innerText(),
    /Generate & Derive/u,
  );

  const encode = async (mode, format) => {
    await page.locator('[data-operation-tab][aria-controls="mnemocode-create-panel"]').click();
    await page.locator("#mnemocode-encode-mode").selectOption(mode);
    await page.locator("#mnemocode-encode-format").selectOption(format);
    if (mode === "direct") {
      await page.locator("#mnemocode-encode-dates").evaluate((input) => {
        input.value = "";
      });
    } else {
      await page.locator("#mnemocode-encode-dates").fill("23-09-2026");
    }
    await page.locator("#encode-mnemocode").click();
    const payload = page.locator("#mnemocode-encode-result article .share-secret").first();
    await payload.waitFor();
    const value = (await payload.textContent()) ?? "";
    assert.doesNotMatch(value, /^MNC1:/u);
    // Codes written joined are shown apart above the joined text too, concealed alike, so that a
    // person sees which code to mark with ? (MnemoCode, owner 2026-10-13).
    const apart = page.locator("#mnemocode-encode-result article .apart-codes");
    const joined = format === "unicode" || format === "colors-unicode";
    assert.equal(await apart.count(), joined ? 1 : 0);
    if (joined) {
      const codes = ((await apart.textContent()) ?? "").split(" ");
      if (format === "unicode") assert.equal(codes.length, mnemonic.split(" ").length);
      assert.equal(codes.join(""), value.replace(/\s/gu, ""));
      assert.match((await apart.getAttribute("class")) ?? "", /\bconcealed\b/u);
      assert.match(
        await page.locator("#mnemocode-encode-result").innerText(),
        /Joined, for copying:/u,
      );
    }
    // The Original Seedshift adds its optional checksum-valid last word, concealed like the record,
    // where the shifted phrase of the test vector fails the checksum.
    const cards = mode === "seedshift-legacy" ? 2 : 1;
    assert.equal(await page.locator("#mnemocode-encode-result article").count(), cards);
    assert.equal(await page.locator("#mnemocode-encode-result .share-qr-action").count(), cards);
    assert.equal(
      await page.locator("#mnemocode-encode-result .mnemocode-palette").count(),
      format === "colors" || format === "colors-unicode" ? 1 : 0,
    );
    assert.equal(
      await page
        .locator("#mnemocode-encode-result button")
        .filter({ hasText: "Save record" })
        .isDisabled(),
      true,
    );
    return value;
  };

  const decode = async (record, mode, expectCandidates = false) => {
    await page.locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]').click();
    await page.locator("#mnemocode-decode-mode").selectOption(mode);
    if (mode === "direct") {
      await page.locator("#mnemocode-decode-dates").evaluate((input) => {
        input.value = "";
      });
    } else {
      await page.locator("#mnemocode-decode-dates").fill("23-09-2026");
    }
    await page.locator("#mnemocode-input").fill(record);
    await page.locator("#decode-mnemocode").click();
    const output = page.locator("#mnemocode-decode-result textarea");
    await output.waitFor();
    if (expectCandidates) {
      assert.match(await output.inputValue(), new RegExp(mnemonic, "u"));
      assert.match(
        await page.locator("#mnemocode-decode-result .warning-callout").innerText(),
        /128/u,
      );
    } else {
      assert.equal(await output.inputValue(), mnemonic);
    }
  };

  for (const format of ["english", "indexes", "unicode", "colors", "colors-unicode"]) {
    await decode(await encode("direct", format), "direct");
  }
  // A record read from a file with the shared-style file button fills the field as if typed.
  const record = await encode("direct", "indexes");
  await page.locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]').click();
  await page.locator("#mnemocode-input").fill("");
  const recordFile = page
    .locator("#mnemocode-decode-panel label.file-choice")
    .filter({ hasText: "Open a record file" });
  assert.equal(await recordFile.count(), 1);
  await recordFile.locator('input[type="file"]').setInputFiles({
    name: "record.mnc",
    mimeType: "text/plain",
    buffer: Buffer.from(`${record}\n`),
  });
  await page.waitForFunction(
    (expected) => document.querySelector("#mnemocode-input")?.value === expected,
    record.trim(),
  );
  // MnemoCode's word hints below a field shown as typed: English codes get them and Tab completes
  // the word, Unicode codes get none, and a press below the field while a hint shows still lands,
  // as the hint goes only after the click.
  const codes = page.locator("#mnemocode-input");
  const codesHint = "#mnemocode-input + .word-hint";
  await page.locator("#toggle-mnemocode-input").click();
  await codes.fill("abandon zo");
  await waitText(page, codesHint, /^zone zoo$/u);
  await codes.fill("abandon artw");
  await waitText(page, codesHint, /^artwork$/u);
  await codes.press("Tab");
  assert.equal(await codes.inputValue(), "abandon artwork ");
  await codes.fill("7684 5728 CA");
  await page.waitForTimeout(400);
  assert.equal(await page.locator(codesHint).isVisible(), false);
  await codes.fill("abandon z");
  await waitText(page, codesHint, /^4 BIP39 words begin with this letter$/u);
  await page.locator("#decode-mnemocode").click();
  await page.waitForFunction(
    () => (document.querySelector("#mnemocode-decode-result")?.textContent ?? "").trim() !== "",
  );
  await page.locator(codesHint).waitFor({ state: "hidden" });
  await page.locator("#toggle-mnemocode-input").click();
  for (const mode of ["seedshift", "seedshift-legacy"]) {
    await decode(await encode(mode, "english"), mode);
  }
  await decode(await encode("seedshift-legacy-valid", "english"), "seedshift-legacy-valid", true);

  await page.locator('[data-operation-tab][aria-controls="mnemocode-create-panel"]').click();
  await page.locator("#mnemocode-encode-mode").selectOption("seedshift");
  await page.locator("#mnemocode-encode-format").selectOption("english");
  await page.locator("#mnemocode-encode-dates").fill("23-13-1999");
  await page.locator("#encode-mnemocode").click();
  assert.match(
    await page.locator("#mnemocode-encode-result").innerText(),
    /month must be an integer from 1 through 12/u,
  );
  await page.locator("#mnemocode-encode-dates").fill("23-12-1999");
  assert.equal(await page.locator("#mnemocode-encode-result").innerText(), "");
  await page.locator("#encode-mnemocode").click();
  await page.locator("#mnemocode-encode-result article .share-secret").waitFor();

  // Forgotten: one word, every candidate listed; the words found stay concealed until shown, and no
  // button copies the candidates in bulk.
  await page.locator('[data-operation-tab][aria-controls="mnemocode-forgotten-panel"]').click();
  const forgottenResult = page.locator("#mnemocode-forgotten-result");
  const forgottenStatus = page.locator("#mnemocode-forgotten-status");
  await page.locator("#mnemocode-forgotten-phrase").fill(mnemonic.replace(/about$/u, "?"));
  await page.locator("#mnemocode-forgotten-wallet-none").check();
  await page.locator("#mnemocode-forgotten-search").click();
  await waitText(page, "#mnemocode-forgotten-status", /Search complete/u);
  assert.match(
    await forgottenResult.innerText(),
    /128 candidates\. A valid checksum does not prove/u,
  );
  assert.equal(
    await forgottenResult
      .locator(".candidate-found")
      .first()
      .evaluate((found) => found.classList.contains("concealed")),
    true,
  );
  assert.equal(await forgottenResult.locator("button").filter({ hasText: "Copy all" }).count(), 0);

  // The replacements of an old Original Seedshift phrase's last word.
  await page.locator("#mnemocode-forgotten-where-legacy").check();
  await page
    .locator("#mnemocode-forgotten-phrase")
    .fill("mosquito dust hotel maximum rich kitten hair mother salute dream flush hospital");
  await page.locator("#mnemocode-forgotten-search").click();
  const wordOptions = forgottenResult.locator(".mnemocode-word-options");
  await wordOptions.waitFor();
  assert.match(await wordOptions.inputValue(), /checksum-bits\tlegacy-tail/u);
  assert.equal(
    (await wordOptions.inputValue()).split("\n").filter((line) => line.includes("\tpreserved"))
      .length,
    1,
  );
  assert.match(
    await forgottenResult.locator(".warning-callout").innerText(),
    /128 checksum-valid final-word replacements/u,
  );

  const impossibleWords = Array(24).fill("abandon");
  impossibleWords[4] = "?";
  impossibleWords[23] = "sure";
  await page.locator("#mnemocode-forgotten-where-places").check();
  await page.locator("#mnemocode-forgotten-phrase").fill(impossibleWords.join(" "));
  await page.locator("#mnemocode-forgotten-wallet-none").check();
  await page.locator("#mnemocode-forgotten-search").click();
  await waitText(page, "#mnemocode-forgotten-status", /Search complete/u);
  assert.match(await forgottenResult.innerText(), /No valid phrase fits/u);
  assert.equal(await forgottenResult.locator("textarea").count(), 0);
  assert.equal(await forgottenStatus.isVisible(), true);

  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "MnemoCode Encode/Decode UI: all five representations; a record opened from a file; word hints with Tab completion, none for Unicode codes, a press below a hint still landing; Direct, Seedshift, legacy and legacy-valid modes; Forgotten word search in its worker and exact-legacy final-word replacements; MNC1/QR; storage/no HTTP",
  );
}

/** MnemoCode's shares: a split, a restore with an unreadable element, and a share repair. */
async function mnemocodeShares(context, profile, run) {
  const { page, before } = await openBackupPanel(context, profile, run, "mnemocode-panel");
  const tab = (name) =>
    page.locator(`[data-operation-tab][aria-controls="mnemocode-${name}-panel"]`).click();
  await page.locator("#mnemocode-source").fill(mnemonic);
  await page.locator("#mnemocode-split-section > summary").click();
  await page.locator("#mnemocode-split-form").selectOption("words");
  await page.locator("#mnemocode-split").click();
  const split = page.locator("#mnemocode-split-result");
  await split.locator(".share-secret").first().waitFor();
  const shares = await split.locator(".share-secret").allTextContents();
  assert.equal(shares.length, 3);
  assert.match(await split.innerText(), /3 shares, any 2 restore it/u);
  assert.match(await split.innerText(), /Original fingerprint 73c5da0a\./u);
  // Concealed until shown, and the section's Show button leaves Encode's records alone.
  assert.equal(await split.locator(".secret-copy-action").first().isDisabled(), true);
  await page.locator("#toggle-mnemocode-split-result").click();
  assert.equal(await split.locator(".secret-copy-action").first().isDisabled(), false);
  assert.equal(await page.locator("#toggle-mnemocode-created").innerText(), "Show records");

  const marked = shares[1].split(" ");
  marked[7] = "?";
  await tab("restore");
  await page.locator("#mnemocode-restore-shares").fill(`${shares[0]}\n${marked.join(" ")}`);
  await page.locator("#mnemocode-restore").click();
  await waitText(page, "#mnemocode-restore-status", /The phrase is restored\./u);
  const restored = page.locator("#mnemocode-restore-result");
  // What the repair filled in is a table, a row for each share: share 2, element 8, its own word.
  assert.match(await restored.innerText(), /Filled in where \? stood:/u);
  const repairRows = restored.locator(".mnemocode-repair-table tbody tr");
  assert.equal(await repairRows.count(), 1);
  assert.equal(await repairRows.locator("td").first().innerText(), "2");
  assert.equal(await repairRows.locator(".mnemocode-repair-position").innerText(), "8");
  assert.equal(await repairRows.locator("strong").innerText(), shares[1].split(" ")[7]);
  assert.match(await restored.innerText(), /Original fingerprint 73c5da0a\./u);
  await page.locator("#mnemocode-restore-shares").fill(mnemonic);
  await page.locator("#mnemocode-restore").click();
  await waitText(page, "#mnemocode-restore-status", /not a Shamir share/u);

  // A share typed into Decode goes to Restore as its first share, as MnemoCode's decode sends it;
  // a share typed in Restore before stays below it (AUD-023-UI001), and the two restore.
  await page.locator("#mnemocode-restore-shares").fill(shares[1]);
  await tab("decode");
  await page.locator("#mnemocode-input").fill(shares[0]);
  await page.locator("#decode-mnemocode").click();
  await waitText(page, "#mnemocode-restore-status", /they are the first share here/u);
  assert.match(await page.locator("#mnemocode-restore-status").innerText(), /stay below it/u);
  assert.equal(
    await page.locator("#mnemocode-restore-shares").inputValue(),
    `${shares[0]}\n${shares[1]}`,
  );
  assert.equal(await page.locator("#mnemocode-restore-panel").isVisible(), true);
  await page.locator("#mnemocode-restore").click();
  await waitText(page, "#mnemocode-restore-status", /The phrase is restored\./u);

  // A ? inside a color stands for one hex digit: two unreadable digits of one color are settled.
  await tab("create");
  await page.locator("#mnemocode-split-form").selectOption("colors");
  await page.locator("#mnemocode-split").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#mnemocode-split-result .share-secret")
      ?.textContent?.trim()
      .startsWith("#"),
  );
  const colored = await split.locator(".share-secret").allTextContents();
  const colors = colored[1].trim().split(/\s+/u);
  const place = colors.length - 2;
  const color = colors[place];
  colors[place] = `${color.slice(0, 3)}?${color[4]}?${color[6]}`;
  await tab("restore");
  await page.locator("#mnemocode-restore-shares").fill(`${colored[0]}\n${colors.join(" ")}`);
  await page.locator("#mnemocode-restore").click();
  await waitText(page, "#mnemocode-restore-status", /The phrase is restored\./u);
  assert.match(await restored.innerText(), /Original fingerprint 73c5da0a\./u);
  // A color with a ? but not six symbols is refused by its place, without the share's text.
  colors[place] = `${color.slice(0, 5)}?`;
  await page.locator("#mnemocode-restore-shares").fill(`${colored[0]}\n${colors.join(" ")}`);
  await page.locator("#mnemocode-restore").click();
  await waitText(
    page,
    "#mnemocode-restore-status",
    new RegExp(`^Share 2: color ${place + 1} has 5 of 6 symbols`, "u"),
  );
  assert.doesNotMatch(await page.locator("#mnemocode-restore-status").innerText(), /#/u);

  // Shares in Unicode codes show their codes apart above the joined text, behind the section's Show
  // button, and the restore shows the backup so too (MnemoCode, owner 2026-10-13).
  await tab("create");
  await page.locator("#mnemocode-split-form").selectOption("unicode");
  await page.locator("#mnemocode-split").click();
  await split.locator(".apart-codes").first().waitFor();
  const unicode = await split.locator(".share-secret").allTextContents();
  const apartShares = await split.locator(".apart-codes").allTextContents();
  assert.equal(apartShares.length, 3);
  apartShares.forEach((codes, index) =>
    assert.equal(codes.replaceAll(" ", ""), unicode[index].replace(/\s/gu, "")),
  );
  assert.match(await split.innerText(), /Joined, for copying:/u);
  assert.match(
    (await split.locator(".apart-codes").first().getAttribute("class")) ?? "",
    /\bconcealed\b/u,
  );
  await page.locator("#toggle-mnemocode-split-result").click();
  assert.doesNotMatch(
    (await split.locator(".apart-codes").first().getAttribute("class")) ?? "",
    /\bconcealed\b/u,
  );
  await tab("restore");
  await page.locator("#mnemocode-restore-shares").fill(unicode.slice(0, 2).join("\n"));
  await page.locator("#mnemocode-restore").click();
  await waitText(page, "#mnemocode-restore-status", /The phrase is restored\./u);
  assert.match(await restored.innerText(), /mapped Unicode code points of/u);
  const backup = restored.locator(".apart-codes");
  assert.match((await backup.getAttribute("class")) ?? "", /\bconcealed\b/u);
  await restored.getByRole("button", { name: "Show backup" }).click();
  assert.doesNotMatch((await backup.getAttribute("class")) ?? "", /\bconcealed\b/u);
  assert.equal(
    ((await backup.textContent()) ?? "").replaceAll(" ", ""),
    await restored.locator("textarea").first().inputValue(),
  );

  // Shares typed in Restore get the hints of the Bytewords, for the share after the last ";".
  await page.locator("#toggle-mnemocode-restore-shares").click();
  await page.locator("#mnemocode-restore-shares").fill("tuna acid; ta");
  await waitText(page, "#mnemocode-restore-shares + .word-hint", /^taco task taxi$/u);
  await page.locator("#mnemocode-restore-shares").fill("");
  await page.locator("#toggle-mnemocode-restore-shares").click();

  await tab("forgotten");
  await page.locator("#mnemocode-forgotten-kind-share").check();
  await page.locator("#mnemocode-forgotten-shares").fill(`${shares[0]}\n${marked.join(" ")}`);
  await page.locator("#mnemocode-forgotten-shares-wallet-none").check();
  await page.locator("#mnemocode-forgotten-shares-repair").click();
  await waitText(page, "#mnemocode-forgotten-shares-status", /The shares are written again\./u);
  const repaired = page.locator("#mnemocode-forgotten-shares-result");
  assert.deepEqual(await repaired.locator(".share-secret").allTextContents(), [
    shares[0],
    shares[1],
  ]);
  assert.doesNotMatch(await repaired.innerText(), /abandon/u, "a repair never shows the phrase");

  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "MnemoCode shares: 2-of-3 split with fingerprints and its own reveal gate; restore with a ? element repaired jointly; ? digits inside a color repaired, a short color refused by its place; Unicode shares and their restored backup shown apart and joined; Bytewords hints for a share typed; a share typed into Decode handed to Restore; a phrase refused as a share; share repair without the phrase; storage/no HTTP",
  );
}

/**
 * A forgotten word told by the wallet's Dash address among its first addresses: the coin choice
 * of every edition, named "Dash address" where Dash is the only coin.
 */
async function mnemocodeCoinEvidence(context, profile, run) {
  const { page, before } = await openBackupPanel(context, profile, run, "mnemocode-panel");
  await page.locator('[data-operation-tab][aria-controls="mnemocode-forgotten-panel"]').click();
  await page.locator("#mnemocode-forgotten-phrase").fill(mnemonic.replace(/about$/u, "?"));
  await page.locator("#mnemocode-forgotten-wallet-coin-choice").check();
  const label = await page.locator("#mnemocode-forgotten-wallet-coin-label").innerText();
  if (profile.id === "dash-community") {
    assert.equal(label, "Dash address");
    assert.equal(await page.locator("#mnemocode-forgotten-wallet-coin").isVisible(), false);
  } else {
    assert.equal(label, "Address of another coin");
    await page.locator("#mnemocode-forgotten-wallet-coin").selectOption("dash");
  }
  // The first Dash Core receiving address of the public test phrase, among the first 20.
  await page
    .locator("#mnemocode-forgotten-wallet-coin-address")
    .fill("XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5");
  assert.equal(await page.locator("#mnemocode-forgotten-wallet-addresses").inputValue(), "20");
  await page.locator("#mnemocode-forgotten-search").click();
  await waitText(page, "#mnemocode-forgotten-status", /^Search complete/u);
  assert.match(
    await page.locator("#mnemocode-forgotten-result").innerText(),
    /Matched 1 of \d+ candidates against the address locally\./u,
  );
  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "MnemoCode wallet by a coin address: a forgotten word found by a Dash address among the first 20; Dash-only label in the Dash edition; storage/no HTTP",
  );
}

async function childWallet(context, profile, run) {
  const page = await open(context, profile, "key-derivation", run);
  const before = await storageSnapshot(page);
  await page.locator("#count").fill("1");
  await page.locator("#mnemonic").fill(mnemonic);
  await page.locator("#passphrase").fill(parentPassphrase);
  await page.locator("#include-bip85").check();
  await page.locator("#bip85-tab").click();
  // No explicit Derive click: this is the feature-tab auto-derive regression.
  await page.locator("#bip85-result").waitFor({ state: "visible" });
  assert.equal(await page.locator("#bip85-output").inputValue(), childMnemonic);
  assert.equal(await page.locator("#results").isVisible(), false);
  await page.locator("#open-bip85-wallet").click();
  await page.locator("#bip85-wallet-count").fill("1");
  await page.locator("#bip85-child-passphrase").fill(childPassphrase);
  await page.locator("#bip85-wallet-tabs button").filter({ hasText: "BIP86" }).click();
  await page.locator("#derive-bip85-wallet").click();
  await page.locator("#bip85-wallet-results").waitFor({ state: "visible" });
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector("#bip85-wallet-list [data-sign-address]")
        ?.getAttribute("data-sign-address") === expected,
    childAddress,
  );
  const proof = await sign(page, "#bip85-wallet-list [data-sign-message]");
  assert.equal(proof.address, childAddress);
  assert.equal(await page.locator("#mnemonic").inputValue(), mnemonic);
  assert.equal(await page.locator("#passphrase").inputValue(), parentPassphrase);
  assert.equal(await page.locator("#bip85-output").inputValue(), childMnemonic);
  const verifier = await open(context, profile, "psbt-inspector", run);
  await verifySignature(verifier, proof.address, proof.signature, "bitcoin");
  assert.equal(await page.locator("#toggle-bip85-secret").innerText(), "Show secret");
  const recoveryMenu = page.locator("#bip85-recovery-source-menu");
  const menuBox = await recoveryMenu.boundingBox();
  const revealBox = await page.locator("#toggle-bip85-secret").boundingBox();
  assert.ok(menuBox && revealBox && menuBox.x + menuBox.width <= revealBox.x);
  await recoveryMenu.locator("summary").click();
  await recoveryMenu.locator('[data-recovery-target="sskr"]').click();
  const linkedHelp = page.locator("#sskr-panel .linked-source-help");
  await linkedHelp.locator("summary").hover();
  await page.waitForFunction(() =>
    document.querySelector("#sskr-panel .linked-source-help")?.hasAttribute("open"),
  );
  await page.locator('[data-recovery-tab][aria-controls="sskr-panel"]').hover();
  await page.waitForFunction(
    () => !document.querySelector("#sskr-panel .linked-source-help")?.hasAttribute("open"),
  );
  await page.locator("#derive-generate-mode").click();
  await page.locator("#protocol-tabs [data-adapter-id]").first().click();
  await page.locator("#clear-all").click();
  assert.equal(await page.locator("#bip85-child-passphrase").inputValue(), "");
  assert.equal(await page.locator("#bip85-output").inputValue(), "");
  assert.equal(await page.locator("#message-signature-output").inputValue(), "");
  assert.equal(await page.locator("#bip85-wallet-results").isVisible(), false);
  assert.deepEqual(await storageSnapshot(page), before);
  await page.reload();
  assert.equal(await page.locator("#mnemonic").inputValue(), "");
  assert.equal(await page.locator("#passphrase").inputValue(), "");
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "Auto-derived BIP85 exact child mnemonic; aligned recovery-source controls; dynamic linked-source hover help; independent BIP86 address with distinct child passphrase; child signature accepted, changed message rejected; Clear/reload/storage/no HTTP",
  );
}

async function workerReadiness(context, profile, run) {
  for (const action of ["clear", "cancel", "tab-switch"]) {
    const page = await open(context, profile, "key-derivation", run);
    let crashed = false;
    page.on("crash", () => {
      crashed = true;
    });
    await page.locator("#count").fill("20");
    await page.locator("#mnemonic").fill(mnemonic);
    await page.evaluate((requestedAction) => {
      document.querySelector("#derive-button").click();
      if (requestedAction === "clear") document.querySelector("#clear-all").click();
      else if (requestedAction === "cancel") document.querySelector("#cancel-derivation").click();
      else document.querySelectorAll("#protocol-tabs [data-adapter-id]")[1].click();
    }, action);
    await page.waitForTimeout(500);
    assert.equal(crashed, false, `Page crashed after early ${action}`);
    assert.equal(await page.locator("body").isVisible(), true);
    await page.close();
  }
  run.checks.push(
    "Worker boot readiness survives immediate Clear, Cancel, and protocol-tab switch",
  );
}

async function installMhfeDrawFixture(context) {
  // MHFE's workers take their randomness from the page's source only when this test sets one:
  // public profile-vector entropy (a counter in the last eight bytes, after two different probes,
  // as MHFE's source check asks), or a stuck source that MHFE must refuse. Every other part of the
  // draw, its check and its read-back is MHFE's own.
  await context.addInitScript(() => {
    const NativeBlob = window.Blob;
    const NativeWorker = window.Worker;
    const sources = new WeakMap();
    const urls = new Map();
    const createUrl = URL.createObjectURL.bind(URL);
    window.Blob = class extends NativeBlob {
      constructor(parts, options) {
        super(parts, options);
        if (parts?.every((part) => typeof part === "string")) sources.set(this, parts.join(""));
      }
    };
    URL.createObjectURL = (blob) => {
      const url = createUrl(blob);
      if (sources.has(blob)) urls.set(url, sources.get(blob));
      return url;
    };
    window.mhfeRandom = null;
    window.mhfeDrawDelay = 0;
    window.mhfeForbidEncrypt = false;
    window.mhfeEncryptStarted = false;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        let fixtureUrl;
        const random = window.mhfeRandom;
        if (options?.name === "mhfe" && random !== null && urls.has(url)) {
          const prefix =
            random === "stuck"
              ? `Object.defineProperty(crypto, "getRandomValues", { value: (bytes) => bytes.fill(0) });\n`
              : `{
            const fixture = new Uint8Array(32);
            new DataView(fixture.buffer).setBigUint64(24, BigInt(${random}), false);
            let calls = 0;
            Object.defineProperty(crypto, "getRandomValues", { value: (bytes) => {
              calls += 1;
              if (calls === 3) {
                const until = performance.now() + ${window.mhfeDrawDelay};
                while (performance.now() < until) {}
              }
              for (let i = 0; i < bytes.length; i += 1)
                bytes[i] = calls <= 2 ? 1 + ((i + calls) % 254) : fixture[i % 32];
              return bytes;
            }});
          }\n`;
          fixtureUrl = createUrl(
            new NativeBlob([prefix, urls.get(url)], { type: "text/javascript" }),
          );
        }
        super(fixtureUrl ?? url, options);
      }

      postMessage(message, ...arguments_) {
        // Refuse before Argon2 if a stale draw incorrectly reaches encryption in the edit test.
        if (window.mhfeForbidEncrypt && message?.operation === "encrypt") {
          window.mhfeEncryptStarted = true;
          throw new Error("The edit regression must not start encryption.");
        }
        return super.postMessage(message, ...arguments_);
      }
    };
  });
}

async function checkedMnemonic(context, profile, run) {
  await installMhfeDrawFixture(context);
  const page = await open(context, profile, "key-derivation", run);
  const before = await storageSnapshot(page);
  assert.equal(await page.locator("#wallet-check-enabled").isChecked(), false);
  // A new phrase is a new wallet: ordinary generation starts it without the old BIP39 passphrase
  // (owner's decision, 2026-10-08); the MHFE wallet check below keeps the one it was drawn for.
  const exactPassphrase = "  ＴＲＥＺＯＲ  ";
  await page.evaluate(() => {
    // Zero entropy is Trezor's public vector at each BIP39 length; no random secrets in evidence.
    Object.defineProperty(crypto, "getRandomValues", {
      value: (bytes) => {
        bytes.fill(0);
        return bytes;
      },
    });
  });
  for (const count of [12, 15, 18, 21, 24]) {
    await page.locator("#passphrase").fill(exactPassphrase);
    await page.locator(`#generate-${count}`).click();
    assert.equal(await page.locator("#passphrase").inputValue(), "");
    assert.equal((await page.locator("#mnemonic").inputValue()).split(" ").length, count);
  }
  // The addresses say right above the table whether they belong to the wallet with a passphrase.
  await page.waitForFunction(
    () => (document.querySelector("#address-list")?.children.length ?? 0) > 0,
  );
  assert.equal(await page.locator("#passphrase-in-use").isVisible(), false);
  await page.locator("#passphrase").fill(exactPassphrase);
  await page.locator("#passphrase-in-use").waitFor();
  await page.locator("#clear-all").click();
  assert.equal(await page.locator("#passphrase").inputValue(), "");
  // The page's zero source was for the vectors above; MHFE's workers keep their own source.
  await page.locator("#wallet-check-enabled").check();
  await page.locator("#wallet-check-passphrase-repeat").waitFor();
  for (const count of [12, 15, 18, 21])
    assert.equal(await page.locator(`#generate-${count}`).isDisabled(), true);
  // The check alone, as MHFE rates it: 16 of the 256 bits.
  await waitText(page, "#wallet-check-outlook", /keeps about 240 of its 256 random bits/u);
  // MHFE refuses the check without a passphrase, and a confirmation that differs.
  await page.locator("#generate-24").click();
  await waitText(page, "#error", /needs a BIP39 passphrase/u);
  assert.equal(await page.locator("#mnemonic").inputValue(), "");
  await page.locator("#passphrase").fill("TREZOR");
  await page.locator("#generate-24").click();
  await waitText(page, "#error", /repetition differ/u);
  await page.locator("#wallet-check-passphrase-repeat").fill("TREZOR");
  await page.locator("#chosen-words-enabled").check();
  await page.locator("#toggle-sensitive-values").click();
  await page.locator("#chosen-word-1-position").selectOption("1");
  await page.locator("#chosen-word-1").fill("abandon");
  await page.locator("#chosen-words-never").fill("zoo");
  await waitText(page, "#chosen-words-panel", /rule out almost every wrong password/u);
  // A fixed word costs 11 bits and the check 16; the excluded word a small fraction of a bit.
  await waitText(
    page,
    "#wallet-check-outlook",
    /^Not recommended: the phrase keeps about 228 of its 256/u,
  );
  assert.equal(await page.locator("#chosen-words-strength").isVisible(), false);
  const hasProfile = (phrase, passphrase) => {
    const seed = mnemonicToSeedSync(phrase, passphrase);
    try {
      return createHash("sha256")
        .update("MHFE-WALLET-CHECK-SEED-1", "ascii")
        .update(Buffer.from([0, 0, 1, 0]))
        .update(seed)
        .digest("hex")
        .startsWith("0000");
    } finally {
      seed.fill(0);
    }
  };
  const publicPhrase = (counter) => {
    const entropy = new Uint8Array(32);
    new DataView(entropy.buffer).setBigUint64(24, BigInt(counter), false);
    return entropyToMnemonic(entropy, wordlist);
  };
  // The profile vector that passes with "TREZOR": MHFE takes the first draw, which meets the wishes.
  await page.evaluate(() => {
    window.mhfeRandom = 76562;
  });
  await page.locator("#generate-24").click();
  await page.waitForFunction(
    (phrase) => document.querySelector("#mnemonic").value === phrase,
    publicPhrase(76562),
  );
  const drawn = await page.locator("#mnemonic").inputValue();
  assert.equal(hasProfile(drawn, "TREZOR"), true);
  assert.equal(await page.locator("#passphrase").inputValue(), "TREZOR");
  // The same wishes with the passphrase "trezor": the vector does not pass, so MHFE draws on
  // until Cancel, and the phrase shown before stays.
  await page.locator("#passphrase").fill("trezor");
  await page.locator("#wallet-check-passphrase-repeat").fill("trezor");
  await page.locator("#generate-24").click();
  await page.locator("#wallet-check-cancel").waitFor({ state: "visible" });
  await page.locator("#wallet-check-cancel").click();
  await page.locator("#wallet-check-cancel").waitFor({ state: "hidden" });
  await page.waitForTimeout(300);
  assert.ok(
    (await page.locator("#mnemonic").inputValue()) === drawn,
    "the cancelled draw is dropped",
  );
  await page.locator("#clear-all").click();
  assert.equal(await page.locator("#mnemonic").inputValue(), "");
  assert.equal(await page.locator("#wallet-check-enabled").isChecked(), false);
  // A stuck random source is refused by MHFE before any draw; nothing is shown.
  await page.evaluate(() => {
    window.mhfeRandom = "stuck";
  });
  await page.locator("#wallet-check-enabled").check();
  await page.locator("#passphrase").fill("TREZOR");
  await page.locator("#wallet-check-passphrase-repeat").fill("TREZOR");
  await page.locator("#generate-24").click();
  await waitText(page, "#error", /random/iu);
  assert.equal(await page.locator("#mnemonic").inputValue(), "");
  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "MHFE draws the checked phrase: passphrase required and confirmed, the published profile vector with chosen and excluded words, MHFE's rating shown, cancel and Clear drop the draw, a stuck random source refused; no storage or HTTP",
  );
}

/** A changed answer cancels New wallet's pending public-vector draw before publication. */
async function mhfeNewWalletRevision(context, profile, run) {
  await installMhfeDrawFixture(context);
  const delayMs = 4000;
  for (const edit of ["word-mode", "passphrase"]) {
    const { page, before } = await openBackupPanel(context, profile, run, "mhfe-panel");
    await page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-new-panel"]').click();
    await page.locator("#mhfe-new-words-chosen").check();
    await page.locator("#toggle-mhfe-new-chosen-words").click();
    await page.locator("#mhfe-new-chosen-word-1-position").selectOption("1");
    await page.locator("#mhfe-new-chosen-word-1").fill("abandon");
    await page.locator("#mhfe-new-passphrase").fill("TREZOR");
    await page.locator("#mhfe-new-passphrase-confirm").fill("TREZOR");
    await page.locator("#mhfe-new-check-wallet").check();
    await page.locator("#mhfe-new-password-kind-own").check();
    const password = "public audit probe password correct horse battery";
    await page.locator("#mhfe-new-password").fill(password);
    await page.locator("#mhfe-new-password-confirm").fill(password);
    await page.evaluate((delay) => {
      window.mhfeRandom = 76562;
      window.mhfeDrawDelay = delay;
      window.mhfeForbidEncrypt = true;
    }, delayMs);
    await page.locator("#mhfe-new").click();
    await page.locator("#mhfe-new-stop").waitFor({ state: "visible" });
    await waitText(page, "#mhfe-new-status", /draw/iu);
    if (edit === "word-mode") await page.locator("#mhfe-new-words-random").check();
    else await page.locator("#mhfe-new-passphrase").fill("trezor");
    await page.locator("#mhfe-new-stop").waitFor({ state: "hidden" });
    // Observe past the fixture's return time: a late result must also remain unpublished.
    await page.waitForTimeout(delayMs + 500);
    assert.equal(await page.locator("#mhfe-new-phrase > *").count(), 0);
    assert.equal(await page.locator("#mhfe-new-result > *").count(), 0);
    assert.equal(await page.evaluate(() => window.mhfeEncryptStarted), false);
    assert.deepEqual(await storageSnapshot(page), before);
    assert.equal(run.requests.length, 0);
    await page.close();
  }
  run.checks.push(
    "New wallet drops pending and late draws after input or word-mode edits, never publishes the old phrase or starts encryption; no storage or HTTP",
  );
}

/**
 * The chosen word of MHFE's New wallet tab: offered once MHFE's quick checks pass, with MHFE's own
 * limit, warning and rating, and MHFE's refusal of a word it does not know. Nothing is drawn.
 */
async function mhfeChosenWord(context, profile, run) {
  const { page, before } = await openBackupPanel(context, profile, run, "mhfe-panel");
  await page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-new-panel"]').click();
  assert.equal(await page.locator("#mhfe-new-wishes").isVisible(), false);
  await page.locator("#mhfe-new-words-chosen").check();
  await waitText(page, "#mhfe-new-words-chosen-text", /^Choose one word$/u);
  await page.locator("#toggle-mhfe-new-chosen-words").click();
  await page.locator("#mhfe-new-chosen-word-1-position").selectOption("last");
  await page.locator("#mhfe-new-chosen-word-1").fill("zoo");
  await waitText(page, "#mhfe-new-wishes", /rule out almost every wrong password/u);
  await waitText(
    page,
    "#mhfe-new-outlook",
    /^The phrase keeps about 245 of its 256 random bits: still far more than enough\.$/u,
  );
  await page.locator("#mhfe-new-passphrase").fill("TREZOR");
  await page.locator("#mhfe-new-check-wallet").check();
  await waitText(
    page,
    "#mhfe-new-outlook",
    /^Not recommended: the phrase keeps about 229 of its 256/u,
  );
  await page.locator("#mhfe-new-chosen-word-1").fill("qqqq");
  await waitText(page, "#mhfe-new-outlook", /cannot be used/u);
  assert.equal(await page.locator("#mhfe-new-chosen-word-2").count(), 0);
  assert.equal(
    await page.locator("#mhfe-new-chosen-words-never").getAttribute("placeholder"),
    "for example: zoo",
  );
  // MHFE's word hints: none for a concealed field, words from two letters, Tab completes.
  const hint = "#mhfe-new-wishes .word-hint";
  await page.locator("#mhfe-new-chosen-word-1").fill("q");
  await waitText(page, hint, /^8 BIP39 words begin with this letter$/u);
  await page.locator("#mhfe-new-chosen-word-1").fill("qx");
  await waitText(page, hint, /^No BIP39 word begins like this\.$/u);
  await page.locator("#mhfe-new-chosen-word-1").fill("abando");
  await waitText(page, hint, /^abandon$/u);
  await page.locator("#mhfe-new-chosen-word-1").press("Tab");
  assert.equal(await page.locator("#mhfe-new-chosen-word-1").inputValue(), "abandon ");
  await page.locator("#toggle-mhfe-new-chosen-words").click();
  await page.locator("#mhfe-new-chosen-word-1").fill("ab");
  await page.waitForTimeout(400);
  assert.equal(await page.locator(hint).first().isVisible(), false);
  // A password shown as typed gets hints from the EFF list, and none when it is no word.
  await page.locator("#toggle-mhfe-new-password").click();
  await page.locator("#mhfe-new-password").fill("abacu");
  await waitText(page, "#mhfe-new-password + .word-hint", /^abacus$/u);
  await page.locator("#mhfe-new-password").fill("xq");
  await page.waitForTimeout(400);
  assert.equal(await page.locator("#mhfe-new-password + .word-hint").isVisible(), false);
  await page.locator("#mhfe-new-password").fill("");
  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "MHFE New wallet: one chosen word and one never-use word, MHFE's warning and rating with and without the check, an unknown word refused by MHFE, MHFE's word hints with Tab completion, none while concealed; no storage or HTTP",
  );
}

async function coinJoin(context, profile, run) {
  const page = await open(context, profile, "key-derivation", run);
  if (profile.id === "multi-chain") await page.locator("#coin").selectOption("dash");
  await page.locator("#count").fill("1");
  await page.locator("#mnemonic").fill(mnemonic);
  await page.locator("#include-coinjoin-addresses").check();
  await page.locator("#coinjoin-tab").click();
  await page.locator("#results").waitFor({ state: "visible" });
  await page.locator("#address-list [data-sign-message]").first().waitFor();
  assert.match(await page.locator("#address-list").innerText(), /9'/);
  const external = await values(page, "address");
  await page.locator("#result-coinjoin-internal-tab").click();
  const internal = await values(page, "address");
  assert.notDeepEqual(internal, external);
  assert.equal(await page.locator("#results").isVisible(), true);
  await page.locator("#protocol-tabs [data-adapter-id]").first().click();
  await page.locator("#results").waitFor({ state: "visible" });
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "CoinJoin tab auto-derives visible external/internal results; distinct branch addresses; standard tab restores visible results",
  );
}

async function bip38(context, profile, run) {
  const chain = profile.id === "multi-chain" ? "bitcoin" : "dash";
  const page = await open(context, profile, "key-derivation", run);
  const before = await storageSnapshot(page);
  if (chain === "bitcoin")
    await page.locator("#protocol-tabs button").filter({ hasText: "BIP44" }).click();
  await page.locator("#count").fill("2");
  await page.locator("#mnemonic").fill(mnemonic);
  await page.locator("#derive-button").click();
  await page.locator("#results").waitFor({ state: "visible" });
  const addresses = await values(page, "address");
  assert.equal(addresses.length, 2);
  const proof = await sign(page, "#address-list [data-sign-message]");
  await page.locator("#enable-bulk-bip38").check();
  await page.locator("#bulk-bip38-passphrase").fill(encryptionPassphrase);
  await page.locator("#bulk-bip38-passphrase").press("Enter");
  await waitText(page, "#bulk-bip38-status", /Encrypted 2 generated private keys/);
  const encrypted = await values(page, "bip38EncryptedKey");
  assert.equal(new Set(encrypted).size, 2);
  assert.ok(encrypted.every((value) => /^6P/.test(value)));
  assert.equal(
    await page.locator('[data-copy-field="bip38EncryptedKey"]').first().isDisabled(),
    true,
  );
  await page.locator("#toggle-result-secrets").click();
  assert.equal(
    await page.locator('[data-copy-field="bip38EncryptedKey"]').first().isEnabled(),
    true,
  );
  const verifier = await open(context, profile, "psbt-inspector", run);
  const verifierBefore = await storageSnapshot(verifier);
  await verifySignature(verifier, proof.address, proof.signature, chain);
  await verifier.locator('[data-mode="bip38"]').click();
  await verifier.locator("#bip38-chain").selectOption(chain);
  await verifier.locator("#bip38-encrypted-key").fill(encrypted.join("\n"));
  await verifier.locator("#bip38-password").fill(encryptionPassphrase);
  await verifier.locator("#decrypt-bip38").click();
  await waitText(verifier, "#bip38-progress", /Finished 2 keys · 2 recovered/);
  const recovered = await verifier.locator(".bip38-result-card").allTextContents();
  assert.ok(addresses.every((address) => recovered.some((text) => text.includes(address))));
  assert.equal(await verifier.locator("#bip38-password").inputValue(), "");
  assert.equal(await verifier.locator("[data-bip38-secret]").count(), 4);
  assert.ok(
    (
      await verifier
        .locator("[data-bip38-secret]")
        .evaluateAll((inputs) => inputs.map((input) => input.type))
    ).every((type) => type === "password"),
  );
  await verifier.locator("#toggle-bip38-result").click();
  assert.ok(
    (
      await verifier
        .locator("[data-bip38-secret]")
        .evaluateAll((inputs) => inputs.map((input) => input.type))
    ).every((type) => type === "text"),
  );
  await verifier.locator("#clear-bip38").click();
  assert.equal(await verifier.locator("[data-bip38-secret]").count(), 0);
  await verifier.locator("#bip38-encrypted-key").fill(encrypted.join("\n"));
  await verifier.locator("#bip38-password").fill("intentionally-wrong-password");
  await verifier.locator("#decrypt-bip38").click();
  await waitText(verifier, "#bip38-progress", /Finished 2 keys · 0 recovered · 2 failed/);
  assert.equal(await verifier.locator("[data-bip38-secret]").count(), 0);
  await verifier.locator("#clear-bip38").click();
  await page.locator("#clear-all").click();
  assert.equal(await page.locator("#bulk-bip38-passphrase").inputValue(), "");
  assert.deepEqual(await storageSnapshot(page), before);
  assert.deepEqual(await storageSnapshot(verifier), verifierBefore);
  await page.reload();
  await verifier.reload();
  assert.equal(await page.locator("#mnemonic").inputValue(), "");
  assert.equal(await verifier.locator("#bip38-encrypted-key").inputValue(), "");
  assert.equal(run.requests.length, 0);
  run.checks.push(
    `${chain}: compact message valid/tampered verification; two-key BIP38 round trip and wrong-password batch; reveal gates; clear/reload/storage/no HTTP`,
  );
}

for (const browserName of (process.env.BROWSER_ENGINES ?? "chromium,firefox").split(",")) {
  const browser = await launchForReport(
    { chromium, firefox },
    browserName,
    process.env[`${browserName.toUpperCase()}_EXECUTABLE_PATH`],
    report,
    save,
  );
  if (browser === undefined) continue;
  try {
    for (const profile of Object.values(BUILD_PROFILES)) {
      if (process.env.BROWSER_PROFILE && process.env.BROWSER_PROFILE !== profile.id) continue;
      const cases = profileToolIds(profile).map((tool) => [
        `${tool}-boundaries`,
        (context, run) => boundaries(context, profile, tool, run),
      ]);
      cases.push([
        "descriptor-followup",
        (context, run) => descriptorFollowup(context, profile, run),
      ]);
      cases.push(["verifier-revision", (context, run) => verifierRevision(context, profile, run)]);
      cases.push(["worker-readiness", (context, run) => workerReadiness(context, profile, run)]);
      cases.push(["checked-mnemonic", (context, run) => checkedMnemonic(context, profile, run)]);
      cases.push(["mhfe-chosen-word", (context, run) => mhfeChosenWord(context, profile, run)]);
      cases.push([
        "mhfe-new-wallet-revision",
        (context, run) => mhfeNewWalletRevision(context, profile, run),
      ]);
      cases.push(["self-tests", (context, run) => selfTests(context, profile, run)]);
      cases.push(["self-test-failure", (context, run) => selfTestFailure(context, profile, run)]);
      cases.push(["coinjoin", (context, run) => coinJoin(context, profile, run)]);
      cases.push(["bip38-message", (context, run) => bip38(context, profile, run)]);
      cases.push([
        "recovery-backup-roundtrips",
        (context, run) => recoveryBackupRoundTrips(context, profile, run),
      ]);
      cases.push([
        "mnemocode-roundtrip",
        (context, run) => mnemocodeRoundTrip(context, profile, run),
      ]);
      cases.push(["mnemocode-shares", (context, run) => mnemocodeShares(context, profile, run)]);
      cases.push(["mnemocode-cards", (context, run) => mnemocodeCards(context, profile, run)]);
      cases.push([
        "mnemocode-late-cards",
        (context, run) => mnemocodeLateCards(context, profile, run),
      ]);
      cases.push([
        "mnemocode-share-list",
        (context, run) => mnemocodeShareList(context, profile, run),
      ]);
      cases.push([
        "mnemocode-coin-evidence",
        (context, run) => mnemocodeCoinEvidence(context, profile, run),
      ]);
      cases.push(["mhfe-missing-words", (context, run) => mhfeMissingWords(context, profile, run)]);
      cases.push(["mhfe-custom-path", (context, run) => mhfeCustomPath(context, profile, run)]);
      cases.push(["mhfe-made-password", (context, run) => mhfeMadePassword(context, profile, run)]);
      if (profile.id === "multi-chain")
        cases.push(["bip85-child-signer", (context, run) => childWallet(context, profile, run)]);
      for (const [name, test] of cases) {
        if (process.env.BROWSER_CASES && !process.env.BROWSER_CASES.split(",").includes(name))
          continue;
        const run = {
          browser: browserName,
          version: browser.version(),
          profile: profile.id,
          name,
          passed: false,
          artifacts: {},
          checks: [],
          requests: [],
          pageErrors: [],
          console: [],
        };
        report.runs.push(run);
        const context = await browser.newContext();
        await context.route(/^https?:\/\//, async (route) => {
          run.requests.push({ url: route.request().url(), body: route.request().postData() });
          if (route.request().url() === "https://browser-regression.invalid/probe") {
            await route.fulfill({ json: {}, headers: { "access-control-allow-origin": "*" } });
          } else await route.abort();
        });
        try {
          await test(context, run);
          assert.deepEqual(run.pageErrors, []);
          assert.deepEqual(await context.cookies(), []);
          run.passed = true;
        } catch (error) {
          run.error = String(error.stack ?? error);
          for (const [index, page] of context.pages().entries()) {
            await page
              .screenshot({
                path: resolve(output, `${browserName}-${profile.id}-${name}-${index}.png`),
                fullPage: true,
              })
              .catch(() => {});
          }
        } finally {
          await context.close();
          save();
        }
        console.log(
          `${run.passed ? "PASS" : "FAIL"} ${browserName} ${profile.id} ${name}${run.error ? `: ${run.error.split("\n")[0]}` : ""}`,
        );
      }
    }
  } finally {
    await browser.close();
  }
}
save();
console.log(`Regression report: ${output}`);
if (report.runs.length === 0 || report.runs.some((run) => !run.passed)) process.exitCode = 1;

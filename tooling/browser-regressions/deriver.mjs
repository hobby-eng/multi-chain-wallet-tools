import assert from "node:assert/strict";
import { BrowserHarness } from "./host.mjs";
const { open, storageSnapshot, values, waitText } = BrowserHarness;
import { BrowserFixtures } from "./fixtures.mjs";
const {
  mnemonic,
  parentPassphrase,
  childMnemonic,
  childPassphrase,
  childAddress,
  encryptionPassphrase,
} = BrowserFixtures;
import { BrowserSigningCases } from "./signing.mjs";
const { sign, verifySignature } = BrowserSigningCases;

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
  // Concealed keys are not in the page's text until Show, and cannot be copied.
  const concealed = await values(page, "bip38EncryptedKey");
  assert.equal(concealed.length, 2);
  assert.ok(concealed.every((value) => !(value ?? "").startsWith("6P")));
  assert.equal(
    await page.locator('[data-copy-field="bip38EncryptedKey"]').first().isDisabled(),
    true,
  );
  await page.locator("#toggle-result-secrets").click();
  assert.equal(
    await page.locator('[data-copy-field="bip38EncryptedKey"]').first().isEnabled(),
    true,
  );
  const encrypted = await values(page, "bip38EncryptedKey");
  assert.equal(new Set(encrypted).size, 2);
  assert.ok(encrypted.every((value) => typeof value === "string" && value.startsWith("6P")));
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

/** Cohesive deriver cases; helpers stay private to this module. */
export class DeriverBrowserCases {
  /** Shared workerReadiness boundary for the native browser cases. */
  static workerReadiness = workerReadiness;
  /** Shared coinJoin boundary for the native browser cases. */
  static coinJoin = coinJoin;
  /** Shared bip38 boundary for the native browser cases. */
  static bip38 = bip38;
  /** Shared childWallet boundary for the native browser cases. */
  static childWallet = childWallet;
}

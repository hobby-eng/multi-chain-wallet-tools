import assert from "node:assert/strict";
import { Slip39LifecycleCase } from "../browser-cases/slip39-lifecycle.mjs";
import { BrowserHarness } from "./host.mjs";
const { open, storageSnapshot, waitPanelReady, waitText } = BrowserHarness;
import { BrowserFixtures } from "./fixtures.mjs";
const { mnemonic } = BrowserFixtures;

async function recoveryBackupRoundTrips(context, profile, run) {
  const page = await open(context, profile, "key-derivation", run);
  const before = await storageSnapshot(page);
  await recoveryHelp(page);
  await mhfeWorkerCycle(page);

  let checkedQrPopoverInteractions = false;
  for (const method of BACKUP_METHODS) {
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
    // Concealed records show neither a QR code nor an enabled copy action until they are revealed.
    if (!checkedQrPopoverInteractions) {
      await qrActions.first().locator(".qr-trigger").hover();
      assert.equal(await qrActions.first().locator(".payment-qr-popover").isVisible(), false);
      await page.mouse.move(1, 1);
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
  await Slip39LifecycleCase.run(page);
  run.checks.push(
    "Recovery help popovers; MHFE Worker initialization/PIM/Stop; SeedQR, MnemoCode, SLIP-39 (native worker Cancel/edit/Clear), and Codex32 exact browser round trips; QR actions; reveal-gated copy; in-memory return to Derive; storage/no HTTP",
  );
}

/** Cohesive backups cases; helpers stay private to this module. */
export class BackupBrowserCases {
  /** Shared recoveryBackupRoundTrips boundary for the native browser cases. */
  static recoveryBackupRoundTrips = recoveryBackupRoundTrips;
}

async function clickStep(locator, label) {
  try {
    await locator.click();
  } catch (error) {
    throw new BrowserActionError(label, error);
  }
}

class BrowserActionError extends Error {
  code = "browser.action";
  constructor(label, cause) {
    super(`${label}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = "BrowserActionError";
  }
}
async function recoveryHelp(page) {
  await clickStep(page.locator("#recovery-backup-mode"), "Open Recover & Back Up");
  // One help per recovery panel plus the option helps. MHFE adds the container length, the repair
  // words of Encode, Change password and Repair, the wallet check, the password kinds, the
  // custom PIM of each of its six forms and the memory level of each of its six (Change password
  // has one for the old and one for the new container). MnemoCode adds the option helps of Encode,
  // Re-encode and Decode, the split, the restore, the forgotten words, the share repair, and each
  // wallet question, including the share repair's own question and Decode's for codes marked ?.
  // Codex32 adds the unsplit secret. The Multisig wallet has its panel's help only.
  // Generate & Derive has option helps of its own (the wallet check); count only this workspace's.
  const recoveryHelp = "#recovery-workspace .recovery-help";
  assert.equal(await page.locator(recoveryHelp).count(), 42);
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
}
async function mhfeWorkerCycle(page) {
  await clickStep(page.locator('[data-recovery-tab][aria-controls="mhfe-panel"]'), "Open MHFE");
  await waitPanelReady(page, "mhfe-panel");
  // Each mhfe operation has a tab; new phrases are drawn in Generate & Derive.
  assert.equal(await page.locator("#mhfe-panel [data-operation-tab]").count(), 8);
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
}

const BACKUP_METHODS = [
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

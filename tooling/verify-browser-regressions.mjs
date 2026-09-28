// Synthetic, direct-file integration tests. Never point this at a live browser profile.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { p2tr } from '@scure/btc-signer';
import { loadPlaywright } from './playwright-loader.mjs';
import { BUILD_PROFILES, getToolBuild, profileToolIds } from './build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { chromium, firefox } = await loadPlaywright();
const output =
  process.env.BROWSER_OUTPUT_DIR ??
  resolve(root, 'test-results/browser-regressions', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(output, { recursive: true });
// Trezor's official BIP39 English zero-entropy vector. Everything below is public test data.
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const parentPassphrase = 'TREZOR';
const childPassphrase = 'browser-child-only';
const encryptionPassphrase = 'browser-bip38-only';
const message = 'Standalone browser regression: public synthetic wallet only';
const parent = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic, parentPassphrase));
const childEntropy = hmac(
  sha512,
  new TextEncoder().encode('bip-entropy-from-k'),
  parent.derive("m/83696968'/39'/0'/12'/0'").privateKey,
).slice(0, 16);
const childMnemonic = entropyToMnemonic(childEntropy, wordlist);
const childKey = HDKey.fromMasterSeed(mnemonicToSeedSync(childMnemonic, childPassphrase)).derive("m/86'/0'/0'/0/0");
const childAddress = p2tr(childKey.publicKey.slice(1)).address;
const report = {
  startedAt: new Date().toISOString(),
  scope:
    'Fresh isolated file:// contexts; public synthetic fixtures; no live providers, broadcasts, or real wallet data.',
  runs: [],
};
const save = () =>
  writeFileSync(resolve(output, process.env.BROWSER_REPORT_NAME ?? 'report.json'), JSON.stringify(report, null, 2));
const artifact = (profile, tool) => resolve(root, 'dist', getToolBuild(profile, tool).artifactRelativePath);
const waitText = (page, selector, pattern) =>
  page.waitForFunction(
    ({ selector, source }) => new RegExp(source).test(document.querySelector(selector)?.textContent ?? ''),
    { selector, source: pattern.source },
    { timeout: 120000 },
  );
const values = (page, field) =>
  page
    .locator(`#address-list [data-copy-field="${field}"]`)
    .evaluateAll((buttons) =>
      buttons.map(
        (button) =>
          button.parentElement.querySelector('.value')?.textContent ??
          button.closest('.row')?.querySelector('.value')?.textContent,
      ),
    );

async function storageSnapshot(scope, run) {
  const snapshot = await scope.locator('body').evaluate(async () => {
    const result = {};
    for (const name of ['localStorage', 'sessionStorage']) {
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
  if (run) run.probingOpaqueIndexedDB = snapshot.localStorage === 'SecurityError';
  snapshot.indexedDB = await scope.locator('body').evaluate(async () => {
    try {
      return (await indexedDB.databases()).map(({ name, version }) => ({ name, version }));
    } catch (error) {
      return error.name;
    }
  });
  await scope.locator('body').evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  if (run) run.probingOpaqueIndexedDB = false;
  return snapshot;
}

async function open(context, profile, tool, run) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => {
    const expectedProbeError = run.probingOpaqueIndexedDB && String(error) === 'undefined';
    (expectedProbeError ? (run.indexedDBProbeErrors ??= []) : run.pageErrors).push(String(error));
  });
  page.on('console', (entry) => run.console.push({ type: entry.type(), text: entry.text() }));
  const path = artifact(profile, tool);
  run.artifacts[path] = createHash('sha256').update(readFileSync(path)).digest('hex');
  await page.goto(pathToFileURL(path).href);
  if (tool === 'key-derivation') await page.locator('#crypto-self-test-status.passed').waitFor();
  if (tool === 'activity-viewer') await page.locator('#viewer-crypto-self-test-status.passed').waitFor();
  if (tool === 'discovery-scanner')
    await page.frameLocator('#recovery-secret-vault').locator('#recovery-self-test.passed').waitFor();
  return page;
}

async function verifySignature(page, address, signature, chain) {
  await page.locator('[data-mode="verify"]').click();
  await page.locator('#verify-chain').selectOption(chain);
  await page.locator('#verify-address').fill(address);
  await page.locator('#verify-message').fill(message);
  await page.locator('#verify-signature').fill(signature);
  await page.locator('#verify-message-button').click();
  await waitText(page, '#verify-validity', /^VALID/);
  await page.locator('#verify-message').fill(`${message} tampered`);
  await page.locator('#verify-message-button').click();
  await page.waitForFunction(
    () =>
      !document.querySelector('#verify-error').hidden ||
      (!document.querySelector('#verify-results').hidden &&
        document.querySelector('#verify-validity').textContent.startsWith('INVALID')),
  );
  assert.equal(
    (await page.locator('#verify-results').isVisible()) &&
      (await page.locator('#verify-validity').innerText()).startsWith('VALID'),
    false,
  );
}

async function sign(page, selector) {
  await page.locator(selector).first().click();
  await page.locator('#message-signer-dialog').waitFor({ state: 'visible' });
  const address = await page.locator('#message-signer-address').innerText();
  await page.locator('#message-signer-message').fill(message);
  await page.locator('#sign-message-button').click();
  await page.locator('#message-signature-result').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#message-signer-error').isVisible(), false);
  const signature = await page.locator('#message-signature-output').inputValue();
  assert.ok(signature.length > 40);
  await page.locator('#close-message-signer').click();
  return { address, signature };
}

async function descriptorFollowup(context, profile, run) {
  const page = await open(context, profile, 'psbt-inspector', run);
  await page.locator('[data-mode="script"]').click();
  const g = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
  const u =
    '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
  const valid =
    profile.id === 'multi-chain'
      ? `tr(musig(${parent.publicExtendedKey},${parent.deriveChild(1).publicExtendedKey})/<0;1>/*)`
      : `sh(pkh(${u}))`;
  await page.locator('#script-input').fill(valid);
  await page.locator('#decode-script').click();
  await page.locator('#script-results').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#script-error').isVisible(), false);
  assert.match(await page.locator('#script-results').innerText(), /Compiled descriptor data/);
  const invalid = profile.id === 'multi-chain' ? `tr(${g},pk(musig([bad]${g},${g})))` : 'combo(00)';
  await page.locator('#script-input').fill(invalid);
  await page.locator('#decode-script').click();
  await page.locator('#script-error').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#script-results').isVisible(), false);
  run.checks.push('Valid descriptor compiles; malformed replacement hides all previous compiled results');
}

async function verifierRevision(context, profile, run) {
  const page = await open(context, profile, 'psbt-inspector', run);
  await page.locator('[data-mode="verify"]').click();
  await page.locator('#verify-chain').selectOption('dash');
  await page.locator('#verify-address').fill('XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE');
  await page.locator('#verify-message').fill('Dash verifier fixture');
  await page
    .locator('#verify-signature')
    .fill('IIeeVV8PxEmSnk2FqMTPAHtJdezmn2tXQhHq8q8fhFu6IXrYcwT6yi7hS42BcpoinL8nRwFFJPqPLXF3prJLWmc=');
  await page.locator('#verify-message-button').click();
  await waitText(page, '#verify-validity', /^VALID/);
  await page.evaluate(() => {
    document.querySelector('#verify-message-button').click();
    const field = document.querySelector('#verify-message');
    field.value = 'Changed claim';
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#verify-results').isVisible(), false);
  await page.evaluate(() => {
    document.querySelector('#verify-message-button').click();
    document.querySelector('#clear-verifier').click();
  });
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#verify-results').isVisible(), false);
  assert.equal(await page.locator('#verify-error').isVisible(), false);
  if (profile.id === 'multi-chain') {
    await page.locator('[data-mode="builder"]').click();
    await page.locator('#policy-mode').selectOption('custom-miniscript');
    await page.locator('#custom-miniscript-context').selectOption('tapscript');
    for (const key of ['0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'ff'.repeat(32)]) {
      await page.locator('#custom-miniscript').fill(`multi_a(1,${key})`);
      await page.locator('#build-policy').click();
      assert.equal(await page.locator('#policy-results').isVisible(), false);
      assert.equal(await page.locator('#builder-error').isVisible(), true);
    }
  }
  run.checks.push(
    'Verification results invalidated on edit/Clear; unsafe custom Tapscript keys rejected before showing an output',
  );
}

async function boundaries(context, profile, tool, run) {
  const page = await open(context, profile, tool, run);
  const scopes = [page];
  if (tool === 'discovery-scanner') {
    assert.equal(await page.locator('#recovery-secret-vault').getAttribute('sandbox'), 'allow-scripts');
    scopes.push(page.frameLocator('#recovery-secret-vault'));
  }
  for (const [index, scope] of scopes.entries()) {
    const networked = index === 0 && ['discovery-scanner', 'activity-viewer'].includes(tool);
    const csp = await scope.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    assert.match(csp, networked ? /connect-src https:/ : /connect-src 'none'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    const before = await storageSnapshot(scope, run);
    const result = await scope.locator('body').evaluate(async () => {
      const violations = [];
      document.addEventListener('securitypolicyviolation', (event) => violations.push(event.effectiveDirective));
      const script = document.createElement('script');
      script.textContent = 'window.__browserRegressionInlineExecuted = true';
      document.head.append(script);
      script.remove();
      let fetchAllowed = false;
      try {
        await fetch('https://browser-regression.invalid/probe');
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
    assert.equal(result.inlineExecuted, false, 'Unhashed injected script executed');
    assert.equal(result.fetchAllowed, networked, 'Unexpected CSP network boundary');
    assert.ok(result.violations.some((value) => value.startsWith('script-src')));
    if (!networked) assert.ok(result.violations.includes('connect-src'));
    if (index === 1) assert.equal(result.parentBlocked, true);
    assert.deepEqual(await storageSnapshot(scope, run), before);
    run.checks.push({ scope: index === 0 ? 'top-level' : 'opaque-vault', csp, storage: before, probes: result });
  }
  await page.reload();
  assert.deepEqual(await context.cookies(), []);
  assert.equal(run.requests.filter((request) => !request.url.endsWith('/probe')).length, 0);
}

async function recoveryBackupRoundTrips(context, profile, run) {
  const page = await open(context, profile, 'key-derivation', run);
  const clickStep = async (locator, label) => {
    try {
      await locator.click();
    } catch (error) {
      throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  };
  const before = await storageSnapshot(page);
  await clickStep(page.locator('#recovery-backup-mode'), 'Open Recover & Back Up');
  assert.equal(await page.locator('.recovery-help').count(), 14);
  const firstHelp = page.locator('.recovery-help').first();
  await firstHelp.locator('summary').hover();
  await page.waitForFunction(() => document.querySelector('.recovery-help')?.hasAttribute('open'));
  await page.locator('#recovery-workspace > .section-head').hover();
  await page.waitForFunction(() => !document.querySelector('.recovery-help')?.hasAttribute('open'));
  await firstHelp.locator('summary').evaluate((summary) => summary.click());
  assert.doesNotMatch(await firstHelp.locator('.recovery-help-popover').innerText(), /Example:/);
  await page.mouse.click(1, 1);
  assert.equal(await firstHelp.getAttribute('open'), null);

  await clickStep(page.locator('[data-recovery-tab][aria-controls="mhfe-panel"]'), 'Open MHFE');
  await page.locator('#mhfe-source').fill(mnemonic);
  await page.locator('#mhfe-encrypt-password').fill('public browser test password');
  await page.locator('#mhfe-encrypt-password-confirm').fill('public browser test password');
  await page.locator('#mhfe-encrypt-use-pim').check();
  assert.equal(await page.locator('#mhfe-encrypt-pim-field').isVisible(), true);
  await page.locator('#mhfe-encrypt-use-pim').uncheck();
  assert.equal(await page.locator('#mhfe-encrypt-preserve-final-word').count(), 1);
  await clickStep(
    page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-restore-panel"]'),
    'Open MHFE recovery',
  );
  await page.locator('#mhfe-decrypt-preserve-final-word').check();
  assert.equal(await page.locator('#mhfe-decrypt-source-words').inputValue(), '24');
  assert.equal(await page.locator('#mhfe-decrypt-source-words').isDisabled(), true);
  await page.locator('#mhfe-decrypt-preserve-final-word').uncheck();
  assert.equal(await page.locator('#mhfe-decrypt-source-words').inputValue(), 'auto');
  assert.equal(await page.locator('#mhfe-decrypt-source-words').isDisabled(), false);
  await clickStep(
    page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-create-panel"]'),
    'Open MHFE encryption',
  );
  await clickStep(page.locator('#mhfe-encrypt'), 'Start MHFE worker');
  await waitText(page, '#mhfe-encrypt-status', /Running 12 memory-hard/u);
  assert.equal(await page.locator('#mhfe-encrypt-password').inputValue(), '');
  await clickStep(page.locator('#mhfe-encrypt-stop'), 'Stop MHFE worker');
  await waitText(page, '#mhfe-encrypt-status', /worker and Argon2 memory were discarded/u);

  const methods = [
    {
      panel: 'seedqr-panel',
      source: '#seedqr-source',
      create: '#create-seedqr',
      createResult: '#seedqr-create-result',
      revealCreated: '#toggle-seedqr-created',
      restorePanel: 'seedqr-restore-panel',
      shares: '#seedqr-payload',
      restore: '#restore-seedqr',
      restoreResult: '#seedqr-restore-result',
      needed: 1,
    },
    {
      panel: 'mnemocode-panel',
      source: '#mnemocode-source',
      create: '#encode-mnemocode',
      createResult: '#mnemocode-encode-result',
      revealCreated: '#toggle-mnemocode-created',
      createPanel: 'mnemocode-create-panel',
      restorePanel: 'mnemocode-decode-panel',
      shares: '#mnemocode-input',
      restore: '#decode-mnemocode',
      restoreResult: '#mnemocode-decode-result',
      needed: 1,
    },
    {
      panel: 'slip39-panel',
      source: '#slip39-source-mnemonic',
      create: '#create-slip39-shares',
      createResult: '#slip39-create-result',
      revealCreated: '#toggle-slip39-created',
      restorePanel: 'slip39-restore-panel',
      shares: '#slip39-shares',
      restore: '#restore-slip39-shares',
      restoreResult: '#slip39-restore-result',
      needed: 2,
    },
    {
      panel: 'codex32-panel',
      source: '#codex32-source',
      create: '#create-codex32',
      createResult: '#codex32-create-result',
      revealCreated: '#toggle-codex32-created',
      restorePanel: 'codex32-restore-panel',
      shares: '#codex32-shares',
      restore: '#restore-codex32',
      restoreResult: '#codex32-restore-result',
      needed: 2,
    },
  ];

  let checkedQrPopoverInteractions = false;
  for (const method of methods) {
    await clickStep(page.locator(`[data-recovery-tab][aria-controls="${method.panel}"]`), `Open ${method.panel}`);
    const createPanel = method.createPanel ?? method.restorePanel.replace('-restore-panel', '-create-panel');
    await clickStep(page.locator(`[aria-controls="${createPanel}"][data-operation-tab]`), `Open ${createPanel}`);
    await page.locator(method.source).fill(mnemonic);
    await clickStep(page.locator(method.create), `Create records in ${method.panel}`);
    const created = page.locator(`${method.createResult} .share-secret`);
    await created.nth(method.needed - 1).waitFor();
    const qrActions = page.locator(`${method.createResult} .share-qr-action`);
    assert.ok((await qrActions.count()) >= method.needed);
    if (!checkedQrPopoverInteractions) {
      const qrAction = qrActions.first();
      const qrTrigger = qrAction.locator('.qr-trigger');
      const qrPopover = qrAction.locator('.payment-qr-popover');
      await qrTrigger.hover();
      await qrPopover.waitFor({ state: 'visible' });
      await page.mouse.move(1, 1);
      await qrPopover.waitFor({ state: 'hidden' });
      await clickStep(qrTrigger, 'Pin QR popover');
      await qrPopover.waitFor({ state: 'visible' });
      assert.equal(await qrTrigger.getAttribute('aria-expanded'), 'true');
      await clickStep(qrPopover.locator('.payment-qr-close'), 'Close QR popover');
      await qrPopover.waitFor({ state: 'hidden' });
      assert.equal(await qrTrigger.getAttribute('aria-expanded'), 'false');
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
        assert.ok(bounds.x >= 0 && bounds.y >= 0, 'QR popover must not extend beyond the top or left edge');
        assert.ok(bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
        await clickStep(qrPopover.locator('.payment-qr-close'), `Close QR at ${viewport.width}px`);
        await qrPopover.waitFor({ state: 'hidden' });
      }
      await page.setViewportSize(originalViewport);
      await clickStep(qrTrigger, 'Reopen QR popover');
      await qrPopover.waitFor({ state: 'visible' });
      await clickStep(qrTrigger, 'Toggle QR popover closed');
      await qrPopover.waitFor({ state: 'hidden' });
      checkedQrPopoverInteractions = true;
    }
    const copyActions = page.locator(`${method.createResult} .secret-copy-action`);
    if ((await copyActions.count()) > 0) {
      assert.ok((await copyActions.evaluateAll((buttons) => buttons.map((button) => button.disabled))).every(Boolean));
    }
    const payloads = await created.allTextContents();
    await clickStep(page.locator(method.revealCreated), `Reveal records in ${method.panel}`);
    if ((await copyActions.count()) > 0) {
      assert.ok(
        (await copyActions.evaluateAll((buttons) => buttons.map((button) => button.disabled))).every(
          (disabled) => !disabled,
        ),
      );
    }
    await clickStep(
      page.locator(`[aria-controls="${method.restorePanel}"][data-operation-tab]`),
      `Open ${method.restorePanel}`,
    );
    await page.locator(method.shares).fill(payloads.slice(0, method.needed).join('\n'));
    await clickStep(page.locator(method.restore), `Restore records in ${method.panel}`);
    const recovered = page.locator(`${method.restoreResult} textarea`);
    await recovered.waitFor();
    assert.equal(await recovered.inputValue(), mnemonic);
    const recoveredCopy = page.locator(`${method.restoreResult} .secret-action`);
    assert.equal(await recoveredCopy.isDisabled(), true);
    await clickStep(
      page.locator(`${method.restoreResult} button`).filter({ hasText: 'Reveal recovered phrase' }),
      `Reveal restored phrase in ${method.panel}`,
    );
    assert.equal(await recoveredCopy.isEnabled(), true);
  }

  await clickStep(
    page.locator('#codex32-restore-result button').filter({ hasText: 'Use in Generate & Derive' }),
    'Return restored Codex32 phrase to Deriver',
  );
  assert.equal(await page.locator('#mnemonic').inputValue(), mnemonic);
  assert.equal(await page.locator('#derive-form').isVisible(), true);
  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    'Recovery help popovers; MHFE Worker initialization/PIM/Stop; SeedQR, MnemoCode, SLIP-39, and Codex32 exact browser round trips; QR actions; reveal-gated copy; in-memory return to Derive; storage/no HTTP',
  );
}

async function mnemocodeCards(context, profile, run) {
  const page = await open(context, profile, 'key-derivation', run);
  const before = await storageSnapshot(page);
  await page.locator('#mnemonic').fill(mnemonic);
  await page.locator('#main-recovery-source-menu summary').click();
  await page.locator('#main-recovery-source-menu [data-recovery-target="mnemocode"]').click();
  await page.locator('[data-operation-tab][aria-controls="mnemocode-create-panel"]').click();
  await page.locator('#mnemocode-encode-mode').selectOption('seedshift');
  await page.locator('#mnemocode-encode-dates').fill('23-09-2026');

  // "How it works" follows the selected option, opens on hover and stays open after a click.
  const formatHelp = page.locator('#mnemocode-format-help');
  await page.locator('#mnemocode-encode-format').selectOption('unicode');
  await formatHelp.locator('summary').hover();
  await page.waitForFunction(() => document.querySelector('#mnemocode-format-help')?.hasAttribute('open'));
  assert.match(await formatHelp.locator('.recovery-help-popover').innerText(), /Traditional Chinese BIP39 list/u);
  await formatHelp.locator('summary').click();
  await page.locator('#mnemocode-panel h2').hover();
  assert.equal(await formatHelp.getAttribute('open'), '');
  await page.locator('#mnemocode-encode-format').selectOption('indexes');
  assert.match(await formatHelp.locator('.recovery-help-popover').innerText(), /from 1 to 2048/u);
  await page.keyboard.press('Escape');
  assert.equal(await formatHelp.getAttribute('open'), null);
  // The mode popover is closed here, so its text is read without requiring it to be visible.
  assert.match(
    (await page.locator('#mnemocode-mode-help .recovery-help-popover').textContent()) ?? '',
    /sorted from the oldest/u,
  );

  // Cards print color codes, so the section exists only for the color representations.
  for (const format of ['english', 'indexes', 'unicode']) {
    await page.locator('#mnemocode-encode-format').selectOption(format);
    assert.equal(await page.locator('#mnemocode-cards-section').isVisible(), false);
  }
  await page.locator('#mnemocode-encode-format').selectOption('colors-unicode');
  assert.equal(await page.locator('#mnemocode-cards-section').isVisible(), true);
  await page.locator('#mnemocode-encode-format').selectOption('colors');
  await page.locator('#mnemocode-cards-section > summary').click();

  // The list comes from the embedded MnemoCode registry.
  assert.equal(await page.locator('#mnemocode-card-template option').count(), 16);
  assert.deepEqual(
    await page.locator('#mnemocode-card-page-size option').evaluateAll((options) => options.map((o) => o.value)),
    ['a6', 'a4', 'wallet', 'business'],
  );

  const save = async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      page.locator('#export-mnemocode-cards').click(),
    ]);
    const bytes = readFileSync(await download.path());
    await waitText(page, '#mnemocode-cards-status', /^Saved /u);
    return { name: download.suggestedFilename(), bytes };
  };

  await page.locator('#mnemocode-card-template').selectOption({ index: 1 });
  await page.locator('#mnemocode-card-page-size').selectOption('a4');
  await page.locator('#mnemocode-card-qr').check();
  // Without own details the invented person stays the same for every size of this phrase.
  const printedFor = async () =>
    /Printed for ([^.]+)\./u.exec(await page.locator('#mnemocode-cards-status').innerText())?.[1];
  assert.equal(await page.locator('#mnemocode-card-profile').isVisible(), false);
  await save();
  const invented = await printedFor();
  assert.ok(invented !== undefined && invented.length > 3);
  await page.locator('#mnemocode-card-page-size').selectOption('a6');
  await save();
  assert.equal(await printedFor(), invented);
  await page.locator('#mnemocode-card-page-size').selectOption('a4');

  // Own details replace the invented ones; empty fields keep their invented value.
  await page.locator('#mnemocode-card-own-details').check();
  assert.equal(await page.locator('#mnemocode-card-profile').isVisible(), true);
  await page.locator('#mnemocode-card-name').fill('John Smith');
  const sheet = await save();
  assert.equal(await printedFor(), `John Smith, ${invented.split(', ')[1]}`);
  assert.equal(sheet.name, 'cards-a4.pdf');
  assert.equal(sheet.bytes.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(sheet.bytes.length > 50_000, 'The sheet must contain the embedded artwork.');

  // A card size means separate cards: no QR option, one numbered PDF per card.
  assert.equal(await page.locator('#mnemocode-card-output').count(), 0);
  await page.locator('#mnemocode-card-page-size').selectOption('business');
  assert.equal(await page.locator('#mnemocode-card-qr-row').isVisible(), false);
  assert.equal(await page.locator('#mnemocode-card-qr').isChecked(), false);
  assert.match(await page.locator('#mnemocode-card-output-note').innerText(), /own numbered PDF/u);
  const archive = await save();
  assert.equal(archive.name, 'cards-business.zip');
  await page.locator('#mnemocode-card-page-size').selectOption('a6');
  assert.equal(await page.locator('#mnemocode-card-qr-row').isVisible(), true);
  await page.locator('#mnemocode-card-page-size').selectOption('business');
  assert.equal(archive.bytes.subarray(0, 2).toString('latin1'), 'PK');
  assert.match(await page.locator('#mnemocode-cards-status').innerText(), /with 8 cards/u);

  await page.locator('#mnemocode-card-name').fill('1234');
  await page.locator('#export-mnemocode-cards').click();
  await waitText(page, '#mnemocode-cards-status', /Latin letters/u);
  assert.equal(await page.locator('#export-mnemocode-cards').isDisabled(), false);
  // Unticking the box ignores the fields and returns to the invented person.
  await page.locator('#mnemocode-card-own-details').uncheck();
  await save();
  assert.equal(await printedFor(), invented);

  await page.locator('#mnemocode-encode-format').selectOption('english');
  assert.equal(await page.locator('#mnemocode-cards-section').isVisible(), false);
  assert.equal(await page.locator('#export-mnemocode-cards').isVisible(), false);

  // The Decode tab explains its options in the same way.
  const helpText = async (id) => (await page.locator(`#${id} .recovery-help-popover`).textContent()) ?? '';
  await page.locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]').click();
  assert.match(await helpText('mnemocode-decode-format-help'), /never guesses/u);
  await page.locator('#mnemocode-decode-format').selectOption('colors');
  assert.match(await helpText('mnemocode-decode-format-help'), /packed into colors/u);
  await page.locator('#mnemocode-decode-mode').selectOption('seedshift');
  assert.match(await helpText('mnemocode-decode-mode-help'), /move every word back/u);
  assert.match(await helpText('mnemocode-word-help'), /question mark in place/u);
  await page.locator('#mnemocode-legacy-last-word').check();
  assert.match(await helpText('mnemocode-word-help'), /marked as preserved/u);

  assert.deepEqual(await storageSnapshot(page), before);
  assert.deepEqual(run.requests, []);
}

async function mnemocodeRoundTrip(context, profile, run) {
  const page = await open(context, profile, 'key-derivation', run);
  const before = await storageSnapshot(page);
  await page.locator('#mnemonic').fill(mnemonic);
  await page.locator('#main-recovery-source-menu summary').click();
  await page.locator('#main-recovery-source-menu [data-recovery-target="mnemocode"]').click();
  assert.equal(await page.locator('#recovery-workspace').isVisible(), true);
  assert.equal(await page.locator('#mnemocode-panel').isVisible(), true);
  assert.match(await page.locator('#mnemocode-panel .linked-recovery-source').innerText(), /Generate & Derive/u);

  const encode = async (mode, format) => {
    await page.locator('[data-operation-tab][aria-controls="mnemocode-create-panel"]').click();
    await page.locator('#mnemocode-encode-mode').selectOption(mode);
    await page.locator('#mnemocode-encode-format').selectOption(format);
    if (mode === 'direct') {
      await page.locator('#mnemocode-encode-dates').evaluate((input) => {
        input.value = '';
      });
    } else {
      await page.locator('#mnemocode-encode-dates').fill('23-09-2026');
    }
    await page.locator('#encode-mnemocode').click();
    const payload = page.locator('#mnemocode-encode-result article .share-secret').first();
    await payload.waitFor();
    const value = (await payload.textContent()) ?? '';
    assert.doesNotMatch(value, /^MNC1:/u);
    assert.equal(await page.locator('#mnemocode-encode-result article').count(), 1);
    assert.equal(await page.locator('#mnemocode-encode-result .share-qr-action').count(), 1);
    assert.equal(
      await page.locator('#mnemocode-encode-result .mnemocode-palette').count(),
      format === 'colors' || format === 'colors-unicode' ? 1 : 0,
    );
    assert.equal(
      await page.locator('#mnemocode-encode-result button').filter({ hasText: 'Save MNC1 record' }).isDisabled(),
      true,
    );
    return value;
  };

  const decode = async (record, mode, expectCandidates = false) => {
    await page.locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]').click();
    await page.locator('#mnemocode-decode-mode').selectOption(mode);
    if (mode === 'direct') {
      await page.locator('#mnemocode-decode-dates').evaluate((input) => {
        input.value = '';
      });
    } else {
      await page.locator('#mnemocode-decode-dates').fill('23-09-2026');
    }
    await page.locator('#mnemocode-input').fill(record);
    await page.locator('#decode-mnemocode').click();
    const output = page.locator('#mnemocode-decode-result textarea');
    await output.waitFor();
    if (expectCandidates) {
      assert.match(await output.inputValue(), new RegExp(mnemonic, 'u'));
      assert.match(await page.locator('#mnemocode-decode-result .warning-callout').innerText(), /128/u);
    } else {
      assert.equal(await output.inputValue(), mnemonic);
    }
  };

  for (const format of ['english', 'indexes', 'unicode', 'colors', 'colors-unicode']) {
    await decode(await encode('direct', format), 'direct');
  }
  for (const mode of ['seedshift', 'seedshift-legacy']) {
    await decode(await encode(mode, 'english'), mode);
  }
  await decode(await encode('seedshift-legacy-valid', 'english'), 'seedshift-legacy-valid', true);

  await page.locator('[data-operation-tab][aria-controls="mnemocode-create-panel"]').click();
  await page.locator('#mnemocode-encode-mode').selectOption('seedshift');
  await page.locator('#mnemocode-encode-format').selectOption('english');
  await page.locator('#mnemocode-encode-dates').fill('23-13-1999');
  await page.locator('#encode-mnemocode').click();
  assert.match(
    await page.locator('#mnemocode-encode-result').innerText(),
    /month must be an integer from 1 through 12/u,
  );
  await page.locator('#mnemocode-encode-dates').fill('23-12-1999');
  assert.equal(await page.locator('#mnemocode-encode-result').innerText(), '');
  await page.locator('#encode-mnemocode').click();
  await page.locator('#mnemocode-encode-result article .share-secret').waitFor();

  await page.locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]').click();
  await page.locator('#mnemocode-missing-word-input').fill(mnemonic.replace(/about$/u, '?'));
  await page.locator('#recover-mnemocode-word').click();
  const wordOptions = page.locator('#mnemocode-missing-word-result .mnemocode-word-options');
  const wordPhrases = page.locator('#mnemocode-missing-word-result .mnemocode-word-phrases');
  await wordOptions.waitFor();
  assert.match(await wordOptions.inputValue(), /word-index\tchecksum-bits/u);
  assert.match(await wordOptions.inputValue(), /\tabout\t4\t0011/u);
  assert.match(await wordPhrases.inputValue(), /word-index\tchecksum-bits\tmnemonic/u);
  assert.match(await wordPhrases.inputValue(), /\tabout\t4\t0011\t/u);
  assert.match(await page.locator('#mnemocode-missing-word-result .warning-callout').innerText(), /128/u);
  assert.equal(await wordOptions.evaluate((output) => output.classList.contains('concealed')), false);
  assert.equal(await wordPhrases.evaluate((output) => output.classList.contains('concealed')), true);
  const copyCandidates = page
    .locator('#mnemocode-missing-word-result button')
    .filter({ hasText: 'Copy all candidates' });
  assert.equal(await copyCandidates.isDisabled(), true);
  await page.locator('#mnemocode-missing-word-result button').filter({ hasText: 'Reveal recovered phrases' }).click();
  assert.equal(await copyCandidates.isEnabled(), true);

  await page.locator('#mnemocode-legacy-last-word').check();
  await page
    .locator('#mnemocode-missing-word-input')
    .fill('mosquito dust hotel maximum rich kitten hair mother salute dream flush hospital');
  await page.locator('#recover-mnemocode-word').click();
  await wordOptions.waitFor();
  assert.match(await wordOptions.inputValue(), /checksum-bits\tlegacy-tail/u);
  assert.equal((await wordOptions.inputValue()).split('\n').filter((line) => line.includes('\tpreserved')).length, 1);
  assert.match(
    await page.locator('#mnemocode-missing-word-result .warning-callout').innerText(),
    /128 checksum-valid final-word replacements/u,
  );

  const impossibleWords = Array(24).fill('abandon');
  impossibleWords[4] = '?';
  impossibleWords[23] = 'sure';
  await page.locator('#mnemocode-legacy-last-word').uncheck();
  await page.locator('#mnemocode-missing-word-input').fill(impossibleWords.join(' '));
  await page.locator('#recover-mnemocode-word').click();
  assert.match(
    await page.locator('#mnemocode-missing-word-result .warning-callout').innerText(),
    /No checksum-valid BIP39 phrase matches/u,
  );
  assert.equal(await page.locator('#mnemocode-missing-word-result textarea').count(), 0);

  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    'MnemoCode Encode/Decode UI: all five representations; Direct, Seedshift, legacy and legacy-valid modes; ordinary and exact-legacy final-word recovery with checksum metadata; MNC1/QR; storage/no HTTP',
  );
}

async function childWallet(context, profile, run) {
  const page = await open(context, profile, 'key-derivation', run);
  const before = await storageSnapshot(page);
  await page.locator('#count').fill('1');
  await page.locator('#mnemonic').fill(mnemonic);
  await page.locator('#passphrase').fill(parentPassphrase);
  await page.locator('#include-bip85').check();
  await page.locator('#bip85-tab').click();
  // No explicit Derive click: this is the feature-tab auto-derive regression.
  await page.locator('#bip85-result').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#bip85-output').inputValue(), childMnemonic);
  assert.equal(await page.locator('#results').isVisible(), false);
  await page.locator('#open-bip85-wallet').click();
  await page.locator('#bip85-wallet-count').fill('1');
  await page.locator('#bip85-child-passphrase').fill(childPassphrase);
  await page.locator('#bip85-wallet-tabs button').filter({ hasText: 'BIP86' }).click();
  await page.locator('#derive-bip85-wallet').click();
  await page.locator('#bip85-wallet-results').waitFor({ state: 'visible' });
  await page.waitForFunction(
    (expected) =>
      document.querySelector('#bip85-wallet-list [data-sign-address]')?.getAttribute('data-sign-address') === expected,
    childAddress,
  );
  const proof = await sign(page, '#bip85-wallet-list [data-sign-message]');
  assert.equal(proof.address, childAddress);
  assert.equal(await page.locator('#mnemonic').inputValue(), mnemonic);
  assert.equal(await page.locator('#passphrase').inputValue(), parentPassphrase);
  assert.equal(await page.locator('#bip85-output').inputValue(), childMnemonic);
  const verifier = await open(context, profile, 'psbt-inspector', run);
  await verifySignature(verifier, proof.address, proof.signature, 'bitcoin');
  assert.equal(await page.locator('#toggle-bip85-secret').innerText(), 'Reveal recovery source');
  const recoveryMenu = page.locator('#bip85-recovery-source-menu');
  const menuBox = await recoveryMenu.boundingBox();
  const revealBox = await page.locator('#toggle-bip85-secret').boundingBox();
  assert.ok(menuBox && revealBox && menuBox.x + menuBox.width <= revealBox.x);
  await recoveryMenu.locator('summary').click();
  await recoveryMenu.locator('[data-recovery-target="sskr"]').click();
  const linkedHelp = page.locator('#sskr-panel .linked-source-help');
  await linkedHelp.locator('summary').hover();
  await page.waitForFunction(() => document.querySelector('#sskr-panel .linked-source-help')?.hasAttribute('open'));
  await page.locator('[data-recovery-tab][aria-controls="sskr-panel"]').hover();
  await page.waitForFunction(() => !document.querySelector('#sskr-panel .linked-source-help')?.hasAttribute('open'));
  await page.locator('#derive-generate-mode').click();
  await page.locator('#protocol-tabs [data-adapter-id]').first().click();
  await page.locator('#clear-all').click();
  assert.equal(await page.locator('#bip85-child-passphrase').inputValue(), '');
  assert.equal(await page.locator('#bip85-output').inputValue(), '');
  assert.equal(await page.locator('#message-signature-output').inputValue(), '');
  assert.equal(await page.locator('#bip85-wallet-results').isVisible(), false);
  assert.deepEqual(await storageSnapshot(page), before);
  await page.reload();
  assert.equal(await page.locator('#mnemonic').inputValue(), '');
  assert.equal(await page.locator('#passphrase').inputValue(), '');
  assert.equal(run.requests.length, 0);
  run.checks.push(
    'Auto-derived BIP85 exact child mnemonic; aligned recovery-source controls; dynamic linked-source hover help; independent BIP86 address with distinct child passphrase; child signature accepted, changed message rejected; Clear/reload/storage/no HTTP',
  );
}

async function workerReadiness(context, profile, run) {
  for (const action of ['clear', 'cancel', 'tab-switch']) {
    const page = await open(context, profile, 'key-derivation', run);
    let crashed = false;
    page.on('crash', () => {
      crashed = true;
    });
    await page.locator('#count').fill('20');
    await page.locator('#mnemonic').fill(mnemonic);
    await page.evaluate((requestedAction) => {
      document.querySelector('#derive-button').click();
      if (requestedAction === 'clear') document.querySelector('#clear-all').click();
      else if (requestedAction === 'cancel') document.querySelector('#cancel-derivation').click();
      else document.querySelectorAll('#protocol-tabs [data-adapter-id]')[1].click();
    }, action);
    await page.waitForTimeout(500);
    assert.equal(crashed, false, `Page crashed after early ${action}`);
    assert.equal(await page.locator('body').isVisible(), true);
    await page.close();
  }
  run.checks.push('Worker boot readiness survives immediate Clear, Cancel, and protocol-tab switch');
}

async function coinJoin(context, profile, run) {
  const page = await open(context, profile, 'key-derivation', run);
  if (profile.id === 'multi-chain') await page.locator('#coin').selectOption('dash');
  await page.locator('#count').fill('1');
  await page.locator('#mnemonic').fill(mnemonic);
  await page.locator('#include-coinjoin-addresses').check();
  await page.locator('#coinjoin-tab').click();
  await page.locator('#results').waitFor({ state: 'visible' });
  await page.locator('#address-list [data-sign-message]').first().waitFor();
  assert.match(await page.locator('#address-list').innerText(), /9'/);
  const external = await values(page, 'address');
  await page.locator('#result-coinjoin-internal-tab').click();
  const internal = await values(page, 'address');
  assert.notDeepEqual(internal, external);
  assert.equal(await page.locator('#results').isVisible(), true);
  await page.locator('#protocol-tabs [data-adapter-id]').first().click();
  await page.locator('#results').waitFor({ state: 'visible' });
  assert.equal(run.requests.length, 0);
  run.checks.push(
    'CoinJoin tab auto-derives visible external/internal results; distinct branch addresses; standard tab restores visible results',
  );
}

async function bip38(context, profile, run) {
  const chain = profile.id === 'multi-chain' ? 'bitcoin' : 'dash';
  const page = await open(context, profile, 'key-derivation', run);
  const before = await storageSnapshot(page);
  if (chain === 'bitcoin') await page.locator('#protocol-tabs button').filter({ hasText: 'BIP44' }).click();
  await page.locator('#count').fill('2');
  await page.locator('#mnemonic').fill(mnemonic);
  await page.locator('#derive-button').click();
  await page.locator('#results').waitFor({ state: 'visible' });
  const addresses = await values(page, 'address');
  assert.equal(addresses.length, 2);
  const proof = await sign(page, '#address-list [data-sign-message]');
  await page.locator('#enable-bulk-bip38').check();
  await page.locator('#bulk-bip38-passphrase').fill(encryptionPassphrase);
  await page.locator('#bulk-bip38-passphrase').press('Enter');
  await waitText(page, '#bulk-bip38-status', /Encrypted 2 generated private keys/);
  const encrypted = await values(page, 'bip38EncryptedKey');
  assert.equal(new Set(encrypted).size, 2);
  assert.ok(encrypted.every((value) => /^6P/.test(value)));
  assert.equal(await page.locator('[data-copy-field="bip38EncryptedKey"]').first().isDisabled(), true);
  await page.locator('#toggle-result-secrets').click();
  assert.equal(await page.locator('[data-copy-field="bip38EncryptedKey"]').first().isEnabled(), true);
  const verifier = await open(context, profile, 'psbt-inspector', run);
  const verifierBefore = await storageSnapshot(verifier);
  await verifySignature(verifier, proof.address, proof.signature, chain);
  await verifier.locator('[data-mode="bip38"]').click();
  await verifier.locator('#bip38-chain').selectOption(chain);
  await verifier.locator('#bip38-encrypted-key').fill(encrypted.join('\n'));
  await verifier.locator('#bip38-password').fill(encryptionPassphrase);
  await verifier.locator('#decrypt-bip38').click();
  await waitText(verifier, '#bip38-progress', /Finished 2 keys · 2 recovered/);
  const recovered = await verifier.locator('.bip38-result-card').allTextContents();
  assert.ok(addresses.every((address) => recovered.some((text) => text.includes(address))));
  assert.equal(await verifier.locator('#bip38-password').inputValue(), '');
  assert.equal(await verifier.locator('[data-bip38-secret]').count(), 4);
  assert.ok(
    (await verifier.locator('[data-bip38-secret]').evaluateAll((inputs) => inputs.map((input) => input.type))).every(
      (type) => type === 'password',
    ),
  );
  await verifier.locator('#toggle-bip38-result').click();
  assert.ok(
    (await verifier.locator('[data-bip38-secret]').evaluateAll((inputs) => inputs.map((input) => input.type))).every(
      (type) => type === 'text',
    ),
  );
  await verifier.locator('#clear-bip38').click();
  assert.equal(await verifier.locator('[data-bip38-secret]').count(), 0);
  await verifier.locator('#bip38-encrypted-key').fill(encrypted.join('\n'));
  await verifier.locator('#bip38-password').fill('intentionally-wrong-password');
  await verifier.locator('#decrypt-bip38').click();
  await waitText(verifier, '#bip38-progress', /Finished 2 keys · 0 recovered · 2 failed/);
  assert.equal(await verifier.locator('[data-bip38-secret]').count(), 0);
  await verifier.locator('#clear-bip38').click();
  await page.locator('#clear-all').click();
  assert.equal(await page.locator('#bulk-bip38-passphrase').inputValue(), '');
  assert.deepEqual(await storageSnapshot(page), before);
  assert.deepEqual(await storageSnapshot(verifier), verifierBefore);
  await page.reload();
  await verifier.reload();
  assert.equal(await page.locator('#mnemonic').inputValue(), '');
  assert.equal(await verifier.locator('#bip38-encrypted-key').inputValue(), '');
  assert.equal(run.requests.length, 0);
  run.checks.push(
    `${chain}: compact message valid/tampered verification; two-key BIP38 round trip and wrong-password batch; reveal gates; clear/reload/storage/no HTTP`,
  );
}

for (const browserName of (process.env.BROWSER_ENGINES ?? 'chromium,firefox').split(',')) {
  let browser;
  try {
    assert.ok({ chromium, firefox }[browserName], `Unknown engine ${browserName}`);
    browser = await { chromium, firefox }[browserName].launch({
      headless: process.env.HEADED !== '1',
      executablePath: process.env[`${browserName.toUpperCase()}_EXECUTABLE_PATH`],
    });
  } catch (error) {
    report.runs.push({ browser: browserName, passed: false, error: String(error) });
    save();
    continue;
  }
  try {
    for (const profile of Object.values(BUILD_PROFILES)) {
      if (process.env.BROWSER_PROFILE && process.env.BROWSER_PROFILE !== profile.id) continue;
      const cases = profileToolIds(profile).map((tool) => [
        `${tool}-boundaries`,
        (context, run) => boundaries(context, profile, tool, run),
      ]);
      cases.push(['descriptor-followup', (context, run) => descriptorFollowup(context, profile, run)]);
      cases.push(['verifier-revision', (context, run) => verifierRevision(context, profile, run)]);
      cases.push(['worker-readiness', (context, run) => workerReadiness(context, profile, run)]);
      cases.push(['coinjoin', (context, run) => coinJoin(context, profile, run)]);
      cases.push(['bip38-message', (context, run) => bip38(context, profile, run)]);
      cases.push(['recovery-backup-roundtrips', (context, run) => recoveryBackupRoundTrips(context, profile, run)]);
      cases.push(['mnemocode-roundtrip', (context, run) => mnemocodeRoundTrip(context, profile, run)]);
      cases.push(['mnemocode-cards', (context, run) => mnemocodeCards(context, profile, run)]);
      if (profile.id === 'multi-chain')
        cases.push(['bip85-child-signer', (context, run) => childWallet(context, profile, run)]);
      for (const [name, test] of cases) {
        if (process.env.BROWSER_CASES && !process.env.BROWSER_CASES.split(',').includes(name)) continue;
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
          if (route.request().url() === 'https://browser-regression.invalid/probe') {
            await route.fulfill({ json: {}, headers: { 'access-control-allow-origin': '*' } });
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
          `${run.passed ? 'PASS' : 'FAIL'} ${browserName} ${profile.id} ${name}${run.error ? `: ${run.error.split('\n')[0]}` : ''}`,
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

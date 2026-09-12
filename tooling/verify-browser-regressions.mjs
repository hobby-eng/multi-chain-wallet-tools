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
const output = process.env.BROWSER_OUTPUT_DIR ?? resolve(root, 'test-results/browser-regressions', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(output, { recursive: true });
// Trezor's official BIP39 English zero-entropy vector. Everything below is public test data.
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const parentPassphrase = 'TREZOR';
const childPassphrase = 'browser-child-only';
const encryptionPassphrase = 'browser-bip38-only';
const message = 'Standalone browser regression: public synthetic wallet only';
const parent = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic, parentPassphrase));
const childEntropy = hmac(sha512, new TextEncoder().encode('bip-entropy-from-k'), parent.derive("m/83696968'/39'/0'/12'/0'").privateKey).slice(0, 16);
const childMnemonic = entropyToMnemonic(childEntropy, wordlist);
const childKey = HDKey.fromMasterSeed(mnemonicToSeedSync(childMnemonic, childPassphrase)).derive("m/86'/0'/0'/0/0");
const childAddress = p2tr(childKey.publicKey.slice(1)).address;
const report = { startedAt: new Date().toISOString(), scope: 'Fresh isolated file:// contexts; public synthetic fixtures; no live providers, broadcasts, or real wallet data.', runs: [] };
const save = () => writeFileSync(resolve(output, process.env.BROWSER_REPORT_NAME ?? 'report.json'), JSON.stringify(report, null, 2));
const artifact = (profile, tool) => resolve(root, 'dist', getToolBuild(profile, tool).artifactRelativePath);
const waitText = (page, selector, pattern) => page.waitForFunction(
  ({ selector, source }) => new RegExp(source).test(document.querySelector(selector)?.textContent ?? ''),
  { selector, source: pattern.source }, { timeout: 120000 },
);
const values = (page, field) => page.locator(`#address-list [data-copy-field="${field}"]`).evaluateAll(
  buttons => buttons.map(button => button.parentElement.querySelector('.value')?.textContent
    ?? button.closest('.row')?.querySelector('.value')?.textContent),
);

async function storageSnapshot(scope, run) {
  const snapshot = await scope.locator('body').evaluate(async () => {
    const result = {};
    for (const name of ['localStorage', 'sessionStorage']) {
      try { result[name] = Object.fromEntries(Object.entries(window[name])); }
      catch (error) { result[name] = error.name; }
    }
    try { result.caches = await caches.keys(); }
    catch (error) { result.caches = error.name; }
    try { result.cookie = document.cookie; }
    catch (error) { result.cookie = error.name; }
    return result;
  });
  // Chromium emits an additional undefined pageerror for databases() denied in
  // an opaque sandbox, even when its SecurityError is caught. Keep only that
  // specific, deliberately triggered event separate from application errors.
  if (run) run.probingOpaqueIndexedDB = snapshot.localStorage === 'SecurityError';
  snapshot.indexedDB = await scope.locator('body').evaluate(async () => {
    try { return (await indexedDB.databases()).map(({ name, version }) => ({ name, version })); }
    catch (error) { return error.name; }
  });
  await scope.locator('body').evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
  if (run) run.probingOpaqueIndexedDB = false;
  return snapshot;
}

async function open(context, profile, tool, run) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => {
    const expectedProbeError = run.probingOpaqueIndexedDB && String(error) === 'undefined';
    (expectedProbeError ? (run.indexedDBProbeErrors ??= []) : run.pageErrors).push(String(error));
  });
  page.on('console', entry => run.console.push({ type: entry.type(), text: entry.text() }));
  const path = artifact(profile, tool);
  run.artifacts[path] = createHash('sha256').update(readFileSync(path)).digest('hex');
  await page.goto(pathToFileURL(path).href);
  if (tool === 'key-derivation') await page.locator('#crypto-self-test-status.passed').waitFor();
  if (tool === 'activity-viewer') await page.locator('#viewer-crypto-self-test-status.passed').waitFor();
  if (tool === 'discovery-scanner') await page.frameLocator('#recovery-secret-vault').locator('#recovery-self-test.passed').waitFor();
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
  await page.waitForFunction(() => !document.querySelector('#verify-error').hidden || (!document.querySelector('#verify-results').hidden && document.querySelector('#verify-validity').textContent.startsWith('INVALID')));
  assert.equal(await page.locator('#verify-results').isVisible() && (await page.locator('#verify-validity').innerText()).startsWith('VALID'), false);
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
  const u = '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
  const valid = profile.id === 'multi-chain'
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
  await page.locator('#verify-signature').fill('IIeeVV8PxEmSnk2FqMTPAHtJdezmn2tXQhHq8q8fhFu6IXrYcwT6yi7hS42BcpoinL8nRwFFJPqPLXF3prJLWmc=');
  await page.locator('#verify-message-button').click();
  await waitText(page, '#verify-validity', /^VALID/);
  await page.evaluate(() => {
    document.querySelector('#verify-message-button').click();
    const field = document.querySelector('#verify-message');
    field.value = 'Changed claim'; field.dispatchEvent(new Event('input', { bubbles: true }));
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
  run.checks.push('Verification results invalidated on edit/Clear; unsafe custom Tapscript keys rejected before showing an output');
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
      document.addEventListener('securitypolicyviolation', event => violations.push(event.effectiveDirective));
      const script = document.createElement('script');
      script.textContent = 'window.__browserRegressionInlineExecuted = true';
      document.head.append(script);
      script.remove();
      let fetchAllowed = false;
      try { await fetch('https://browser-regression.invalid/probe'); fetchAllowed = true; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
      let parentBlocked = null;
      if (window !== window.parent) {
        try { void window.parent.document.body; parentBlocked = false; } catch { parentBlocked = true; }
      }
      return { inlineExecuted: window.__browserRegressionInlineExecuted === true, fetchAllowed, violations, parentBlocked };
    });
    assert.equal(result.inlineExecuted, false, 'Unhashed injected script executed');
    assert.equal(result.fetchAllowed, networked, 'Unexpected CSP network boundary');
    assert.ok(result.violations.some(value => value.startsWith('script-src')));
    if (!networked) assert.ok(result.violations.includes('connect-src'));
    if (index === 1) assert.equal(result.parentBlocked, true);
    assert.deepEqual(await storageSnapshot(scope, run), before);
    run.checks.push({ scope: index === 0 ? 'top-level' : 'opaque-vault', csp, storage: before, probes: result });
  }
  await page.reload();
  assert.deepEqual(await context.cookies(), []);
  assert.equal(run.requests.filter(request => !request.url.endsWith('/probe')).length, 0);
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
  await page.waitForFunction(expected => document.querySelector('#bip85-wallet-list [data-sign-address]')?.getAttribute('data-sign-address') === expected, childAddress);
  const proof = await sign(page, '#bip85-wallet-list [data-sign-message]');
  assert.equal(proof.address, childAddress);
  assert.equal(await page.locator('#mnemonic').inputValue(), mnemonic);
  assert.equal(await page.locator('#passphrase').inputValue(), parentPassphrase);
  assert.equal(await page.locator('#bip85-output').inputValue(), childMnemonic);
  const verifier = await open(context, profile, 'psbt-inspector', run);
  await verifySignature(verifier, proof.address, proof.signature, 'bitcoin');
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
  run.checks.push('Auto-derived BIP85 exact child mnemonic; independent BIP86 address with distinct child passphrase; child signature accepted, changed message rejected; Clear/reload/storage/no HTTP');
}

async function workerReadiness(context, profile, run) {
  for (const action of ['clear', 'cancel', 'tab-switch']) {
    const page = await open(context, profile, 'key-derivation', run);
    let crashed = false;
    page.on('crash', () => { crashed = true; });
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
  run.checks.push('CoinJoin tab auto-derives visible external/internal results; distinct branch addresses; standard tab restores visible results');
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
  assert.ok(encrypted.every(value => /^6P/.test(value)));
  assert.equal(await page.locator('[data-copy-field="bip38EncryptedKey"]').first().isDisabled(), true);
  await page.locator('#toggle-sensitive-values').click();
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
  assert.ok(addresses.every(address => recovered.some(text => text.includes(address))));
  assert.equal(await verifier.locator('#bip38-password').inputValue(), '');
  assert.equal(await verifier.locator('[data-bip38-secret]').count(), 4);
  assert.ok((await verifier.locator('[data-bip38-secret]').evaluateAll(inputs => inputs.map(input => input.type))).every(type => type === 'password'));
  await verifier.locator('#toggle-bip38-result').click();
  assert.ok((await verifier.locator('[data-bip38-secret]').evaluateAll(inputs => inputs.map(input => input.type))).every(type => type === 'text'));
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
  run.checks.push(`${chain}: compact message valid/tampered verification; two-key BIP38 round trip and wrong-password batch; reveal gates; clear/reload/storage/no HTTP`);
}

for (const browserName of (process.env.BROWSER_ENGINES ?? 'chromium,firefox').split(',')) {
  let browser;
  try {
    assert.ok({ chromium, firefox }[browserName], `Unknown engine ${browserName}`);
    browser = await ({ chromium, firefox }[browserName]).launch({
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
      const cases = profileToolIds(profile).map(tool => [`${tool}-boundaries`, (context, run) => boundaries(context, profile, tool, run)]);
      cases.push(['descriptor-followup', (context, run) => descriptorFollowup(context, profile, run)]);
      cases.push(['verifier-revision', (context, run) => verifierRevision(context, profile, run)]);
      cases.push(['worker-readiness', (context, run) => workerReadiness(context, profile, run)]);
      cases.push(['coinjoin', (context, run) => coinJoin(context, profile, run)]);
      cases.push(['bip38-message', (context, run) => bip38(context, profile, run)]);
      if (profile.id === 'multi-chain') cases.push(['bip85-child-signer', (context, run) => childWallet(context, profile, run)]);
      for (const [name, test] of cases) {
        if (process.env.BROWSER_CASES && !process.env.BROWSER_CASES.split(',').includes(name)) continue;
        const run = { browser: browserName, version: browser.version(), profile: profile.id, name, passed: false, artifacts: {}, checks: [], requests: [], pageErrors: [], console: [] };
        report.runs.push(run);
        const context = await browser.newContext();
        await context.route(/^https?:\/\//, async route => {
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
            await page.screenshot({ path: resolve(output, `${browserName}-${profile.id}-${name}-${index}.png`), fullPage: true }).catch(() => {});
          }
        } finally {
          await context.close();
          save();
        }
        console.log(`${run.passed ? 'PASS' : 'FAIL'} ${browserName} ${profile.id} ${name}${run.error ? `: ${run.error.split('\n')[0]}` : ''}`);
      }
    }
  } finally { await browser.close(); }
}
save();
console.log(`Regression report: ${output}`);
if (report.runs.length === 0 || report.runs.some(run => !run.passed)) process.exitCode = 1;

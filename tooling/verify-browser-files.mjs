// User-run acceptance of the actual standalone files. No CSP/sandbox bypass flags.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { BUILD_PROFILES, getToolBuild, profileToolIds } from './build-profiles.mjs';
import { readReleaseMetadata } from './project-metadata.mjs';
import { loadPlaywright } from './playwright-loader.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const release = readReleaseMetadata(root);
const { chromium, firefox } = await loadPlaywright();
const output = process.env.BROWSER_OUTPUT_DIR ?? resolve(root, 'test-results/browser-files', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(output, { recursive: true });
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const pubkey = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const secondPubkey = '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';
const bitcoinPsbt = 'cHNidP8BAJoCAAAAAljoeiG1ba8MI76OcHBFbDNvfLqlyHV5JPVFiHuyq911AAAAAAD/////g40EJ9DsZQpoqka7CwmK6kQiwHGyyng1Kgd5WdB86h0BAAAAAP////8CcKrwCAAAAAAWABTYXCtx0AYLCcmIauuBXlCZHdoSTQDh9QUAAAAAFgAUAK6pouXw+HaliN9VRuh0LR2HAI8AAAAAAAAAAAA=';
const dashPsbt = 'cHNidP8BAEICAAAAAXgRxzbShUlivVFKgoLyhk0RCCYLZKCYTl/tYRd+yGImAAAAAAD/////AQAAAAAAAAAABmoEAAECAwAAAAAAAAA=';
const bip322Address = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';
const bip322Message = 'Hello World';
const bip322Signature = 'smpAkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=';
const dashMessageAddress = 'XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE';
const dashMessage = 'Dash verifier fixture';
const dashMessageSignature = 'IIeeVV8PxEmSnk2FqMTPAHtJdezmn2tXQhHq8q8fhFu6IXrYcwT6yi7hS42BcpoinL8nRwFFJPqPLXF3prJLWmc=';
const fixedP2wshDescriptor = "wsh(or_d(pk(03a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd),and_v(v:pk(02e8a3647fe4637f85c3f80c101a995803c78e674f8a644281b3ae0bcc8e215833),older(12960))))#80auchz3";
const btc = '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH';
const dash = 'XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5';
const eth = `0x${'11'.repeat(20)}`;
const timestamp = '2026-09-01T00:00:00.000Z';
const report = {
  startedAt: new Date().toISOString(), node: process.version,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  scope: 'Direct file URLs, Chromium/Firefox, startup, edition selection, basic UI/derivation/clear, mocked address lookup, opaque vault isolation, scrolling and screenshots. No live-provider or real-funds test.',
  runs: [],
};
const save = () => writeFileSync(resolve(output, process.env.BROWSER_REPORT_NAME ?? 'report.json'), JSON.stringify(report, null, 2));
const selectedBrowsers = (process.env.BROWSER_ENGINES ?? 'chromium,firefox').split(',');
const browserExecutablePaths = {
  chromium: process.env.CHROMIUM_EXECUTABLE_PATH,
  firefox: process.env.FIREFOX_EXECUTABLE_PATH,
};

function providerFixture(request) {
  const url = new URL(request.url());
  if (url.hostname === 'blockchain.info' && url.pathname === '/balance') {
    return Object.fromEntries(url.searchParams.get('active').split('|').map(address => [address, { final_balance: 0, n_tx: 0 }]));
  }
  if (['blockstream.info', 'mempool.space'].includes(url.hostname)) {
    if (url.pathname.includes('/txs/chain')) return [];
    const address = url.pathname.split('/address/')[1];
    if (address) return { address, chain_stats: { tx_count: 0, funded_txo_sum: 0, spent_txo_sum: 0 }, mempool_stats: { tx_count: 0 } };
  }
  if (url.hostname === 'ethereum-rpc.publicnode.com') {
    const query = request.postDataJSON();
    const reply = item => ({ jsonrpc: '2.0', id: item.id, result: item.method === 'eth_blockNumber' ? '0x10' : '0x0' });
    return Array.isArray(query) ? query.map(reply) : reply(query);
  }
  if (url.hostname.endsWith('blockscout.com')) return { items: [], next_page_params: null };
  if (url.hostname.includes('dashscan')) {
    if (url.pathname === '/addresses/info') return url.searchParams.get('addresses').split(',').map(address => ({ address, balance: '0', txCount: 0 }));
    if (url.pathname.endsWith('/status')) return { status: 'ok' };
    if (url.pathname.endsWith('/blocks')) return { resultSet: [{ height: 100, timestamp }] };
    if (url.pathname.endsWith('/transactions')) {
      const page = Number(url.searchParams.get('page')), limit = Number(url.searchParams.get('limit'));
      const rows = Array.from({ length: 150 }, (_, i) => ({ hash: i.toString(16).padStart(64, '0'), timestamp, type: 'CLASSIC', vIn: [], vOut: [] }));
      return { resultSet: rows.slice((page - 1) * limit, page * limit), pagination: { total: 150 } };
    }
    if (url.pathname.includes('/address/')) return { address: url.pathname.split('/address/')[1], balance: '0', received: '0', sent: '0', txCount: 150 };
  }
  throw new Error(`Unmapped request: ${url.origin}${url.pathname}`);
}

for (const browserName of selectedBrowsers) {
  const engine = { chromium, firefox }[browserName];
  assert.ok(engine, `Unknown browser: ${browserName}`);
  let browser;
  try {
    browser = await engine.launch({
      headless: process.env.HEADED !== '1',
      executablePath: browserExecutablePaths[browserName],
    });
  }
  catch (error) { report.runs.push({ browser: browserName, passed: false, error: String(error) }); save(); continue; }
  try {
    for (const profile of Object.values(BUILD_PROFILES)) {
      for (const toolId of profileToolIds(profile)) {
        const tool = getToolBuild(profile, toolId);
        const artifact = resolve(root, 'dist', tool.artifactRelativePath);
        const run = { browser: browserName, browserVersion: browser.version(), profile: profile.id, tool: toolId, artifact, passed: false, errors: [], console: [], requests: [], unexpectedRequests: [], checks: [] };
        report.runs.push(run);
        // Use a fresh context without Playwright's serviceWorkers:'block' init script.
        // That script reads navigator.serviceWorker and throws in an opaque sandbox.
        // File-origin/CSP restrictions stay intact; all HTTP is still intercepted below.
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();
        let pauseNextDashStatus = false;
        let releaseDashStatus;
        page.setDefaultTimeout(20000);
        page.on('pageerror', error => run.errors.push(String(error)));
        page.on('console', message => run.console.push({ type: message.type(), text: message.text() }));
        await context.route(/^https?:\/\//u, async route => {
          const request = route.request();
          run.requests.push({ url: request.url(), method: request.method(), body: request.postData() });
          if (pauseNextDashStatus && new URL(request.url()).pathname === '/status') {
            pauseNextDashStatus = false;
            await new Promise(resolve => { releaseDashStatus = resolve; });
            await route.abort('aborted').catch(() => {}); return;
          }
          try { await route.fulfill({ json: providerFixture(request), headers: { 'access-control-allow-origin': '*' } }); }
          catch (error) { run.unexpectedRequests.push(String(error)); await route.abort(); }
        });
        try {
          assert.ok(existsSync(artifact), `Build first: missing ${artifact}`);
          run.sha256 = createHash('sha256').update(readFileSync(artifact)).digest('hex');
          await page.goto(pathToFileURL(artifact).href);
          let scope = page;
          if (toolId === 'discovery-scanner') {
            assert.equal(await page.locator('#recovery-secret-vault').getAttribute('sandbox'), 'allow-scripts');
            scope = page.frameLocator('#recovery-secret-vault');
            await scope.locator('#recovery-self-test.passed').waitFor();
            assert.equal(await scope.locator('body').evaluate(() => {
              try { void window.parent.document.body; return false; } catch { return true; }
            }), true, 'Vault can read parent DOM');
            run.checks.push('Opaque vault parent-DOM isolation');
            if (profile.id === 'multi-chain') assert.equal(await scope.locator('#recovery-coin').inputValue(), 'bitcoin');
            await scope.locator('[data-input-mode="batch"]').click();
            await scope.locator('#automatic-candidates').check();
            assert.equal(await scope.locator('#candidate-options').isVisible(), true);
            assert.equal(await scope.locator('#candidate-coins input').count(), profile.id === 'multi-chain' ? 3 : 1);
            await scope.locator('#candidate-all-coins').check();
            assert.equal(await scope.locator('#custom-path-options').isVisible(), false);
            await scope.locator('#automatic-candidates').uncheck();
            run.checks.push('Automatic candidate coin selection and custom-path isolation');
            await scope.locator('#batch-mnemonics').fill(`${phrase}\n${phrase}`);
            await scope.locator('#scan-custom-path').check();
            const initialPath = await scope.locator('#custom-path-template').inputValue();
            assert.ok(initialPath.includes("/0'/0/{index}"));
            assert.equal(await scope.locator('#custom-path-range').isChecked(), false);
            await scope.locator('#custom-path-range').check();
            assert.equal(await scope.locator('#custom-path-range-end').inputValue(), initialPath.replace("/0'/0/{index}", "/1'/0/{index}"));
            await scope.locator('#custom-part-account').fill('7');
            assert.ok((await scope.locator('#custom-path-template').inputValue()).includes("/7'/0/{index}"));
            await scope.locator('#custom-part-finish-account').fill('9');
            assert.ok((await scope.locator('#custom-path-range-end').inputValue()).includes("/9'/0/{index}"));
            await scope.locator('#custom-path-range').uncheck();
            await scope.locator('#custom-path-template').fill("m/123'/4/{index}'/8");
            assert.equal(await scope.locator('#custom-path-parts').isVisible(), false);
            assert.equal(await scope.locator('#custom-path-template').inputValue(), "m/123'/4/{index}'/8");
            await scope.locator('#scan-custom-path').uncheck();
            run.checks.push('Prefilled custom range, visual account editing and arbitrary free-form path preservation');
            await scope.locator('#public-source-tab').click();
            if (profile.id === 'multi-chain') await scope.locator('#recovery-coin').selectOption('dash');
            await scope.locator('#watch-only-keys').fill("dash-descriptor:pkh([c7fe8acb/44'/1'/0']tpubDDgGSmowbmYWepHK5PJYCfzUFrKy1c7PHVumScWELYwwjaGBf73ZD1JD1xc2y4hKQDp4qHUKjxz8HQyJXmM5UQh797enQQSpq8vife8yva8/0/*)#tz4w30l2");
            assert.match(await scope.locator('#watch-only-detection').innerText(), /Dash Core BIP44 descriptor/);
            run.checks.push('Dash public descriptor detection');
            await scope.locator('#watch-only-minimum').fill('1');
            // Hold a real worker request so cancellation and the Clear lock are
            // checked while work is pending, not after an instant fixture reply.
            pauseNextDashStatus = true;
            const pendingStatus = page.waitForRequest(request => new URL(request.url()).pathname === '/status');
            await scope.locator('#start-recovery-scan').click();
            await pendingStatus;
            assert.equal(await scope.locator('#clear-recovery').isDisabled(), true);
            await scope.locator('#cancel-recovery-scan').click();
            await scope.locator('#start-recovery-scan:enabled').waitFor();
            releaseDashStatus?.();
            await scope.locator('#clear-recovery').click();
            // Use the same synthetic public descriptor again after cancellation.
            await scope.locator('#watch-only-keys').fill("dash-descriptor:pkh([c7fe8acb/44'/1'/0']tpubDDgGSmowbmYWepHK5PJYCfzUFrKy1c7PHVumScWELYwwjaGBf73ZD1JD1xc2y4hKQDp4qHUKjxz8HQyJXmM5UQh797enQQSpq8vife8yva8/0/*)#tz4w30l2");
            await scope.locator('#start-recovery-scan').click();
            await scope.locator('#recovery-results').waitFor({ state: 'visible' });
            await scope.locator('#start-recovery-scan:enabled').waitFor();
            const publicDownload = page.waitForEvent('download');
            await scope.locator('#export-recovery-json').click();
            const exported = await publicDownload;
            const publicReport = JSON.parse(readFileSync(await exported.path(), 'utf8'));
            assert.equal(publicReport.results.length, 1);
            assert.equal(publicReport.results[0].sections[0].state, 'complete');
            assert.equal(publicReport.results[0].sections[0].scanned, '1');
            assert.doesNotMatch(JSON.stringify(publicReport), /tpubDDgG|abandon|xprv|tprv/);
            await exported.delete();
            run.checks.push('Scanner descriptor scan, pending-request cancellation, restart and secret-free JSON download');
            await scope.locator('#watch-only-keys').fill(`${pubkey}\n${pubkey}`);
            assert.equal(await scope.locator('#seed-source-panel').isVisible(), false);
            assert.equal(await scope.locator('.public-key-scope').isVisible(), true);
            await scope.locator('#recovery-network').selectOption('testnet');
            await scope.locator('#clear-recovery').click();
            assert.equal(await scope.locator('#watch-only-keys').inputValue(), '');
            run.checks.push('Seed batch/public-key batch tabs, testnet selection, scope warning and Clear');
            await scope.locator('#seed-source-tab').click();
            if (profile.id === 'multi-chain') await scope.locator('#recovery-coin').selectOption('dash');
            await scope.locator('[data-input-mode="batch"]').click();
            await scope.locator('#batch-mnemonics').fill(`${phrase}\n${phrase}`);
            for (const id of ['scan-platform-addresses', 'scan-platform-identities', 'scan-shielded']) {
              await scope.locator(`#${id}`).uncheck();
            }
            await scope.locator('#core-receive-count').fill('1');
            await scope.locator('#core-change-count').fill('1');
            await scope.locator('#start-recovery-scan').click();
            await scope.locator('#start-recovery-scan:enabled').waitFor();
            assert.equal(await scope.locator('#recovery-results').isVisible(), true);
            const batchDownload = page.waitForEvent('download');
            await scope.locator('#export-recovery-json').click();
            const batchExported = await batchDownload;
            const batchReport = JSON.parse(readFileSync(await batchExported.path(), 'utf8'));
            assert.equal(batchReport.results.length, 2);
            assert.equal(new Set(batchReport.results.map(result => result.inputId)).size, 2);
            for (const result of batchReport.results) {
              assert.equal(result.sections.find(section => section.id === 'core').state, 'complete');
              assert.equal(result.sections.find(section => section.id === 'core').scanned, '2');
            }
            assert.doesNotMatch(JSON.stringify(batchReport), /abandon|xprv|tprv/);
            await batchExported.delete();
            await scope.locator('#clear-recovery').click();
            assert.equal(await scope.locator('#recovery-results').isVisible(), false);
            run.checks.push('Scanner two-seed Core batch, isolated results, JSON export and Clear');
          } else if (toolId === 'key-derivation') {
            await page.locator('#crypto-self-test-status.passed').waitFor();
            assert.equal(await page.locator('#path-preview').isVisible(), true);
            assert.equal(await page.locator('#account').inputValue(), '0');
            assert.match(await page.locator('#path-preview').innerText(), /^m\//);
            run.checks.push('Read-only standard scheme parameters and canonical path preview');
            if (profile.id === 'multi-chain') assert.equal(await page.locator('#coin').inputValue(), 'bitcoin');
            await page.locator('#mnemonic').fill(phrase);
            await page.locator('#count').fill('1');
            await page.locator('#derive-button').click();
            await page.locator('#results').waitFor({ state: 'visible' });
            assert.equal(await page.locator('#account-descriptor-export').isVisible(), true);
            assert.equal(await page.locator('#download-private-descriptors').isDisabled(), true);
            assert.equal(await page.locator('#copy-public-descriptors').isEnabled(), true);
            await page.locator('#open-account-export').click();
            for (const kind of ['public', 'private']) {
              if (kind === 'private') {
                await page.locator('#close-account-export').click();
                await page.locator('#toggle-sensitive-values').click();
                await page.locator('#open-account-export').click();
              }
              const pending = page.waitForEvent('download');
              await page.locator(`#download-${kind}-descriptors`).click();
              const download = await pending;
              const text = readFileSync(await download.path(), 'utf8');
              assert.ok(text.startsWith("importdescriptors '["));
              const requests = JSON.parse(text.slice("importdescriptors '".length, -1));
              assert.equal(requests.length, 2);
              assert.ok(requests.every(r => r.active === true && !('range' in r)));
              assert.equal(await page.locator('.bulk-panel #open-account-export').count(), 1);
              assert.deepEqual(requests.map(r => r.internal), [false, true]);
              assert.deepEqual(requests.map(r => r.timestamp), [0, 0]);
              assert.match(text, kind === 'private' ? /[xt]prv/ : /[xt]pub/);
              if (kind === 'public') assert.doesNotMatch(text, /[xt]prv/);
              await download.delete();
            }
            await page.keyboard.press('Escape');
            await page.locator('#toggle-sensitive-values').click();
            assert.equal(await page.locator('#download-private-descriptors').isDisabled(), true);
            run.checks.push('Public/private account descriptor downloads and reveal gate');
            await page.locator('#clear-all').click();
            assert.equal(await page.locator('#download-private-descriptors').isDisabled(), true);
            assert.equal(await page.locator('#mnemonic').inputValue(), '');
            assert.equal(await page.locator('#results').isVisible(), false);
            assert.equal(run.requests.length, 0, 'Offline derivation attempted HTTP');
            run.checks.push('Startup, synthetic BIP39 derivation, Clear and no HTTP');
          } else if (toolId === 'activity-viewer') {
            await page.locator('#viewer-crypto-self-test-status.passed').waitFor();
            if (profile.id === 'multi-chain') {
              assert.equal(await page.locator('#viewer-coin').inputValue(), 'bitcoin');
              for (const [coin, address] of [['bitcoin', btc], ['ethereum', eth]]) {
                await page.locator('#viewer-coin').selectOption(coin);
                await page.locator('#full-viewing-key').fill(address);
                await page.locator('#scan-button').click();
                await page.locator('#viewer-results').waitFor({ state: 'visible' });
                assert.match(await page.locator('#viewer-results-heading').innerText(), new RegExp(coin, 'i'));
                await page.locator('#clear-viewer').click();
              }
              await page.locator('#viewer-coin').selectOption('dash');
            } else assert.equal(await page.locator('#viewer-coin').count(), 0);
            await page.locator('#full-viewing-key').fill(dash);
            await page.locator('#viewer-history-limit').fill('150');
            await page.locator('#scan-button').click();
            await page.locator('#viewer-results').waitFor({ state: 'visible' });
            assert.equal(await page.locator('#viewer-activity > article').count(), 150);
            run.checks.push('Mocked public-address lookup and 150-row Dash pagination');
            await page.locator('#clear-viewer').click();
          } else {
            assert.equal(await page.locator('#psbt-build-version').innerText(), release.version);
            await page.locator('#psbt-input').fill(profile.id === 'dash-community' ? dashPsbt : bitcoinPsbt);
            await page.locator('#inspect-button').click();
            await page.locator('#psbt-results').waitFor({ state: 'visible' });
            assert.match(await page.locator('#transaction-details').innerText(), /Transaction ID[\s\S]*Serialized size[\s\S]*Virtual size[\s\S]*Weight[\s\S]*scriptPubKey ASM/u);
            assert.match(await page.locator('#psbt-summary').innerText(), /Signing state[\s\S]*Unsigned[\s\S]*UTXO information/u);
            const advanced = page.locator('.psbt-advanced-details');
            assert.equal(await advanced.getAttribute('open'), null);
            await advanced.locator(':scope > summary').click();
            await page.locator('#map-details summary').filter({ hasText: /^Input 0/u }).click();
            assert.match(await page.locator('#map-details').innerText(), /No PSBT metadata supplied/u);
            await page.locator('[data-mode="verify"]').click();
            await page.locator('#verify-address').fill(profile.id === 'dash-community' ? dashMessageAddress : bip322Address);
            await page.locator('#verify-message').fill(profile.id === 'dash-community' ? dashMessage : bip322Message);
            await page.locator('#verify-signature').fill(profile.id === 'dash-community' ? dashMessageSignature : bip322Signature);
            await page.locator('#verify-message-button').click();
            await page.locator('#verify-results').waitFor({ state: 'visible' });
            assert.match(await page.locator('#verify-validity').innerText(), /^VALID/u);
            await page.locator('[data-mode="script"]').click();
            await page.locator('#script-input').fill('51');
            await page.locator('#decode-script').click();
            await page.locator('#script-results').waitFor({ state: 'visible' });
            assert.match(await page.locator('#script-policy').innerText(), /No supported multisig/u);
            if (profile.id === 'multi-chain') {
              await page.locator('#script-input').fill(fixedP2wshDescriptor);
              await page.locator('#decode-script').click();
              assert.match(await page.locator('#script-asm').innerText(), /OP_CHECKSIG[\s\S]*OP_CHECKSEQUENCEVERIFY/u);
              assert.match(await page.locator('#script-wrappers').innerText(), /Compiled descriptor data[\s\S]*P2WSH[\s\S]*bc1q/u);
            }
            await page.locator('[data-mode="builder"]').click();
            await page.locator('.preimage-calculator > summary').click();
            const preimagePhrase = page.locator('#preimage-phrase');
            await preimagePhrase.fill('local test phrase');
            await page.locator('#toggle-preimage-visibility').click();
            assert.equal(await preimagePhrase.getAttribute('type'), 'text');
            await page.locator('#clear-preimage').click();
            assert.equal(await preimagePhrase.getAttribute('type'), 'password');
            assert.equal(await preimagePhrase.inputValue(), '');
            await page.locator('#public-keys').fill(pubkey);
            await page.locator('#required-signatures').fill('1');
            await page.locator('#build-policy').click();
            await page.locator('#policy-results').waitFor({ state: 'visible' });
            assert.match(await page.locator('#policy-address').innerText(), profile.id === 'dash-community' ? /^7/u : /^bc1q/u);
            assert.equal(await page.locator('#policy-threshold').innerText(), '1 of 1');
            await page.locator('#policy-mode').selectOption('staged-recovery');
            assert.equal(await page.locator('#required-signatures').isDisabled(), true);
            assert.equal(await page.locator('#required-signatures').inputValue(), '1');
            await page.locator('#public-keys').fill(`${pubkey}\n${pubkey}`);
            assert.equal(await page.locator('#build-policy').isDisabled(), true);
            await page.locator('#public-keys').fill(pubkey);
            await page.locator('#second-lock-kind').selectOption('relative-time');
            assert.equal(await page.locator('#second-time-unit').isVisible(), true);
            await page.locator('#policy-mode').selectOption('locked-multisig');
            assert.equal(await page.locator('#build-policy').isDisabled(), false);
            if (profile.id === 'dash-community') {
              assert.equal(await page.locator('#psbt-chain option').count(), 1);
              assert.equal(await page.locator('#psbt-chain').inputValue(), 'dash');
              assert.equal(await page.locator('#builder-wrapper option').count(), 1);
              assert.equal(await page.locator('#builder-wrapper').inputValue(), 'p2sh');
              assert.equal(await page.locator('#policy-mode option[value="custom-miniscript"]').count(), 0);
              assert.equal(await page.locator('#custom-miniscript-field').count(), 0);
            } else {
              await page.locator('#builder-wrapper').selectOption('p2tr');
              await page.locator('#public-keys').fill(`${pubkey}\n${secondPubkey}`);
              await page.locator('#required-signatures').fill('2');
              await page.locator('#build-policy').click();
              await page.waitForTimeout(50);
              assert.equal(await page.locator('#builder-error').isHidden(), true, await page.locator('#builder-error').innerText());
              await page.locator('#policy-results').waitFor({ state: 'visible' });
              assert.match(await page.locator('#policy-address').innerText(), /^bc1p/u);
              assert.match(await page.locator('#policy-descriptor').innerText(), /^tr\([0-9a-f]{64},multi_a\(2,/u);
              assert.match(await page.locator('#policy-miniscript').innerText(), /^multi_a\(2,/u);
              assert.match(await page.locator('#policy-script-pubkey').innerText(), /^5120[0-9a-f]{64}$/u);
              assert.match(await page.locator('#policy-compatibility').innerText(), /unspendable NUMS internal key/u);
              await page.locator('#builder-wrapper').selectOption('p2tr-musig2');
              assert.equal(await page.locator('#policy-mode').isDisabled(), true);
              assert.equal(await page.locator('#required-signatures').inputValue(), '2');
              await page.locator('#build-policy').click();
              await page.waitForTimeout(50);
              assert.equal(await page.locator('#builder-error').isHidden(), true, await page.locator('#builder-error').innerText());
              await page.locator('#policy-results').waitFor({ state: 'visible' });
              assert.match(await page.locator('#policy-address').innerText(), /^bc1p/u);
              assert.match(await page.locator('#policy-descriptor').innerText(), /^tr\(musig\(/u);
              assert.equal(await page.locator('#redeem-script').innerText(), '');
              assert.match(await page.locator('#policy-requirement').innerText(), /N-of-N/u);
              await page.locator('#builder-wrapper').selectOption('p2wsh');
              await page.locator('#policy-mode').selectOption('custom-miniscript');
              assert.equal(await page.locator('#builder-chain').isDisabled(), true);
              assert.equal(await page.locator('#custom-miniscript-field').isVisible(), true);
              await page.locator('#custom-miniscript').fill(`pk(${pubkey})`);
              await page.locator('#build-policy').click();
              assert.match(await page.locator('#policy-address').innerText(), /^bc1q/u);
              assert.match(await page.locator('#policy-descriptor').innerText(), /^wsh\(pk\(/u);
            }
            assert.equal(run.requests.length, 0, 'Offline PSBT & Multisig Inspector attempted HTTP');
            run.checks.push('Offline PSBT summary/advanced decoding, signed-message verification, script decoding, P2SH/P2WSH/P2TR/MuSig2 policy build and no HTTP');
          }
          run.layouts = [];
          for (const width of [1280, 390]) {
            await page.setViewportSize({ width, height: 800 });
            const bottom = scope.locator('footer');
            await bottom.scrollIntoViewIfNeeded();
            await page.screenshot({ path: resolve(output, `${browserName}-${profile.id}-${toolId}-${width}.png`), fullPage: true });
            const dimensions = await scope.locator('body').evaluate(() => ({
              viewport: innerWidth, width: document.documentElement.scrollWidth,
              height: document.documentElement.scrollHeight,
              footerBottom: document.querySelector('footer').getBoundingClientRect().bottom + scrollY,
            }));
            run.layouts.push({ width, ...dimensions });
            assert.ok(dimensions.width <= dimensions.viewport + 2, `Horizontal overflow: ${dimensions.width}px document / ${dimensions.viewport}px viewport`);
            assert.ok(dimensions.height - dimensions.footerBottom < 200, `Excess blank space below footer: ${Math.round(dimensions.height - dimensions.footerBottom)}px`);
            if (toolId === 'discovery-scanner') {
              const frameHeight = await page.locator('#recovery-secret-vault').evaluate(element => element.getBoundingClientRect().height);
              run.layouts.at(-1).frameHeight = frameHeight;
              assert.ok(Math.abs(frameHeight - dimensions.footerBottom) < 200, 'Vault frame height does not follow content');
            }
          }
          assert.equal(run.unexpectedRequests.length, 0, 'Unexpected external request');
          assert.equal(run.errors.length, 0, 'Uncaught browser exception');
          assert.ok(!run.console.some(message => /Unsafe attempt to load URL|unique security origins/u.test(message.text)), 'File-origin navigation error');
          assert.ok(!JSON.stringify(run.requests).includes('abandon'), 'Synthetic mnemonic words escaped through HTTP');
          run.checks.push('Desktop/mobile screenshots, footer scrolling and bounded bottom whitespace');
          run.passed = true;
        } catch (error) {
          run.errors.push(String(error));
          await page.screenshot({ path: resolve(output, `${browserName}-${profile.id}-${toolId}-failure.png`), fullPage: true }).catch(() => {});
        }
        finally { await context.close(); save(); }
        console.log(`${run.passed ? 'PASS' : 'FAIL'} ${browserName} ${profile.id} ${toolId}`);
      }
    }
  } finally { await browser.close(); }
}
save();
console.log(`Browser report and screenshots: ${output}`);
if (report.runs.some(run => !run.passed)) process.exitCode = 1;

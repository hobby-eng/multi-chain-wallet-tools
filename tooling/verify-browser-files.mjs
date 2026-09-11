// User-run acceptance of the actual standalone files. No CSP/sandbox bypass flags.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { BUILD_PROFILES, getToolBuild } from './build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(import.meta.url);
const playwrightPath = process.env.PLAYWRIGHT_MODULE ?? require.resolve('playwright');
const { chromium, firefox } = await import(pathToFileURL(playwrightPath).href);
const output = resolve(root, 'test-results/browser-files', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(output, { recursive: true });
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const pubkey = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
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
const save = () => writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
const selectedBrowsers = (process.env.BROWSER_ENGINES ?? 'chromium,firefox').split(',');

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
    if (url.pathname.endsWith('/status')) return { status: 'ok' };
    if (url.pathname.endsWith('/blocks')) return { resultSet: [{ height: 100, timestamp }] };
    if (url.pathname.endsWith('/transactions')) {
      const page = Number(url.searchParams.get('page')), limit = Number(url.searchParams.get('limit'));
      const rows = Array.from({ length: 150 }, (_, i) => ({ hash: i.toString(16).padStart(64, '0'), timestamp, type: 'CLASSIC', vIn: [], vOut: [] }));
      return { resultSet: rows.slice((page - 1) * limit, page * limit), pagination: { total: 150 } };
    }
    if (url.pathname.includes('/address/')) return { balance: '0', received: '0', sent: '0', txCount: 150 };
  }
  throw new Error(`Unmapped request: ${url.origin}${url.pathname}`);
}

for (const browserName of selectedBrowsers) {
  const engine = { chromium, firefox }[browserName];
  assert.ok(engine, `Unknown browser: ${browserName}`);
  let browser;
  try { browser = await engine.launch({ headless: process.env.HEADED !== '1' }); }
  catch (error) { report.runs.push({ browser: browserName, passed: false, error: String(error) }); save(); continue; }
  try {
    for (const profile of Object.values(BUILD_PROFILES)) {
      for (const toolId of ['key-derivation', 'activity-viewer', 'discovery-scanner']) {
        const tool = getToolBuild(profile, toolId);
        const artifact = resolve(root, 'dist', tool.artifactRelativePath);
        const run = { browser: browserName, browserVersion: browser.version(), profile: profile.id, tool: toolId, artifact, passed: false, errors: [], console: [], requests: [], unexpectedRequests: [], checks: [] };
        report.runs.push(run);
        // Use a fresh context without Playwright's serviceWorkers:'block' init script.
        // That script reads navigator.serviceWorker and throws in an opaque sandbox.
        // File-origin/CSP restrictions stay intact; all HTTP is still intercepted below.
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        page.on('pageerror', error => run.errors.push(String(error)));
        page.on('console', message => run.console.push({ type: message.type(), text: message.text() }));
        await context.route(/^https?:\/\//u, async route => {
          const request = route.request();
          run.requests.push({ url: request.url(), method: request.method(), body: request.postData() });
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
            await scope.locator('#watch-only-keys').fill(`${pubkey}\n${pubkey}`);
            assert.equal(await scope.locator('#seed-source-panel').isVisible(), false);
            assert.equal(await scope.locator('.public-key-scope').isVisible(), true);
            await scope.locator('#recovery-network').selectOption('testnet');
            await scope.locator('#clear-recovery').click();
            assert.equal(await scope.locator('#watch-only-keys').inputValue(), '');
            run.checks.push('Seed batch/public-key batch tabs, testnet selection, scope warning and Clear');
          } else if (toolId === 'key-derivation') {
            await page.locator('#crypto-self-test-status.passed').waitFor();
            assert.equal(await page.locator('#standard-path-details').isVisible(), true);
            assert.equal(await page.locator('#standard-path-details input').count(), 0);
            assert.ok((await page.locator('#standard-path-details').innerText()).includes('Selected scheme'));
            run.checks.push('Read-only standard scheme parameters and canonical path preview');
            if (profile.id === 'multi-chain') assert.equal(await page.locator('#coin').inputValue(), 'bitcoin');
            await page.locator('#mnemonic').fill(phrase);
            await page.locator('#count').fill('1');
            await page.locator('#derive-button').click();
            await page.locator('#results').waitFor({ state: 'visible' });
            assert.equal(await page.locator('#account-descriptor-export').isVisible(), true);
            assert.equal(await page.locator('#download-private-descriptors').isDisabled(), true);
            assert.equal(await page.locator('#copy-public-descriptors').isEnabled(), true);
            assert.equal(await page.locator('#account-descriptor-export').evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('.results-title')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
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
          } else {
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

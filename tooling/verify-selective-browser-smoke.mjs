import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadPlaywright } from './playwright-loader.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), 'ckd-selective-browser-'));
const variants = [
  ...['bitcoin', 'ethereum'].map((coin) => ({
    id: `activity-${coin}`,
    script: 'apps/activity-viewer/scripts/build-activity-viewer-html.mjs',
    args: ['--coins', coin],
    selfTest: '#viewer-crypto-self-test-status.pass, #viewer-crypto-self-test-status.passed',
    fingerprint: '#viewer-build-fingerprint',
    inspect: async (page) => {
      assert.deepEqual(await page.locator('#viewer-coin option').allTextContents(), [
        coin === 'bitcoin' ? 'Bitcoin' : 'Ethereum',
      ]);
    },
  })),
  {
    id: 'discovery-seed-without-custom-paths',
    script: 'apps/discovery-scanner/scripts/build-discovery-scanner-html.mjs',
    args: ['--coins', 'bitcoin', '--features', 'seed-discovery'],
    selfTest: '#recovery-crypto-self-test-status.passed',
    fingerprint: '#recovery-build-fingerprint',
    frame: '#recovery-secret-vault',
    inspect: async (scope, page) => {
      assert.equal(await scope.locator('#custom-path-options:visible').count(), 0);
      await page.locator('#recovery-secret-vault').evaluate((frame) => {
        if (!(frame instanceof HTMLIFrameElement)) throw new Error('Recovery boundary iframe is missing.');
        if (frame.getBoundingClientRect().height < 500)
          throw new Error('Recovery boundary did not resize to its content.');
      });
    },
  },
  {
    id: 'discovery-watch-only',
    script: 'apps/discovery-scanner/scripts/build-discovery-scanner-html.mjs',
    args: ['--coins', 'bitcoin', '--features', 'watch-only-discovery'],
    selfTest: '#recovery-crypto-self-test-status.passed',
    fingerprint: '#recovery-build-fingerprint',
    frame: '#recovery-secret-vault',
    inspect: async (scope) => {
      assert.equal(await scope.locator('#recovery-crypto-self-test-status').textContent(), 'Boundary self-test passed');
      assert.equal(await scope.locator('#seed-source-panel').count(), 0);
    },
  },
  {
    id: 'deriver-minimal-recovery',
    script: 'apps/key-derivation/scripts/build-key-derivation-html.mjs',
    args: ['--coins', 'bitcoin', '--features', 'derive,sskr,gordian-envelope'],
    selfTest: '#crypto-self-test-status.passed',
    fingerprint: '#build-fingerprint',
    inspect: async (page) => {
      assert.equal(await page.locator('#sskr-panel').count(), 1);
      assert.equal(await page.locator('#slip39-panel').count(), 0);
    },
  },
].map((variant) => ({ ...variant, path: resolve(temporary, `${variant.id}.html`) }));

const run = (script, args) => {
  const result = spawnSync(process.execPath, [resolve(root, script), ...args], { cwd: root, stdio: 'inherit' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(`Selective build failed with status ${result.status}.`);
};

try {
  for (const variant of variants) {
    run(variant.script, ['--profile', 'multi-chain', ...variant.args, '--output', variant.path]);
  }
  const { chromium, firefox } = await loadPlaywright();
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch({
      headless: true,
      executablePath: process.env[`${name.toUpperCase()}_EXECUTABLE_PATH`],
    });
    try {
      for (const variant of variants) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(pathToFileURL(variant.path).href);
        const scope = variant.frame === undefined ? page : page.frameLocator(variant.frame);
        try {
          await scope.locator(variant.selfTest).waitFor({ timeout: 120_000 });
        } catch (cause) {
          const status = await scope
            .locator(variant.selfTest.split('.')[0])
            .first()
            .textContent()
            .catch(() => null);
          throw new Error(
            `${name}/${variant.id} did not pass its startup check. Status: ${status ?? 'missing'}. Page errors: ${errors.join('; ') || 'none'}`,
            { cause },
          );
        }
        assert.equal(await scope.locator(variant.fingerprint).count(), 1);
        await variant.inspect(scope, page);
        assert.deepEqual(errors, [], `${name}/${variant.id}: ${errors.join('; ')}`);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  console.log(`Selective browser smoke passed: ${variants.length * 2}/${variants.length * 2}.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadPlaywright } from './playwright-loader.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), 'ckd-selective-browser-'));
const variants = ['bitcoin', 'ethereum'].map((coin) => ({ coin, path: resolve(temporary, `${coin}-viewer.html`) }));
const run = (script, args) => {
  const result = spawnSync(process.execPath, [resolve(root, script), ...args], { cwd: root, stdio: 'inherit' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(`Selective build failed with status ${result.status}.`);
};

try {
  for (const variant of variants) {
    run('apps/activity-viewer/scripts/build-activity-viewer-html.mjs', [
      '--profile',
      'multi-chain',
      '--coins',
      variant.coin,
      '--output',
      variant.path,
    ]);
  }
  const { chromium, firefox } = await loadPlaywright();
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const variant of variants) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(pathToFileURL(variant.path).href);
        await page
          .locator('#viewer-crypto-self-test-status.pass, #viewer-crypto-self-test-status.passed')
          .waitFor({ timeout: 120_000 });
        assert.equal(await page.locator('#viewer-build-fingerprint').count(), 1);
        assert.deepEqual(await page.locator('#viewer-coin option').allTextContents(), [
          variant.coin === 'bitcoin' ? 'Bitcoin' : 'Ethereum',
        ]);
        assert.deepEqual(errors, [], `${name}/${variant.coin}: ${errors.join('; ')}`);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  console.log('Selective Activity Viewer browser smoke passed: 4/4.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

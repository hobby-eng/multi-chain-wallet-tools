import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'dash-community-self-test-'));
const output = join(temporaryDirectory, 'self-test.mjs');

try {
  await build({
    entryPoints: [resolve(root, 'packages/verification/src/derivation-self-test-dash.ts')],
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'node',
    loader: { '.wasm': 'binary' },
    logLevel: 'silent',
  });
  if (typeof Uint8Array.fromBase64 !== 'function') {
    Uint8Array.fromBase64 = (value) => new Uint8Array(Buffer.from(value, 'base64'));
  }
  const module = await import(`${pathToFileURL(output).href}?run=${Date.now()}`);
  const report = await module.runDashDerivationSelfTest();
  const expectedChecks = [
    'Dash Core / BIP44',
    'Dash Core testnet / BIP44',
    'Dash Platform / DIP17',
    'Dash Platform testnet / DIP17',
    'Dash master/account extended-key integrity',
    'Dash Identity mainnet / DIP13',
    'Dash Identity testnet / DIP13',
    'Dash Orchard testnet / ZIP32',
    'Dash Orchard mainnet / ZIP32',
  ];
  if (report?.passed !== true || !Array.isArray(report.checks)) {
    throw new Error('Dash Community startup self-test returned an incomplete report.');
  }
  const missing = expectedChecks.filter((check) => !report.checks.includes(check));
  if (missing.length > 0 || report.checks.length !== expectedChecks.length) {
    throw new Error(`Dash Community startup self-test vector set changed: missing ${missing.join(', ') || 'none'}.`);
  }
  console.log(`Verified Dash Community startup self-test: ${report.checks.join(' · ')} (${report.durationMs} ms)`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

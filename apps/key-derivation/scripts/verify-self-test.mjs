import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'derivationtool-self-test-'));
const output = join(temporaryDirectory, 'self-test.mjs');

try {
  await build({
    entryPoints: [resolve(root, 'packages/verification/src/self-test.ts')],
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
  const report = await module.runCryptoSelfTest();
  // Naming the required checks instead of counting them means a silently
  // dropped or renamed vector fails the release, and the failure says which.
  const expectedChecks = [
    'BIP39',
    'Bitcoin Taproot / BIP86',
    'Bitcoin testnet / BIP49',
    'Bitcoin maximum child index',
    'Ethereum / EIP55',
    'Dash Core / BIP44',
    'Dash Core testnet / BIP44',
    'Dash Platform / DIP17',
    'Dash Platform testnet / DIP17',
    'Dash Identity mainnet / DIP13',
    'Dash Identity testnet / DIP13',
    'Master/account extended-key integrity',
    'Dash Orchard testnet / ZIP32',
    'Dash Orchard mainnet / ZIP32',
  ];
  if (report?.passed !== true || !Array.isArray(report.checks)) {
    throw new Error('Startup cryptographic self-test returned an incomplete report.');
  }
  const missing = expectedChecks.filter((check) => !report.checks.includes(check));
  if (missing.length > 0) {
    throw new Error(`Startup cryptographic self-test is missing: ${missing.join(', ')}.`);
  }
  if (report.checks.length !== expectedChecks.length) {
    throw new Error(
      `Startup cryptographic self-test reported ${report.checks.length} checks; expected ${expectedChecks.length}. `
      + 'Add a new vector to the expected list deliberately.',
    );
  }
  console.log(`Verified startup cryptographic self-test: ${report.checks.join(' · ')} (${report.durationMs} ms)`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

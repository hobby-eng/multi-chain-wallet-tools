import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const network = process.argv[2] ?? 'mainnet';
if (network !== 'mainnet' && network !== 'testnet') {
  throw new Error('DashScan smoke argument must be mainnet or testnet.');
}
const knownAddress = network === 'mainnet'
  ? 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
  : 'yPJr631fij5bHLpjMZgwK5hHCsHurSMhCB';
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'derivationtool-dashscan-smoke-'));
const output = join(temporaryDirectory, 'public-address.mjs');

try {
  await build({
    entryPoints: [resolve(root, 'packages/dash-network/src/public-address.ts')],
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  const module = await import(`${pathToFileURL(output).href}?run=${Date.now()}`);
  const startedAt = performance.now();
  const snapshot = await module.queryCoreAddress(knownAddress, network, 2);
  if (snapshot.provider !== 'DashScan' || snapshot.indexStatus !== 'ok') {
    throw new Error('DashScan smoke did not return a synchronized provider snapshot.');
  }
  if (snapshot.indexedHeight < 1 || snapshot.indexedTimeMs < 1 || snapshot.transactions.length !== 2) {
    throw new Error('DashScan smoke returned incomplete tip or transaction data.');
  }
  console.log(
    `Live DashScan ${network} smoke passed: Core height ${snapshot.indexedHeight}; `
      + `${snapshot.transactionCount} transactions reported; ${snapshot.transactions.length} loaded; `
      + `${snapshot.requests} requests; ${Math.round(performance.now() - startedAt)} ms.`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

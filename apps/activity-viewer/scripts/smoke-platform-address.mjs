import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { EvoSDK } from '@dashevo/evo-sdk';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const network = process.argv[2] ?? 'mainnet';
if (network !== 'mainnet' && network !== 'testnet') {
  throw new Error('Platform Explorer smoke argument must be mainnet or testnet.');
}
const knownAddress = network === 'mainnet'
  ? 'dash1kzpkh894d6xxqldkflqk9kac06scjk7emup08hdj'
  : 'tdash1krstjne0t2sd2gt4w047jw0kv5qwfs4wf5npref0';
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'derivationtool-platform-explorer-smoke-'));
const output = join(temporaryDirectory, 'platform-address-history.mjs');

try {
  await build({
    entryPoints: [resolve(root, 'packages/dash-network/src/platform-address-history.ts')],
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  const module = await import(`${pathToFileURL(output).href}?run=${Date.now()}`);
  const startedAt = performance.now();
  const snapshot = await module.queryPlatformAddressHistory(knownAddress, network, 2);
  if (snapshot.provider !== 'Dash Platform Explorer' || snapshot.indexStatus !== 'synced') {
    throw new Error('Platform Explorer smoke did not return a synchronized provider snapshot.');
  }
  if (snapshot.indexedHeight < 1 || snapshot.indexedTimeMs < 1 || snapshot.transitions.length < 1) {
    throw new Error('Platform Explorer smoke returned incomplete tip or transition data.');
  }
  const sdk = network === 'mainnet'
    ? EvoSDK.mainnetTrusted({ settings: { connectTimeoutMs: 10_000, timeoutMs: 30_000, retries: 3 } })
    : EvoSDK.testnetTrusted({ settings: { connectTimeoutMs: 10_000, timeoutMs: 30_000, retries: 3 } });
  await sdk.connect();
  const verified = await sdk.addresses.getWithProof(knownAddress);
  const info = verified.data;
  const metadata = verified.metadata;
  try {
    if (info === undefined) throw new Error('DAPI proof did not contain the known Platform address.');
    if (info.balance !== snapshot.explorerBalanceCredits || info.nonce !== BigInt(snapshot.explorerNonce)) {
      throw new Error('Platform Explorer balance/nonce do not match the DAPI proof.');
    }
  console.log(
    `Live Platform Explorer ${network} smoke passed: Platform height ${snapshot.indexedHeight}; `
      + `${snapshot.totalTransitions} transitions reported; ${snapshot.transitions.length} loaded; `
      + `DAPI proof height ${metadata.height}; balance/nonce agree; `
      + `${snapshot.requests} Explorer requests; ${Math.round(performance.now() - startedAt)} ms.`,
  );
  } finally {
    info?.free();
    metadata.free();
    verified.free();
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

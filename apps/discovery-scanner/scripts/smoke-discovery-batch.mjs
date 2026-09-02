import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const network = process.argv[2] ?? 'mainnet';
if (network !== 'mainnet' && network !== 'testnet') {
  throw new Error('Recovery batch smoke argument must be mainnet or testnet.');
}
const phraseCount = Number(process.argv[3] ?? 2);
const scanShielded = process.argv[4] === 'shielded';
const phraseConcurrency = Number(process.argv[5] ?? 1);
if (!Number.isSafeInteger(phraseCount) || phraseCount < 1 || phraseCount > 5) {
  throw new Error('Recovery batch smoke phrase count must be an integer from 1 to 5.');
}
if (!Number.isSafeInteger(phraseConcurrency) || phraseConcurrency < 1 || phraseConcurrency > 5) {
  throw new Error('Recovery batch smoke concurrency must be an integer from 1 to 5.');
}

// Public BIP39 vector, duplicated intentionally to exercise ordered wallet
// isolation and the shared Orchard stream without user secrets. Sequential is
// the production UI default; pass a fifth argument to exercise concurrency.
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'wallet-discovery-batch-smoke-'));
const output = join(temporaryDirectory, 'wallet-discovery-batch.mjs');

try {
  await build({
    stdin: {
      contents: `
        import { DASH_RECOVERY_ADAPTER } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/coins/dash/index.ts'))};
        import { RecoveryConcurrencyLimiter, mapRecoveryTasks } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/concurrency.ts'))};
        import { DirectRecoveryNetworkService } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/network-service.ts'))};
        export { DASH_RECOVERY_ADAPTER, RecoveryConcurrencyLimiter, mapRecoveryTasks, DirectRecoveryNetworkService };
      `,
      loader: 'ts',
      resolveDir: root,
    },
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    loader: { '.wasm': 'binary' },
    logLevel: 'silent',
  });
  const module = await import(`${pathToFileURL(output).href}?run=${Date.now()}`);
  const limiter = new module.RecoveryConcurrencyLimiter(5);
  const networkApi = new module.DirectRecoveryNetworkService();
  const inputs = Array.from({ length: phraseCount }, (_, index) => index + 1).map((number) => ({
    id: `public-vector-${number}`,
    label: `Public vector #${number}`,
    mnemonic,
    passphrase: '',
  }));
  const startedAt = performance.now();
  const config = {
    network,
    account: 0,
    coreReceiveCount: 1,
    coreChangeCount: 0,
    platformAddressCount: 1,
    identityStartIndex: 0,
    identityGapLimit: 20,
    identityScanLimit: 20,
    includeUsedZeroBalance: false,
    scanShieldedPool: scanShielded,
  };
  const context = {
    signal: new AbortController().signal,
    networkApi,
    networkLimiter: limiter,
    onProgress: () => {},
    onFinding: () => {},
  };
  const preparedSections = scanShielded
    ? module.DASH_RECOVERY_ADAPTER.prepareBatch(inputs, config, context)
    : undefined;
  const results = await module.mapRecoveryTasks(inputs, phraseConcurrency, (input) => module.DASH_RECOVERY_ADAPTER.scan(
    input,
    config,
    { ...context, ...(preparedSections === undefined ? {} : { preparedSections }) },
  ));
  const summaries = results.map((result, index) => {
    if (result === undefined) throw new Error(`Batch result ${index + 1} is missing.`);
    const identity = result.sections.find(({ id }) => id === 'identity');
    if (identity === undefined || identity.state !== 'complete') {
      throw new Error(`Batch identity ${index + 1} failed: ${identity?.warning ?? 'missing section'}`);
    }
    const shielded = result.sections.find(({ id }) => id === 'shielded');
    if (scanShielded && shielded?.state !== 'complete') {
      throw new Error(`Batch Orchard ${index + 1} failed: ${shielded?.warning ?? 'missing section'}`);
    }
    return identity.metrics
      .filter(({ label }) => ['Indexes checked', 'Proof queries', 'Identity scan time', 'DAPI average / max'].includes(label))
      .map(({ label, value }) => `${label} ${value}`)
      .join(', ');
  });
  console.log(`Live recovery ${network} ${phraseCount}-seed batch at phrase concurrency ${phraseConcurrency}${scanShielded ? ' with shared Orchard stream' : ''} passed in ${Math.round(performance.now() - startedAt)} ms.`);
  summaries.forEach((summary, index) => console.log(`Phrase ${index + 1}: ${summary}`));
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

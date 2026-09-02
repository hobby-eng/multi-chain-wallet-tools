import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const network = process.argv[2] ?? 'testnet';
if (network !== 'mainnet' && network !== 'testnet') {
  throw new Error('Recovery smoke argument must be mainnet or testnet.');
}

// Public BIP39 vector. It is intentionally not a user wallet and must never receive funds.
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'wallet-discovery-smoke-'));
const output = join(temporaryDirectory, 'wallet-discovery-scanner.mjs');

try {
  await build({
    stdin: {
      contents: `
        import { DASH_RECOVERY_ADAPTER } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/coins/dash/index.ts'))};
        import { DirectRecoveryNetworkService } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/network-service.ts'))};
        export { DASH_RECOVERY_ADAPTER, DirectRecoveryNetworkService };
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
  const networkApi = new module.DirectRecoveryNetworkService();
  const progress = [];
  const startedAt = performance.now();
  const result = await module.DASH_RECOVERY_ADAPTER.scan(
    { id: 'public-vector', label: 'Public BIP39 vector', mnemonic, passphrase: '' },
    {
      network,
      account: 0,
      coreReceiveCount: 2,
      coreChangeCount: 2,
      platformAddressCount: 2,
      identityStartIndex: 0,
      identityGapLimit: 1,
      identityScanLimit: 1,
      includeUsedZeroBalance: false,
      scanShieldedPool: false,
    },
    {
      signal: new AbortController().signal,
      networkApi,
      onProgress: (item) => progress.push(item),
      onFinding: () => {},
    },
  );
  const byId = new Map(result.sections.map((section) => [section.id, section]));
  for (const id of ['core', 'platform', 'identity']) {
    const section = byId.get(id);
    if (section === undefined || section.state === 'failed') {
      throw new Error(`Recovery ${id} smoke failed: ${section?.warning ?? 'missing section'}`);
    }
  }
  if (Number(byId.get('core')?.scanned ?? 0) < 4 || Number(byId.get('platform')?.scanned ?? 0) < 2) {
    throw new Error('Recovery smoke did not scan at least the requested minimum address counts.');
  }
  if (byId.get('shielded')?.state !== 'skipped' || progress.length < 3) {
    throw new Error('Recovery smoke did not preserve disabled Orchard state or progress reporting.');
  }
  const knownAddress = network === 'mainnet'
    ? 'dash1kzpkh894d6xxqldkflqk9kac06scjk7emup08hdj'
    : 'tdash1krstjne0t2sd2gt4w047jw0kv5qwfs4wf5npref0';
  const addressResponse = await networkApi.platformAddresses(network, [knownAddress]);
  const entries = addressResponse.entries;
  if (
    entries.length !== 1
    || entries[0][0] === knownAddress
    || !/^00[0-9a-f]{40}$/u.test(entries[0][0])
    || entries[0][1] == null
    || BigInt(entries[0][1].balance) <= 0n
  ) {
    throw new Error('Recovery smoke did not observe the expected internal Platform Map key and funded value.');
  }
  console.log(
    `Live recovery ${network} smoke passed: Core ${byId.get('core')?.scanned}; Platform ${byId.get('platform')?.scanned}; identity ${byId.get('identity')?.scanned}; funded Platform Map shape; `
      + `${progress.length} progress events; ${Math.round(performance.now() - startedAt)} ms.`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

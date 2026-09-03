import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'derivationtool-orchard-stream-'));
const output = join(temporaryDirectory, 'verify-stream.mjs');

try {
  await build({
    stdin: {
      contents: `
        export { scanDashShieldedBatch } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/coins/dash/shielded-scanner.ts'))};
        export { isTerminalShieldedPage, runShieldedPageStream } from ${JSON.stringify(resolve(root, 'packages/dash-network/src/shielded-stream-policy.ts'))};
        export { RecoveryConcurrencyLimiter } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/concurrency.ts'))};
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
  if (module.isTerminalShieldedPage(0) !== true || module.isTerminalShieldedPage(1) !== false || module.isTerminalShieldedPage(2047) !== false) {
    throw new Error('Orchard stream must require an explicit empty page after a short non-empty page.');
  }
  const positions = [];
  const counts = [1634, 2, 0, 0];
  const loopOutcome = await module.runShieldedPageStream({
    fetchPage: async (position) => {
      positions.push(position);
      return { count: counts.shift() ?? 0 };
    },
    noteCount: (page) => page.count,
    onPage: () => {},
    disposePage: () => {},
  });
  if (
    positions.map(String).join(',') !== '0,2048,4096,4096'
    || loopOutcome.complete !== true
    || loopOutcome.pageCount !== 4
  ) {
    throw new Error('Orchard stream driver did not preserve aligned cursors and repeated-empty completion.');
  }
  let pageRequests = 0;
  const unavailable = async () => { throw new Error('Unexpected network operation in Orchard stream test.'); };
  const networkApi = {
    ping: unavailable,
    coreStatus: unavailable,
    coreTip: unavailable,
    coreAddressInfo: unavailable,
    coreOfficialStatus: unavailable,
    coreOfficialUtxos: unavailable,
    coreAddressHistory: unavailable,
    platformAddresses: unavailable,
    platformAddressHistory: unavailable,
    platformIdentityByPublicKeyHash: unavailable,
    platformIdentityHistory: unavailable,
    shieldedPage: async () => {
      pageRequests += 1;
      return {
        notes: [],
        metadata: { height: '426137', coreChainLockedHeight: 2_500_000, protocolVersion: 13, timeMs: '1' },
      };
    },
  };
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const inputs = [1, 2, 3].map((number) => ({
    id: `seed-${number}`,
    label: `Public vector #${number}`,
    mnemonic,
    passphrase: '',
  }));
  const sections = await module.scanDashShieldedBatch(inputs, {
    network: 'mainnet', account: 0,
    coreReceiveCount: 1, coreChangeCount: 0, platformAddressCount: 0,
    identityStartIndex: 0, identityGapLimit: 1, identityScanLimit: 1,
    includeUsedZeroBalance: false, scanShieldedPool: true,
  }, {
    signal: new AbortController().signal,
    networkApi,
    networkLimiter: new module.RecoveryConcurrencyLimiter(2),
    onProgress: () => {},
    onFinding: () => {},
  });
  if (pageRequests !== 2 || sections.size !== inputs.length) {
    throw new Error(`Orchard batch stream expected two matching empty proof pages and ${inputs.length} ledgers; received ${pageRequests} and ${sections.size}.`);
  }
  for (const input of inputs) {
    const section = sections.get(input.id);
    if (section?.state !== 'complete' || !section.proof.includes('bounded-memory page stream shared')) {
      throw new Error(`Orchard batch stream omitted a complete independent section for ${input.id}.`);
    }
  }
  console.log('Verified one-pass bounded-memory Orchard stream, aligned chunk cursors, repeated-empty termination, and the hard page ceiling across three independent FVK ledgers.');
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

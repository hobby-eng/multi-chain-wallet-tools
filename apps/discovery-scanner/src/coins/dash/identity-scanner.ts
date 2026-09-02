import { rootFromSeed } from '@ckd/core/bip32.js';
import { bytesToHex, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { deriveDashIdentityAuthenticationKey } from '@ckd/coins/dash/identity.js';
import type { RecoveryFinding, RecoveryProgress, RecoveryScanConfig, RecoverySection } from '../../types.js';
import { DashPlatformClient } from './platform-client.js';
import { exactSafeInteger, exactUnsigned, formatDashFromCredits, object } from './util.js';

const IDENTITY_QUERY_CONCURRENCY = 5;
const IDENTITY_PROGRESS_HEARTBEAT_MS = 2_000;

interface IdentityView {
  identifier: string;
  balance: bigint;
  revision: bigint;
}

interface IdentityIndexResult {
  identityIndex: number;
  path: string;
  publicKeyHashHex: string;
  identities: IdentityView[];
  proofHeight: bigint;
  protocolVersion: number;
  proofQueries: number;
  dapiDurationsMs: number[];
}

async function awaitIdentityBatch(
  task: Promise<IdentityIndexResult[]>,
  inputId: string,
  scanned: number,
  total: number,
  batchSize: number,
  client: DashPlatformClient,
  scanStartedAt: number,
  onProgress: (progress: RecoveryProgress) => void,
): Promise<IdentityIndexResult[]> {
  const heartbeat = setInterval(() => {
    const completedLookups = client.gateway.operationStats(['platform.identity-by-public-key-hash']).count;
    onProgress({
      inputId,
      section: 'identity',
      message: `Waiting for the current ${batchSize}-index DAPI proof batch · ${completedLookups} isolated lookup responses completed · ${((Date.now() - scanStartedAt) / 1_000).toFixed(1)} s elapsed · SDK timeout/retry active`,
      completed: scanned,
      total,
    });
  }, IDENTITY_PROGRESS_HEARTBEAT_MS);
  try {
    return await task;
  } finally {
    clearInterval(heartbeat);
  }
}

function validateIdentityLookup(
  value: Awaited<ReturnType<DashPlatformClient['identity']>>,
): Omit<IdentityIndexResult, 'identityIndex' | 'path' | 'publicKeyHashHex'> {
  const response = object(value, 'Isolated identity response');
  if (!Array.isArray(response.identities) || response.identities.length > 1_000) {
    throw new Error('Isolated identity response contained an invalid identity list.');
  }
  const identities: IdentityView[] = response.identities.map((raw) => {
    const identity = object(raw, 'Isolated identity item');
    if (typeof identity.identifier !== 'string' || !/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{20,64}$/u.test(identity.identifier)) {
      throw new Error('Isolated identity response contained an invalid identifier.');
    }
    return {
      identifier: identity.identifier,
      balance: exactUnsigned(identity.balance, 'Identity balance'),
      revision: exactUnsigned(identity.revision, 'Identity revision'),
    };
  });
  const metadata = object(response.metadata, 'Isolated identity proof metadata');
  const proofQueries = exactSafeInteger(response.proofQueries, 'Identity proof-query count');
  if (proofQueries !== 1 && proofQueries !== 2) throw new Error('Identity proof-query count must be one or two.');
  if (!Array.isArray(response.dapiDurationsMs) || response.dapiDurationsMs.length !== proofQueries) {
    throw new Error('Isolated identity response returned inconsistent timing information.');
  }
  const dapiDurationsMs = response.dapiDurationsMs.map((duration) => {
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 || duration > 300_000) {
      throw new Error('Isolated identity response contained an invalid DAPI duration.');
    }
    return duration;
  });
  return {
    identities,
    proofHeight: exactUnsigned(metadata.height, 'Identity proof height'),
    protocolVersion: exactSafeInteger(metadata.protocolVersion, 'Identity protocol version'),
    proofQueries,
    dapiDurationsMs,
  };
}

async function queryIdentityIndex(
  root: ReturnType<typeof rootFromSeed>,
  client: DashPlatformClient,
  networkName: RecoveryScanConfig['network'],
  identityIndex: number,
  signal: AbortSignal,
): Promise<IdentityIndexResult> {
  if (signal.aborted) throw new DOMException('Identity scan cancelled.', 'AbortError');
  const derived = deriveDashIdentityAuthenticationKey(root, networkName, identityIndex);
  try {
    const publicKeyHashHex = bytesToHex(derived.publicKeyHash);
    const result = validateIdentityLookup(await client.identity(publicKeyHashHex, signal));
    return {
      identityIndex,
      path: derived.path,
      publicKeyHashHex,
      ...result,
    };
  } finally {
    wipe(derived.privateKey, derived.publicKey, derived.publicKeyHash);
  }
}

export async function scanDashIdentities(
  inputId: string,
  seed: Uint8Array,
  config: RecoveryScanConfig,
  client: DashPlatformClient,
  signal: AbortSignal,
  onProgress: (progress: RecoveryProgress) => void,
  onFinding: (finding: RecoveryFinding) => void,
): Promise<RecoverySection> {
  const network = getDashNetwork(config.network);
  const root = rootFromSeed(seed, network.versions);
  const findings: RecoveryFinding[] = [];
  const seen = new Set<string>();
  let totalBalance = 0n;
  let proofHeight = 0n;
  let protocolVersion = 0;
  let consecutiveEmpty = 0;
  let scanned = 0;
  let proofQueries = 0;
  const dapiDurationsMs: number[] = [];
  const scanStartedAt = Date.now();
  try {
    while (scanned < config.identityScanLimit && consecutiveEmpty < config.identityGapLimit) {
      if (signal.aborted) throw new DOMException('Identity scan cancelled.', 'AbortError');
      const batchSize = Math.min(
        IDENTITY_QUERY_CONCURRENCY,
        config.identityScanLimit - scanned,
        config.identityGapLimit - consecutiveEmpty,
      );
      const batch = await awaitIdentityBatch(
        Promise.all(Array.from({ length: batchSize }, (_, offset) => queryIdentityIndex(
          root,
          client,
          config.network,
          config.identityStartIndex + scanned + offset,
          signal,
        ))),
        inputId,
        scanned,
        config.identityScanLimit,
        batchSize,
        client,
        scanStartedAt,
        onProgress,
      );
      if (signal.aborted) throw new DOMException('Identity scan cancelled.', 'AbortError');
      for (const result of batch) {
        proofQueries += result.proofQueries;
        dapiDurationsMs.push(...result.dapiDurationsMs);
        proofHeight = proofHeight > result.proofHeight ? proofHeight : result.proofHeight;
        protocolVersion = Math.max(protocolVersion, result.protocolVersion);
        if (result.identities.length === 0) {
          consecutiveEmpty += 1;
        } else {
          consecutiveEmpty = 0;
          for (const identity of result.identities) {
            if (seen.has(identity.identifier)) continue;
            seen.add(identity.identifier);
            totalBalance += identity.balance;
            const finding: RecoveryFinding = {
              id: `identity:${identity.identifier}`,
              title: identity.identifier,
              subtitle: `Identity discovered at local index ${result.identityIndex}`,
              balanceAtomic: identity.balance,
              balanceLabel: formatDashFromCredits(identity.balance),
              fields: [
                { label: 'Identity derivation path', value: result.path, copyable: true },
                { label: 'Identity index', value: String(result.identityIndex) },
                { label: 'Matched public-key hash', value: result.publicKeyHashHex, copyable: true },
                { label: 'Identity revision', value: identity.revision.toString() },
              ],
            };
            findings.push(finding);
            onFinding(finding);
          }
        }
        scanned += 1;
        onProgress({
          inputId,
          section: 'identity',
          message: `Checked ${scanned} identity index${scanned === 1 ? '' : 'es'} · ${proofQueries} proof queries · empty gap ${consecutiveEmpty}/${config.identityGapLimit} · ${((Date.now() - scanStartedAt) / 1_000).toFixed(1)} s elapsed`,
          completed: scanned,
          total: config.identityScanLimit,
        });
      }
    }
  } finally {
    root.wipePrivateData();
  }

  const endedByGap = consecutiveEmpty >= config.identityGapLimit;
  const elapsedMs = Date.now() - scanStartedAt;
  const providerTotalMs = dapiDurationsMs.reduce((sum, duration) => sum + duration, 0);
  const providerAverageMs = dapiDurationsMs.length === 0 ? 0 : providerTotalMs / dapiDurationsMs.length;
  const providerMaxMs = dapiDurationsMs.length === 0 ? 0 : Math.max(...dapiDurationsMs);
  return {
    id: 'identity',
    title: 'Dash Platform identities',
    description: 'DIP13 identity authentication keys are derived locally; only public-key hashes are queried through proof-verified DAPI.',
    state: endedByGap ? 'complete' : 'partial',
    metrics: [
      { label: 'Identity balance', value: formatDashFromCredits(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
      { label: 'Identities found', value: String(findings.length) },
      { label: 'Indexes checked', value: String(scanned) },
      { label: 'Final empty gap', value: `${consecutiveEmpty}/${config.identityGapLimit}` },
      { label: 'Proof queries', value: String(proofQueries) },
      { label: 'Identity scan time', value: `${(elapsedMs / 1_000).toFixed(1)} s` },
      { label: 'DAPI average / max', value: `${providerAverageMs.toFixed(0)} / ${providerMaxMs.toFixed(0)} ms` },
    ],
    findings,
    scanned,
    source: 'Dash Platform DAPI · trusted quorum discovery',
    proof: `Proof verified at Platform height ${proofHeight} · protocol ${protocolVersion} · ${proofQueries} logical proof queries · DAPI average ${providerAverageMs.toFixed(0)} ms, max ${providerMaxMs.toFixed(0)} ms · concurrency ${IDENTITY_QUERY_CONCURRENCY}`,
    ...(endedByGap ? {} : { warning: 'The configured scan limit was reached before the identity gap limit. Increase the scan limit for an authoritative result.' }),
  };
}

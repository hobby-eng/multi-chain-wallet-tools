import { rootFromSeed, requirePublic } from '@ckd/core/bip32.js';
import { bytesToHex, hash160, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { encodePlatformP2pkh } from '@ckd/coins/dash/platform.js';
import type { RecoveryFinding, RecoveryProgress, RecoveryScanConfig, RecoverySection } from '../../types.js';
import { RECOVERY_PLATFORM_ADDRESS_BATCH } from '../../network-protocol.js';
import { DashPlatformClient } from './platform-client.js';
import { validatePlatformHistory } from './platform-history.js';
import { ADDRESS_DISCOVERY_GAP, exactSafeInteger, exactUnsigned, extendAddressTarget, formatDashFromCredits, object } from './util.js';

const DAPI_BATCH = RECOVERY_PLATFORM_ADDRESS_BATCH;

interface DerivedPlatformAddress {
  address: string;
  path: string;
  account: number;
  index: number;
  publicKeyHash: string;
  storageKey: string;
}

interface PlatformInfo {
  balance: bigint;
  nonce: bigint;
}

function validateBatch(
  value: Awaited<ReturnType<DashPlatformClient['addresses']>>,
): { data: Map<string, PlatformInfo | null>; height: bigint; protocolVersion: number } {
  const response = object(value, 'Isolated Platform address response');
  if (!Array.isArray(response.entries)) throw new Error('Isolated Platform address response omitted its entry list.');
  const data = new Map<string, PlatformInfo | null>();
  for (const rawEntry of response.entries) {
    if (!Array.isArray(rawEntry) || rawEntry.length !== 2 || typeof rawEntry[0] !== 'string' || !/^00[0-9a-f]{40}$/u.test(rawEntry[0])) {
      throw new Error('Isolated Platform address response contained an invalid storage key.');
    }
    if (data.has(rawEntry[0])) throw new Error('Isolated Platform address response contained a duplicate storage key.');
    if (rawEntry[1] === null) {
      data.set(rawEntry[0], null);
      continue;
    }
    const info = object(rawEntry[1], 'Isolated Platform address info');
    data.set(rawEntry[0], {
      balance: exactUnsigned(info.balance, 'Platform address balance'),
      nonce: exactUnsigned(info.nonce, 'Platform address nonce'),
    });
  }
  const metadata = object(response.metadata, 'Isolated Platform proof metadata');
  return {
    data,
    height: exactUnsigned(metadata.height, 'Platform proof height'),
    protocolVersion: exactSafeInteger(metadata.protocolVersion, 'Platform protocol version'),
  };
}

export async function scanDashPlatformAddresses(
  inputId: string,
  seed: Uint8Array,
  config: RecoveryScanConfig,
  client: DashPlatformClient,
  signal: AbortSignal,
  onProgress: (progress: RecoveryProgress) => void,
  onFinding: (finding: RecoveryFinding) => void,
): Promise<RecoverySection> {
  if (config.platformAddressCount === 0) {
    return {
      id: 'platform',
      title: 'Dash Platform addresses',
      description: 'DIP17 Platform payment address scan was disabled for this run.',
      state: 'skipped',
      metrics: [{ label: 'Addresses checked', value: '0' }],
      findings: [],
      scanned: 0,
      source: 'Local configuration',
      proof: 'No network request made',
    };
  }
  const findings: RecoveryFinding[] = [];
  let totalBalance = 0n;
  let proofHeight = 0n;
  let protocolVersion = 0;
  let target = config.platformAddressCount;
  let scanned = 0;
  let usedCount = 0;
  let fundedCount = 0;
  let historyDetailFailures = 0;
  let historyDetails = 0;
  let historyIndexedHeight = 0;
  let gapTruncated = false;
  const network = getDashNetwork(config.network);
  const root = rootFromSeed(seed, network.versions);
  const accountPath = `m/9'/${network.coinType}'/17'/${config.account}'/0'`;
  const account = root.derive(accountPath);
  try {
    for (let offset = 0; offset < target;) {
      if (signal.aborted) throw new DOMException('Platform address scan cancelled.', 'AbortError');
      const chunk: DerivedPlatformAddress[] = [];
      const end = Math.min(offset + DAPI_BATCH, target);
      for (let index = offset; index < end; index += 1) {
        const child = account.deriveChild(index);
        const path = `${accountPath}/${index}`;
        const publicKey = requirePublic(child, path);
        const publicKeyHash = hash160(publicKey);
        const publicKeyHashHex = bytesToHex(publicKeyHash);
        chunk.push({
          address: encodePlatformP2pkh(publicKeyHash, network.platformHrp),
          path,
          account: config.account,
          index,
          publicKeyHash: publicKeyHashHex,
          // Evo SDK getManyWithProof() keys its result Map by the canonical
          // internal Platform address payload, not by the Bech32m display text.
          storageKey: `00${publicKeyHashHex}`,
        });
        wipe(publicKey, publicKeyHash);
        child.wipePrivateData();
      }
      const publicAddresses = chunk.map(({ address }) => address);
      const response = validateBatch(await client.addresses(publicAddresses, signal));
      proofHeight = proofHeight > response.height ? proofHeight : response.height;
      protocolVersion = Math.max(protocolVersion, response.protocolVersion);
      const displayed: { derived: DerivedPlatformAddress; info: PlatformInfo }[] = [];
      for (const derived of chunk) {
        const info = response.data.get(derived.storageKey);
        if (info === undefined || info === null) continue;
        totalBalance += info.balance;
        const used = info.balance > 0n || info.nonce > 0n;
        if (!used) continue;
        const extension = extendAddressTarget(target, derived.index);
        target = extension.target;
        gapTruncated ||= extension.truncated;
        usedCount += 1;
        if (info.balance > 0n) fundedCount += 1;
        if (info.balance === 0n && !config.includeUsedZeroBalance) continue;
        displayed.push({ derived, info });
      }
      const histories = await Promise.all(displayed.map(async ({ derived, info }) => {
        try {
          return validatePlatformHistory(await client.addressHistory(derived.address, signal), derived.address, info.balance);
        } catch (cause) {
          if (signal.aborted) throw cause;
          historyDetailFailures += 1;
          return null;
        }
      }));
      for (let displayedIndex = 0; displayedIndex < displayed.length; displayedIndex += 1) {
        const { derived, info } = displayed[displayedIndex]!;
        const history = histories[displayedIndex] ?? null;
        if (history !== null) {
          historyDetails += 1;
          historyIndexedHeight = Math.max(historyIndexedHeight, history.indexedHeight);
        }
        const finding: RecoveryFinding = {
          id: `platform:${derived.index}`,
          title: derived.address,
          subtitle: `Platform payment address #${derived.index}`,
          balanceAtomic: info.balance,
          balanceLabel: formatDashFromCredits(info.balance),
          fields: [
            { label: 'DIP17 derivation path', value: derived.path, copyable: true },
            { label: 'Address index', value: String(derived.index) },
            { label: 'Outgoing nonce', value: info.nonce.toString() },
            ...(history === null ? [] : [
              { label: 'Transactions reported', value: String(history.transactionCount) },
              { label: 'Incoming credit events', value: String(history.incomingCount) },
              { label: 'Outgoing credit events', value: String(history.outgoingCount) },
              { label: 'Lifetime received', value: formatDashFromCredits(history.totalReceived) },
              { label: 'Lifetime sent', value: formatDashFromCredits(history.totalSent) },
              ...(history.firstSeen === null ? [] : [{ label: 'First seen', value: history.firstSeen }]),
              ...(history.lastSeen === null ? [] : [{ label: 'Last seen', value: history.lastSeen }]),
            ]),
            { label: 'Public-key hash', value: derived.publicKeyHash, copyable: true },
          ],
        };
        findings.push(finding);
        onFinding(finding);
      }
      scanned += chunk.length;
      offset = end;
      onProgress({
        inputId,
        section: 'platform',
        message: `Proof-checked ${scanned.toLocaleString()} of ${target.toLocaleString()} Platform addresses · maintaining a ${ADDRESS_DISCOVERY_GAP}-address empty gap`,
        completed: scanned,
        total: target,
      });
    }
  } finally {
    account.wipePrivateData();
    root.wipePrivateData();
  }

  return {
    id: 'platform',
    title: 'Dash Platform addresses',
    description: 'DIP17 payment addresses are derived locally and queried through proof-verified Platform DAPI batches.',
    state: 'complete',
    metrics: [
      { label: 'Address balance', value: formatDashFromCredits(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
      { label: 'Funded addresses', value: String(fundedCount) },
      { label: 'Previously used · empty', value: String(usedCount - fundedCount) },
      { label: 'Addresses checked', value: `${scanned} · minimum ${config.platformAddressCount}` },
      { label: 'History details', value: `${historyDetails}/${findings.length} enriched` },
    ],
    findings,
    scanned,
    source: 'Dash Platform DAPI · trusted quorum discovery; synchronized Platform Explorer · auxiliary history',
    proof: `Balance proof verified at Platform height ${proofHeight} · ${ADDRESS_DISCOVERY_GAP}-address post-use gap${historyIndexedHeight > 0 ? ` · history indexed through height ${historyIndexedHeight}` : ''}`,
    ...((gapTruncated || historyDetailFailures > 0) ? { warning: [
      ...(gapTruncated ? ['A used address was found too close to the end of the BIP32 index space to complete the 20-address safety gap.'] : []),
      ...(historyDetailFailures > 0 ? [`Historical details were unavailable or failed the DAPI balance cross-check for ${historyDetailFailures} displayed address${historyDetailFailures === 1 ? '' : 'es'}; proof-verified balances remain valid.`] : []),
    ].join(' ') } : {}),
  };
}

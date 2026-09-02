import { rootFromSeed, requirePublic } from '@ckd/core/bip32.js';
import { bytesToHex, encodeP2pkh, hash160, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { RecoveryNetworkGateway } from '../../network-gateway.js';
import { RECOVERY_CORE_ADDRESS_BATCH, RECOVERY_CORE_ENDPOINTS } from '../../network-protocol.js';
import type { RecoveryFinding, RecoveryProgress, RecoveryScanConfig, RecoverySection } from '../../types.js';
import { ADDRESS_DISCOVERY_GAP, exactSafeInteger, exactUnsigned, extendAddressTarget, formatDashFromDuffs, object } from './util.js';

// Keeps DashScan query URLs below conservative proxy/browser request-line
// limits while still amortizing network overhead.
const ADDRESS_CHUNK = RECOVERY_CORE_ADDRESS_BATCH;

interface DerivedCoreAddress {
  address: string;
  path: string;
  account: number;
  branch: number;
  index: number;
  publicKeyHash: string;
}

interface CoreHistorySummary {
  txCount: number;
  received: bigint;
  sent: bigint;
  firstSeen: string | null;
  lastSeen: string | null;
}

function optionalTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function validateHistory(value: unknown, expectedAddress: string): CoreHistorySummary {
  const history = object(value, 'DashScan address history summary');
  if (history.address !== expectedAddress) throw new Error('DashScan address history did not match the requested address.');
  return {
    txCount: exactSafeInteger(history.txCount, 'DashScan address history transaction count'),
    received: exactUnsigned(history.received, 'DashScan lifetime received amount'),
    sent: exactUnsigned(history.sent, 'DashScan lifetime sent amount'),
    firstSeen: optionalTimestamp(history.firstSeenBlockTimestamp),
    lastSeen: optionalTimestamp(history.lastSeenBlockTimestamp),
  };
}

function validateInfo(value: unknown, expected: DerivedCoreAddress[]): Array<{ balance: bigint; txCount: number }> {
  if (!Array.isArray(value) || value.length !== expected.length) {
    throw new Error('DashScan address batch did not preserve the requested result count.');
  }
  return value.map((item, index) => {
    const info = object(item, 'DashScan address batch');
    if (info.address !== expected[index]?.address) {
      throw new Error('DashScan address batch did not preserve the locally derived address order.');
    }
    return {
      balance: exactUnsigned(info.balance, 'DashScan address balance'),
      txCount: exactSafeInteger(info.txCount, 'DashScan address transaction count'),
    };
  });
}

export async function scanDashCore(
  inputId: string,
  seed: Uint8Array,
  config: RecoveryScanConfig,
  gateway: RecoveryNetworkGateway,
  signal: AbortSignal,
  onProgress: (progress: RecoveryProgress) => void,
  onFinding: (finding: RecoveryFinding) => void,
): Promise<RecoverySection> {
  const endpoint = RECOVERY_CORE_ENDPOINTS[config.network];
  const status = object(await gateway.runPublic(
    { network: config.network },
    'core.status',
    () => gateway.networkApi.coreStatus(config.network, signal),
    signal,
  ), 'DashScan status');
  if (status.status !== 'ok') throw new Error('DashScan reports that its index is not synchronized.');

  const tipPage = object(
    await gateway.runPublic(
      { network: config.network },
      'core.tip',
      () => gateway.networkApi.coreTip(config.network, signal),
      signal,
    ),
    'DashScan block page',
  );
  const tipItems = Array.isArray(tipPage.resultSet) ? tipPage.resultSet : [];
  if (tipItems.length !== 1) throw new Error('DashScan did not return exactly one indexed tip.');
  const tip = object(tipItems[0], 'DashScan indexed tip');
  const indexedHeight = exactSafeInteger(tip.height, 'DashScan indexed height');
  const findings: RecoveryFinding[] = [];
  let totalBalance = 0n;
  let usedCount = 0;
  let fundedCount = 0;
  let historyDetailFailures = 0;
  const network = getDashNetwork(config.network);
  const root = rootFromSeed(seed, network.versions);
  const accountPath = `m/44'/${network.coinType}'/${config.account}'`;
  const account = root.derive(accountPath);
  const branchTargets: [number, number] = [config.coreReceiveCount, config.coreChangeCount];
  const scannedCounts: [number, number] = [0, 0];
  let completed = 0;
  let gapTruncated = false;
  try {
    for (const branch of [0, 1] as const) {
      const branchNode = account.deriveChild(branch);
      try {
        for (let offset = 0; offset < branchTargets[branch];) {
          if (signal.aborted) throw new DOMException('Core scan cancelled.', 'AbortError');
          const chunk: DerivedCoreAddress[] = [];
          const end = Math.min(offset + ADDRESS_CHUNK, branchTargets[branch]);
          for (let index = offset; index < end; index += 1) {
            const child = branchNode.deriveChild(index);
            const path = `${accountPath}/${branch}/${index}`;
            const publicKey = requirePublic(child, path);
            const publicKeyHash = hash160(publicKey);
            chunk.push({
              address: encodeP2pkh(publicKeyHash, network.p2pkh),
              path,
              account: config.account,
              branch,
              index,
              publicKeyHash: bytesToHex(publicKeyHash),
            });
            wipe(publicKey, publicKeyHash);
            child.wipePrivateData();
          }
          const addresses = chunk.map(({ address }) => address);
          const dashScanValue = await gateway.runPublic(
            { network: config.network, addresses },
            'core.address-info',
            () => gateway.networkApi.coreAddressInfo(config.network, addresses, signal),
            signal,
          );
          const infos = validateInfo(dashScanValue, chunk);
          const displayCandidates: Array<{ derived: DerivedCoreAddress; info: { balance: bigint; txCount: number } }> = [];
          infos.forEach((info, index) => {
            const derived = chunk[index];
            if (derived === undefined) throw new Error('Local Core address batch changed during scanning.');
            totalBalance += info.balance;
            const used = info.txCount > 0 || info.balance > 0n;
            if (!used) return;
            const extension = extendAddressTarget(branchTargets[branch], derived.index);
            branchTargets[branch] = extension.target;
            gapTruncated ||= extension.truncated;
            usedCount += 1;
            if (info.balance > 0n) fundedCount += 1;
            if (info.balance > 0n || config.includeUsedZeroBalance) displayCandidates.push({ derived, info });
          });
          const historyByAddress = new Map<string, CoreHistorySummary>();
          if (config.includeUsedZeroBalance) {
            await Promise.all(displayCandidates
              .filter(({ info }) => info.balance === 0n)
              .map(async ({ derived }) => {
                try {
                  const value = await gateway.runPublic(
                    { network: config.network, address: derived.address },
                    'core.address-history',
                    () => gateway.networkApi.coreAddressHistory(config.network, derived.address, signal),
                    signal,
                  );
                  historyByAddress.set(derived.address, validateHistory(value, derived.address));
                } catch (cause) {
                  if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
                  historyDetailFailures += 1;
                }
              }));
          }
          for (const { derived, info } of displayCandidates) {
            const history = historyByAddress.get(derived.address);
            const finding: RecoveryFinding = {
              id: `core:${derived.branch}:${derived.index}`,
              title: derived.address,
              subtitle: derived.branch === 0 ? `Receive address #${derived.index}` : `Change address #${derived.index}`,
              balanceAtomic: info.balance,
              balanceLabel: formatDashFromDuffs(info.balance),
              fields: [
                { label: 'Derivation path', value: derived.path, copyable: true },
                { label: 'Branch', value: derived.branch === 0 ? '0 · receive' : '1 · change' },
                { label: 'Address index', value: String(derived.index) },
                { label: 'Transactions reported', value: String(history?.txCount ?? info.txCount) },
                ...(history === undefined ? [] : [
                  { label: 'Lifetime received', value: formatDashFromDuffs(history.received) },
                  { label: 'Lifetime sent', value: formatDashFromDuffs(history.sent) },
                  ...(history.firstSeen === null ? [] : [{ label: 'First seen', value: history.firstSeen }]),
                  ...(history.lastSeen === null ? [] : [{ label: 'Last seen', value: history.lastSeen }]),
                ]),
                { label: 'Public-key hash', value: derived.publicKeyHash, copyable: true },
              ],
            };
            findings.push(finding);
            onFinding(finding);
          }
          completed += chunk.length;
          scannedCounts[branch] += chunk.length;
          offset = end;
          onProgress({
            inputId,
            section: 'core',
            message: `Checked ${completed.toLocaleString()} of ${branchTargets.reduce((sum, value) => sum + value, 0).toLocaleString()} Core addresses · maintaining a ${ADDRESS_DISCOVERY_GAP}-address empty gap`,
            completed,
            total: branchTargets.reduce((sum, value) => sum + value, 0),
          });
        }
      } finally {
        branchNode.wipePrivateData();
      }
    }
  } finally {
    account.wipePrivateData();
    root.wipePrivateData();
  }

  const warningParts: string[] = [];
  if (gapTruncated) warningParts.push('A used address was found too close to the end of the BIP32 index space to complete the 20-address safety gap.');
  if (historyDetailFailures > 0) warningParts.push(`${historyDetailFailures} optional historical address summar${historyDetailFailures === 1 ? 'y' : 'ies'} could not be loaded; balance and transaction-count discovery remains complete.`);
  warningParts.push('DashScan is the sole Core balance/history source in this build. Independently verify funded addresses in a standard Dash wallet before recovery.');
  return {
    id: 'core',
    title: 'Dash Core · L1',
    description: 'BIP44 receive and change branches are derived locally; only public addresses are sent in batches to DashScan.',
    state: 'complete',
    metrics: [
      { label: 'Spendable balance', value: formatDashFromDuffs(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
      { label: 'Funded addresses', value: String(fundedCount) },
      { label: 'Previously used · empty', value: String(usedCount - fundedCount) },
      { label: 'Addresses checked', value: `R ${scannedCounts[0]} · C ${scannedCounts[1]}` },
    ],
    findings,
    scanned: scannedCounts[0] + scannedCounts[1],
    source: endpoint,
    proof: `DashScan synchronized · indexed Core height ${indexedHeight} · ${ADDRESS_DISCOVERY_GAP}-address post-use gap · single-source result`,
    ...(warningParts.length === 0 ? {} : { warning: warningParts.join(' ') }),
  };
}

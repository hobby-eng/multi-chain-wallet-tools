import { dashCoreHistory } from './history.js';
import { rootFromSeed, requirePublic } from '@ckd/core/bip32.js';
import { bytesToHex, encodeP2pkh, hash160, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { RecoveryNetworkGateway } from '../../network-gateway.js';
import { RECOVERY_CORE_ADDRESS_BATCH, RECOVERY_CORE_ENDPOINTS } from '../../network-protocol.js';
import type { RecoveryFinding, RecoveryProgress, RecoveryScanConfig, RecoverySection } from '../../types.js';
import { parseCustomPathTemplate } from '../custom-path.js';
import {
  ADDRESS_DISCOVERY_GAP,
  extendAddressTarget,
  fetchDashScanIndexedHeight,
  formatDashFromDuffs,
  validateDashScanAddressBatch,
  validateDashScanAddressHistory,
} from './util.js';

// DashScan accepts 100 P2PKH addresses while the resulting URL remains within
// the request-line limits of supported browsers and the deployed proxy.
const ADDRESS_CHUNK = RECOVERY_CORE_ADDRESS_BATCH;

interface DerivedCoreAddress {
  address: string;
  path: string;
  account: number;
  branch: number;
  index: number;
  publicKeyHash: string;
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
  const indexedHeight = await fetchDashScanIndexedHeight(gateway, config.network, signal);
  const findings: RecoveryFinding[] = [];
  const findingsByAddress = new Map<string, RecoveryFinding>();
  const addressInfos = new Map<string, { balance: bigint; txCount: number }>();
  let totalBalance = 0n;
  let usedCount = 0;
  let fundedCount = 0;
  let historyDetailFailures = 0;
  const network = getDashNetwork(config.network);
  const root = rootFromSeed(seed, network.versions);
  const accountPath = `m/44'/${network.coinType}'/${config.account}'`;
  const account = root.derive(accountPath);
  const branchTargets: [number, number] = config.scanCore
    ? [config.coreReceiveCount, config.coreChangeCount]
    : [0, 0];
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
          const infos = validateDashScanAddressBatch(dashScanValue, addresses);
          const displayCandidates: Array<{ derived: DerivedCoreAddress; info: { balance: bigint; txCount: number } }> = [];
          infos.forEach((info, index) => {
            const derived = chunk[index];
            if (derived === undefined) throw new Error('Local Core address batch changed during scanning.');
            addressInfos.set(derived.address, info);
            const used = info.txCount > 0 || info.balance > 0n;
            if (!used) return;
            const extension = extendAddressTarget(branchTargets[branch], derived.index);
            branchTargets[branch] = extension.target;
            gapTruncated ||= extension.truncated;
            if (info.balance > 0n || config.includeUsedZeroBalance) displayCandidates.push({ derived, info });
          });
          for (const info of infos) {
            totalBalance += info.balance;
            if (info.txCount > 0 || info.balance > 0n) usedCount += 1;
            if (info.balance > 0n) fundedCount += 1;
          }
          const historyByAddress = new Map<string, ReturnType<typeof validateDashScanAddressHistory>>();
          // Funded addresses are always few and recovery-relevant, so enrich
          // every displayed result. The history option only adds used empty
          // addresses, which can number in the thousands after CoinJoin.
          await Promise.all(displayCandidates.map(async ({ derived }) => {
            try {
              const value = await gateway.runPublic(
                { network: config.network, address: derived.address },
                'core.address-history',
                () => gateway.networkApi.coreAddressHistory(config.network, derived.address, signal),
                signal,
              );
              historyByAddress.set(derived.address, validateDashScanAddressHistory(value, derived.address));
            } catch (cause) {
              if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
              historyDetailFailures += 1;
            }
          }));
          for (const { derived, info } of displayCandidates) {
            const history = historyByAddress.get(derived.address);
            const finding: RecoveryFinding = {
              id: `core:${derived.branch}:${derived.index}`,
              title: derived.address,
              subtitle: derived.branch === 0 ? `Receive address #${derived.index}` : `Change address #${derived.index}`,
              balanceAtomic: info.balance,
              balanceLabel: formatDashFromDuffs(info.balance),
              ...(history === undefined ? {} : { history: dashCoreHistory(history) }),
              fields: [
                { label: 'Scan family', value: 'Standard BIP44' },
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
            findingsByAddress.set(derived.address, finding);
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
    if (config.scanCustomPath === true) {
      if (config.customPathFormat !== 'p2pkh') throw new Error('Dash custom paths require the P2PKH address format.');
      const parsed = parseCustomPathTemplate(config.customPathTemplate ?? '');
      let target = config.customPathCount ?? 0;
      for (let offset = 0; offset < target;) {
        if (signal.aborted) throw new DOMException('Core scan cancelled.', 'AbortError');
        const end = Math.min(offset + ADDRESS_CHUNK, target);
        const chunk: DerivedCoreAddress[] = [];
        for (let index = offset; index < end; index += 1) {
          const path = parsed.path(index);
          const child = root.derive(path);
          const publicKey = requirePublic(child, path);
          const publicKeyHash = hash160(publicKey);
          chunk.push({
            address: encodeP2pkh(publicKeyHash, network.p2pkh),
            path,
            account: config.account,
            branch: -1,
            index,
            publicKeyHash: bytesToHex(publicKeyHash),
          });
          wipe(publicKey, publicKeyHash);
          child.wipePrivateData();
        }
        const missing = chunk.filter(({ address }) => !addressInfos.has(address));
        if (missing.length > 0) {
          const addresses = missing.map(({ address }) => address);
          const value = await gateway.runPublic(
            { network: config.network, addresses },
            'core.address-info',
            () => gateway.networkApi.coreAddressInfo(config.network, addresses, signal),
            signal,
          );
          const infos = validateDashScanAddressBatch(value, addresses);
          infos.forEach((info, index) => {
            const address = addresses[index];
            if (address === undefined) throw new Error('Custom Dash address batch changed during scanning.');
            addressInfos.set(address, info);
            totalBalance += info.balance;
            if (info.txCount > 0 || info.balance > 0n) usedCount += 1;
            if (info.balance > 0n) fundedCount += 1;
          });
        }
        for (const derived of chunk) {
          const info = addressInfos.get(derived.address);
          if (info === undefined) throw new Error('Dash account state cache omitted a custom-path address.');
          const used = info.txCount > 0 || info.balance > 0n;
          if (used) {
            const extension = extendAddressTarget(target, derived.index);
            target = extension.target;
            gapTruncated ||= extension.truncated;
          }
          if (info.balance === 0n && !(config.includeUsedZeroBalance && used)) continue;
          const existing = findingsByAddress.get(derived.address);
          if (existing !== undefined) {
            if (!existing.fields.some(({ value }) => value === derived.path)) {
              existing.fields.push({ label: 'Alternate derivation path', value: derived.path, copyable: true });
            }
            continue;
          }
          let history: ReturnType<typeof validateDashScanAddressHistory> | undefined;
          try {
            const historyValue = await gateway.runPublic(
              { network: config.network, address: derived.address },
              'core.address-history',
              () => gateway.networkApi.coreAddressHistory(config.network, derived.address, signal),
              signal,
            );
            history = validateDashScanAddressHistory(historyValue, derived.address);
          } catch (cause) {
            if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
            historyDetailFailures += 1;
          }
          const finding: RecoveryFinding = {
            id: `core:custom:${derived.index}`,
            title: derived.address,
            subtitle: `Custom P2PKH path · index ${derived.index}`,
            balanceAtomic: info.balance,
            balanceLabel: formatDashFromDuffs(info.balance),
            ...(history === undefined ? {} : { history: dashCoreHistory(history) }),
            fields: [
              { label: 'Scan family', value: 'Custom P2PKH path' },
              { label: 'Derivation path', value: derived.path, copyable: true },
              { label: 'Profile index', value: String(derived.index) },
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
          findingsByAddress.set(derived.address, finding);
          findings.push(finding);
          onFinding(finding);
        }
        completed += chunk.length;
        offset = end;
        onProgress({
          inputId,
          section: 'core',
          message: `Custom P2PKH path: checked ${offset.toLocaleString()} of ${target.toLocaleString()} addresses`,
          completed,
          total: null,
        });
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
    description: `BIP44 receive and change branches${config.scanCustomPath === true ? ' plus the selected custom P2PKH path are' : ' are'} derived locally; only public addresses are sent in batches to DashScan.`,
    state: 'complete',
    metrics: [
      { label: 'Spendable balance', value: formatDashFromDuffs(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
      { label: 'Funded addresses', value: String(fundedCount) },
      { label: 'Previously used · empty', value: String(usedCount - fundedCount) },
      { label: 'Addresses checked', value: `R ${scannedCounts[0]} · C ${scannedCounts[1]}${config.scanCustomPath === true ? ` · custom ${completed - scannedCounts[0] - scannedCounts[1]}` : ''}` },
    ],
    findings,
    scanned: completed,
    source: endpoint,
    proof: `DashScan synchronized · indexed Core height ${indexedHeight} · ${ADDRESS_DISCOVERY_GAP}-address post-use gap · single-source result`,
    ...(warningParts.length === 0 ? {} : { warning: warningParts.join(' ') }),
  };
}

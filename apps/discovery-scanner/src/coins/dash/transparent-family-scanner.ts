import { MAX_BIP32_INDEX, rootFromSeed, requirePublic } from '@ckd/core/bip32.js';
import { bytesToHex, encodeP2pkh, hash160, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { RecoveryNetworkGateway } from '../../network-gateway.js';
import { RECOVERY_CORE_ADDRESS_BATCH, RECOVERY_CORE_ENDPOINTS } from '../../network-protocol.js';
import type { RecoveryFinding, RecoveryProgress, RecoveryScanConfig, RecoverySection, RecoverySectionId } from '../../types.js';
import {
  ADDRESS_DISCOVERY_GAP,
  extendAddressTarget,
  fetchDashScanIndexedHeight,
  formatDashFromDuffs,
  validateDashScanAddressBatch,
  validateDashScanAddressHistory,
} from './util.js';

const ADDRESS_CHUNK = RECOVERY_CORE_ADDRESS_BATCH;

export interface TransparentBranchSpec {
  key: string;
  label: string;
  pathPrefix(coinType: number): string;
  count: number;
  hardenedIndex?: boolean;
}

export interface TransparentFamilySpec {
  id: RecoverySectionId;
  title: string;
  description: string;
  familyLabel: string;
  proofLabel: string;
  branches: TransparentBranchSpec[];
}

interface DerivedTransparentAddress {
  address: string;
  branchKey: string;
  branchLabel: string;
  path: string;
  index: number;
  publicKeyHash: string;
}

export async function scanDashTransparentFamily(
  inputId: string,
  seed: Uint8Array,
  config: RecoveryScanConfig,
  gateway: RecoveryNetworkGateway,
  signal: AbortSignal,
  spec: TransparentFamilySpec,
  onProgress: (progress: RecoveryProgress) => void,
  onFinding: (finding: RecoveryFinding) => void,
): Promise<RecoverySection> {
  const endpoint = RECOVERY_CORE_ENDPOINTS[config.network];
  const indexedHeight = await fetchDashScanIndexedHeight(gateway, config.network, signal);
  const network = getDashNetwork(config.network);
  const root = rootFromSeed(seed, network.versions);
  const findings: RecoveryFinding[] = [];
  const scannedCounts = new Map<string, number>();
  const branchTargets = new Map<string, number>();
  let totalBalance = 0n;
  let usedCount = 0;
  let fundedCount = 0;
  let historyDetailFailures = 0;
  let completed = 0;
  let gapTruncated = false;
  try {
    for (const branch of spec.branches) {
      let target = branch.count;
      scannedCounts.set(branch.key, 0);
      branchTargets.set(branch.key, target);
      const branchPath = branch.pathPrefix(network.coinType);
      const branchNode = root.derive(branchPath);
      try {
        for (let offset = 0; offset < target;) {
          if (signal.aborted) throw new DOMException(`${spec.title} scan cancelled.`, 'AbortError');
          const chunk: DerivedTransparentAddress[] = [];
          const end = Math.min(offset + ADDRESS_CHUNK, target);
          for (let index = offset; index < end; index += 1) {
            const child = branchNode.deriveChild(branch.hardenedIndex ? index + MAX_BIP32_INDEX + 1 : index);
            const path = `${branchPath}/${index}${branch.hardenedIndex ? "'" : ''}`;
            const publicKey = requirePublic(child, path);
            const publicKeyHash = hash160(publicKey);
            chunk.push({
              address: encodeP2pkh(publicKeyHash, network.p2pkh),
              branchKey: branch.key,
              branchLabel: branch.label,
              path,
              index,
              publicKeyHash: bytesToHex(publicKeyHash),
            });
            wipe(publicKey, publicKeyHash);
            child.wipePrivateData();
          }
          const addresses = chunk.map(({ address }) => address);
          const dashScanValue = await gateway.runPublic(
            { network: config.network, addresses },
            `${spec.id}.address-info`,
            () => gateway.networkApi.coreAddressInfo(config.network, addresses, signal),
            signal,
          );
          const infos = validateDashScanAddressBatch(dashScanValue, addresses);
          const displayCandidates: Array<{ derived: DerivedTransparentAddress; info: { balance: bigint; txCount: number } }> = [];
          infos.forEach((info, index) => {
            const derived = chunk[index];
            if (derived === undefined) throw new Error(`Local ${spec.title} address batch changed during scanning.`);
            totalBalance += info.balance;
            const used = info.txCount > 0 || info.balance > 0n;
            if (!used) return;
            const extension = extendAddressTarget(target, derived.index);
            target = extension.target;
            branchTargets.set(branch.key, target);
            gapTruncated ||= extension.truncated;
            usedCount += 1;
            if (info.balance > 0n) fundedCount += 1;
            if (info.balance > 0n || config.includeUsedZeroBalance) displayCandidates.push({ derived, info });
          });
          const historyByAddress = new Map<string, ReturnType<typeof validateDashScanAddressHistory>>();
          await Promise.all(displayCandidates.map(async ({ derived }) => {
            try {
              const value = await gateway.runPublic(
                { network: config.network, address: derived.address },
                `${spec.id}.address-history`,
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
              id: `${spec.id}:${derived.branchKey}:${derived.index}`,
              title: derived.address,
              subtitle: `${derived.branchLabel} #${derived.index}`,
              balanceAtomic: info.balance,
              balanceLabel: formatDashFromDuffs(info.balance),
              fields: [
                { label: 'Scan family', value: spec.familyLabel },
                { label: 'Branch', value: derived.branchLabel },
                { label: 'Derivation path', value: derived.path, copyable: true },
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
          scannedCounts.set(branch.key, (scannedCounts.get(branch.key) ?? 0) + chunk.length);
          offset = end;
          onProgress({
            inputId,
            section: spec.id,
            message: `${branch.label}: checked ${scannedCounts.get(branch.key)?.toLocaleString() ?? '0'} of ${target.toLocaleString()} (${branchPath}/0 .. ${branchPath}/${Math.max(target - 1, 0)}) · ${ADDRESS_DISCOVERY_GAP}-address post-use gap`,
            completed,
            total: [...branchTargets.values()].reduce((sum, value) => sum + value, 0),
          });
        }
      } finally {
        branchNode.wipePrivateData();
      }
    }
  } finally {
    root.wipePrivateData();
  }

  const warningParts: string[] = [];
  if (gapTruncated) warningParts.push('A used address was found too close to the end of the BIP32 index space to complete the 20-address safety gap.');
  if (historyDetailFailures > 0) warningParts.push(`${historyDetailFailures} optional historical address summar${historyDetailFailures === 1 ? 'y' : 'ies'} could not be loaded; balance and transaction-count discovery remains complete.`);
  warningParts.push('DashScan is the sole Core-chain balance/history source for this section. Independently verify funded addresses in a standard Dash wallet before recovery.');
  return {
    id: spec.id,
    title: spec.title,
    description: spec.description,
    state: 'complete',
    metrics: [
      { label: 'Spendable balance', value: formatDashFromDuffs(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
      { label: 'Funded addresses', value: String(fundedCount) },
      { label: 'Previously used · empty', value: String(usedCount - fundedCount) },
      { label: 'Addresses checked', value: spec.branches.map(({ key, label }) => `${label}: ${scannedCounts.get(key) ?? 0}`).join(' · ') },
    ],
    findings,
    scanned: [...scannedCounts.values()].reduce((sum, value) => sum + value, 0),
    source: endpoint,
    proof: `DashScan synchronized · indexed Core height ${indexedHeight} · ${ADDRESS_DISCOVERY_GAP}-address post-use gap · ${spec.proofLabel}`,
    warning: warningParts.join(' '),
  };
}

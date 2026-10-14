import type { DashSectionScan } from "./section-scan.js";
import { DASHSCAN_ENDPOINTS } from "@ckd/dash-network/public-address.js";
import { rootFromSeed } from "@ckd/core/bip32.js";
import { BIP32_HARDENED_OFFSET } from "@ckd/core/bip32-limits.js";
import { getDashNetwork } from "@ckd/core/networks.js";
import { RecoveryNetworkGateway } from "../../network-gateway.js";
import { RECOVERY_CORE_ADDRESS_BATCH } from "@ckd/network-boundary/protocol.js";
import type { RecoveryFinding, RecoveryScanConfig, RecoverySectionId } from "../../types.js";
import { scanBranch } from "../../address-book.js";
import { DashScanAddresses } from "./dashscan-addresses.js";
import { ADDRESS_DISCOVERY_GAP, fetchDashScanIndexedHeight } from "./util.js";

const ADDRESS_CHUNK = RECOVERY_CORE_ADDRESS_BATCH;

interface TransparentBranchSpec {
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

/** The scan of the family that `familyOf` describes for a scan's settings. */
export function familyScan(
  familyOf: (config: RecoveryScanConfig) => TransparentFamilySpec,
): DashSectionScan<RecoveryNetworkGateway> {
  return async (inputId, seed, config, gateway, signal, onProgress, onFinding) => {
    const spec = familyOf(config);
    const endpoint = DASHSCAN_ENDPOINTS[config.network];
    const indexedHeight = await fetchDashScanIndexedHeight(gateway, config.network, signal);
    const addresses = new DashScanAddresses(gateway, config.network, spec.id, signal);
    const network = getDashNetwork(config.network);
    const root = rootFromSeed(seed, network.versions);
    const findings: RecoveryFinding[] = [];
    const scannedCounts = new Map<string, number>();
    const branchTargets = new Map<string, number>();
    let completed = 0;
    try {
      for (const branch of spec.branches) {
        scannedCounts.set(branch.key, 0);
        branchTargets.set(branch.key, branch.count);
        const branchPath = branch.pathPrefix(network.coinType);
        const branchNode = root.derive(branchPath);
        try {
          const before = completed;
          const checked = await scanBranch({
            initial: branch.count,
            batchSize: ADDRESS_CHUNK,
            signal,
            cancelled: `${spec.title} scan cancelled.`,
            derive: (index) =>
              addresses.address(
                branchNode.deriveChild(
                  branch.hardenedIndex ? index + BIP32_HARDENED_OFFSET : index,
                ),
                index,
                `${branchPath}/${index}${branch.hardenedIndex ? "'" : ""}`,
              ),
            lookUp: (chunk, target) =>
              addresses.batch(chunk, target, {
                includeUsedZeroBalance: config.includeUsedZeroBalance,
                history: () => true,
              }),
            show: (shown) => {
              const { index, path } = shown.derived;
              const finding = addresses.finding(
                `${spec.id}:${branch.key}:${index}`,
                `${branch.label} #${index}`,
                shown,
                [
                  { label: "Scan family", value: spec.familyLabel },
                  { label: "Branch", value: branch.label },
                  { label: "Derivation path", value: path, copyable: true },
                  { label: "Address index", value: String(index) },
                ],
              );
              findings.push(finding);
              onFinding(finding);
            },
            progress: (checked, target) => {
              completed = before + checked;
              scannedCounts.set(branch.key, checked);
              branchTargets.set(branch.key, target);
              onProgress({
                inputId,
                section: spec.id,
                message: `${branch.label}: checked ${checked.toLocaleString()} of ${target.toLocaleString()} (${branchPath}/0 .. ${branchPath}/${Math.max(target - 1, 0)}) · ${ADDRESS_DISCOVERY_GAP}-address post-use gap`,
                completed,
                total: [...branchTargets.values()].reduce((sum, value) => sum + value, 0),
              });
            },
          });
          scannedCounts.set(branch.key, checked);
        } finally {
          branchNode.wipePrivateData();
        }
      }
    } finally {
      root.wipePrivateData();
    }

    return {
      id: spec.id,
      title: spec.title,
      description: spec.description,
      state: "complete",
      metrics: addresses.metrics({
        label: "Addresses checked",
        value: spec.branches
          .map(({ key, label }) => `${label}: ${scannedCounts.get(key) ?? 0}`)
          .join(" · "),
      }),
      findings,
      scanned: [...scannedCounts.values()].reduce((sum, value) => sum + value, 0),
      source: endpoint,
      proof: `DashScan synchronized · indexed Core height ${indexedHeight} · ${ADDRESS_DISCOVERY_GAP}-address post-use gap · ${spec.proofLabel}`,
      warning: [
        ...addresses.warnings(),
        "DashScan is the sole Core-chain balance/history source for this section. Independently verify funded addresses in a standard Dash wallet before recovery.",
      ].join(" "),
    };
  };
}

import type { DashSectionScan } from "./section-scan.js";
import { DASHSCAN_ENDPOINTS } from "@ckd/dash-network/public-address.js";
import { rootFromSeed } from "@ckd/core/bip32.js";
import { getDashNetwork } from "@ckd/core/networks.js";
import { RecoveryNetworkGateway } from "../../network-gateway.js";
import { RECOVERY_CORE_ADDRESS_BATCH } from "@ckd/network-boundary/protocol.js";
import { customScanPaths } from "../custom-path.js";
import { AddressFindings, scanBranch } from "../../address-book.js";
import { DashScanAddresses } from "./dashscan-addresses.js";
import { ADDRESS_DISCOVERY_GAP, fetchDashScanIndexedHeight } from "./util.js";

// DashScan accepts 100 P2PKH addresses while the resulting URL remains within
// the request-line limits of supported browsers and the deployed proxy.
const ADDRESS_CHUNK = RECOVERY_CORE_ADDRESS_BATCH;

export const scanDashCore: DashSectionScan<RecoveryNetworkGateway> = async (
  inputId,
  seed,
  config,
  gateway,
  signal,
  onProgress,
  onFinding,
) => {
  const endpoint = DASHSCAN_ENDPOINTS[config.network];
  const indexedHeight = await fetchDashScanIndexedHeight(gateway, config.network, signal);
  const addresses = new DashScanAddresses(gateway, config.network, "core", signal);
  const found = new AddressFindings(onFinding);
  const customPaths = customScanPaths(config);
  const network = getDashNetwork(config.network);
  const root = rootFromSeed(seed, network.versions);
  const accountPath = `m/44'/${network.coinType}'/${config.account}'`;
  const account = root.derive(accountPath);
  const branchTargets: [number, number] = config.scanCore
    ? [config.coreReceiveCount, config.coreChangeCount]
    : [0, 0];
  const scannedCounts: [number, number] = [0, 0];
  let completed = 0;
  try {
    for (const branch of [0, 1] as const) {
      const branchNode = account.deriveChild(branch);
      const before = completed;
      try {
        scannedCounts[branch] = await scanBranch({
          initial: branchTargets[branch],
          batchSize: ADDRESS_CHUNK,
          signal,
          cancelled: "Core scan cancelled.",
          derive: (index) =>
            addresses.address(
              branchNode.deriveChild(index),
              index,
              `${accountPath}/${branch}/${index}`,
            ),
          lookUp: (chunk, target) =>
            addresses.batch(chunk, target, {
              includeUsedZeroBalance: config.includeUsedZeroBalance,
              history: () => true,
            }),
          show: (shown) => {
            const { address, index, path } = shown.derived;
            found.show(address, path, () =>
              addresses.finding(
                `core:${branch}:${index}`,
                branch === 0 ? `Receive address #${index}` : `Change address #${index}`,
                shown,
                [
                  { label: "Scan family", value: "Standard BIP44" },
                  { label: "Derivation path", value: path, copyable: true },
                  { label: "Branch", value: branch === 0 ? "0 · receive" : "1 · change" },
                  { label: "Address index", value: String(index) },
                ],
              ),
            );
          },
          progress: (checked, target) => {
            completed = before + checked;
            branchTargets[branch] = target;
            const total = branchTargets[0] + branchTargets[1];
            onProgress({
              inputId,
              section: "core",
              message: `Checked ${completed.toLocaleString()} of ${total.toLocaleString()} Core addresses · maintaining a ${ADDRESS_DISCOVERY_GAP}-address empty gap`,
              completed,
              total,
            });
          },
        });
      } finally {
        branchNode.wipePrivateData();
      }
    }
    if (config.scanCustomPath === true) {
      if (config.customPathFormat !== "p2pkh")
        throw new Error("Dash custom paths require the P2PKH address format.");
      for (const parsed of customPaths) {
        const before = completed;
        await scanBranch({
          initial: parsed.minimum,
          batchSize: ADDRESS_CHUNK,
          signal,
          cancelled: "Core scan cancelled.",
          derive: (index) => {
            const path = parsed.path(index);
            return addresses.address(root.derive(path), index, path);
          },
          // An address the standard branches already showed gains this path instead of a second
          // finding, so it needs no second history either.
          lookUp: (chunk, target) =>
            addresses.batch(chunk, target, {
              includeUsedZeroBalance: config.includeUsedZeroBalance,
              history: ({ address }) => !found.has(address),
            }),
          show: (shown) => {
            const { address, index, path } = shown.derived;
            found.show(address, path, () =>
              addresses.finding(
                `core:${parsed.id}:${index}`,
                `${parsed.label} · P2PKH · index ${index}`,
                shown,
                [
                  { label: "Scan family", value: "Custom P2PKH path" },
                  { label: "Derivation path", value: path, copyable: true },
                  { label: "Profile index", value: String(index) },
                ],
              ),
            );
          },
          progress: (checked, target) => {
            completed = before + checked;
            onProgress({
              inputId,
              section: "core",
              message: `${parsed.label} · P2PKH: checked ${checked.toLocaleString()} of ${target.toLocaleString()} addresses`,
              completed,
              total: null,
            });
          },
        });
      }
    }
  } finally {
    account.wipePrivateData();
    root.wipePrivateData();
  }

  return {
    id: "core",
    title: "Dash Core · L1",
    description: `BIP44 receive and change branches${config.scanCustomPath === true ? " plus the selected custom P2PKH path are" : " are"} derived locally; only public addresses are sent in batches to DashScan.`,
    state: "complete",
    metrics: addresses.metrics({
      label: "Addresses checked",
      value: `R ${scannedCounts[0]} · C ${scannedCounts[1]}${config.scanCustomPath === true ? ` · custom ${completed - scannedCounts[0] - scannedCounts[1]}` : ""}`,
    }),
    findings: found.list,
    scanned: completed,
    source: endpoint,
    proof: `DashScan synchronized · indexed Core height ${indexedHeight} · ${ADDRESS_DISCOVERY_GAP}-address post-use gap · single-source result`,
    warning: [
      ...addresses.warnings(),
      "DashScan is the sole Core balance/history source in this build. Independently verify funded addresses in a standard Dash wallet before recovery.",
    ].join(" "),
  };
};

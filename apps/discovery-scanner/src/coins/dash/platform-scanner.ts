import type { DashSectionScan } from "./section-scan.js";
import { PlatformAddressHistoryAdmission } from "@ckd/dash-network/platform-address-history-admission.js";
import { DIP17_PAYMENT_CHAINS } from "@ckd/coins/dash/platform-paths.js";
import { dashPlatformHistory } from "./history.js";
import { rootFromSeed, requirePublic } from "@ckd/core/bip32.js";
import { bytesToHex, hash160, wipe } from "@ckd/core/crypto.js";
import { getDashNetwork } from "@ckd/core/networks.js";
import { encodePlatformP2pkh } from "@ckd/coins/dash/platform.js";
import type { RecoveryFinding } from "../../types.js";
import { RECOVERY_PLATFORM_ADDRESS_BATCH } from "@ckd/network-boundary/protocol.js";
import { DashPlatformClient } from "./platform-client.js";
import { platformHistoryFields, validatePlatformHistory } from "./platform-history.js";
import {
  ADDRESS_DISCOVERY_GAP,
  exactSafeInteger,
  exactUnsigned,
  AddressGapTracker,
  formatDashFromCredits,
  object,
} from "./util.js";

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

export function validatePlatformAddressBatch(
  value: Awaited<ReturnType<DashPlatformClient["addresses"]>>,
  requestedKeys: readonly string[],
): {
  data: Map<string, PlatformInfo | null>;
  height: bigint;
  protocolVersion: number;
} {
  const response = object(value, "Isolated Platform address response");
  if (!Array.isArray(response.entries))
    throw new Error("Isolated Platform address response omitted its entry list.");
  const data = new Map<string, PlatformInfo | null>();
  const expected = new Set(requestedKeys);
  if (expected.size !== requestedKeys.length)
    throw new Error("Platform address request contained a duplicate storage key.");
  for (const rawEntry of response.entries) {
    if (
      !Array.isArray(rawEntry) ||
      rawEntry.length !== 2 ||
      typeof rawEntry[0] !== "string" ||
      !/^00[0-9a-f]{40}$/u.test(rawEntry[0])
    ) {
      throw new Error("Isolated Platform address response contained an invalid storage key.");
    }
    if (data.has(rawEntry[0]))
      throw new Error("Isolated Platform address response contained a duplicate storage key.");
    if (!expected.has(rawEntry[0]))
      throw new Error("Isolated Platform address response contained an unrequested storage key.");
    if (rawEntry[1] === null) {
      data.set(rawEntry[0], null);
      continue;
    }
    const info = object(rawEntry[1], "Isolated Platform address info");
    data.set(rawEntry[0], {
      balance: exactUnsigned(info.balance, "Platform address balance"),
      nonce: exactUnsigned(info.nonce, "Platform address nonce"),
    });
  }
  if (data.size !== expected.size)
    throw new Error("Isolated Platform address response omitted a requested storage key.");
  const metadata = object(response.metadata, "Isolated Platform proof metadata");
  return {
    data,
    height: exactUnsigned(metadata.height, "Platform proof height"),
    protocolVersion: exactSafeInteger(metadata.protocolVersion, "Platform protocol version"),
  };
}

export const scanDashPlatformAddresses: DashSectionScan<DashPlatformClient> = async (
  inputId,
  seed,
  config,
  client,
  signal,
  onProgress,
  onFinding,
) => {
  if (config.platformAddressCount === 0) {
    return {
      id: "platform",
      title: "Dash Platform addresses",
      description: "DIP17 Platform payment address scan was disabled for this run.",
      state: "skipped",
      metrics: [{ label: "Addresses checked", value: "0" }],
      findings: [],
      scanned: 0,
      source: "Local configuration",
      proof: "No network request made",
    };
  }
  const findings: RecoveryFinding[] = [];
  let totalBalance = 0n;
  let proofHeight = 0n;
  let protocolVersion = 0;
  let scanned = 0;
  let usedCount = 0;
  let fundedCount = 0;
  let historyDetailFailures = 0;
  let historyDetails = 0;
  let historyIndexedHeight = 0;
  const gap = new AddressGapTracker();
  const network = getDashNetwork(config.network);
  const root = rootFromSeed(seed, network.versions);
  try {
    for (const [chainIndex, { keyClass, label: chainLabel }] of DIP17_PAYMENT_CHAINS.entries()) {
      // Each hardened class has its own minimum and post-use gap.
      let target = config.platformAddressCount;
      const scannedBeforeChain = scanned;
      const accountPath = `m/9'/${network.coinType}'/17'/${config.account}'/${keyClass}'`;
      const account = root.derive(accountPath);
      try {
        for (let offset = 0; offset < target;) {
          if (signal.aborted)
            throw new DOMException("Platform address scan cancelled.", "AbortError");
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
          const response = validatePlatformAddressBatch(
            await client.addresses(publicAddresses, signal),
            chunk.map(({ storageKey }) => storageKey),
          );
          proofHeight = proofHeight > response.height ? proofHeight : response.height;
          protocolVersion = Math.max(protocolVersion, response.protocolVersion);
          const displayed: { derived: DerivedPlatformAddress; info: PlatformInfo }[] = [];
          for (const derived of chunk) {
            const info = response.data.get(derived.storageKey);
            if (info === undefined || info === null) continue;
            totalBalance += info.balance;
            const used = info.balance > 0n || info.nonce > 0n;
            if (!used) continue;
            target = gap.extend(target, derived.index);
            usedCount += 1;
            if (info.balance > 0n) fundedCount += 1;
            if (info.balance === 0n && !config.includeUsedZeroBalance) continue;
            displayed.push({ derived, info });
          }
          const histories = await Promise.all(
            displayed.map(async ({ derived, info }) => {
              try {
                return validatePlatformHistory(
                  await client.addressHistory(derived.address, signal),
                  new PlatformAddressHistoryAdmission(derived.address, config.network),
                  info.balance,
                );
              } catch (cause) {
                if (signal.aborted) throw cause;
                historyDetailFailures += 1;
                return null;
              }
            }),
          );
          for (let displayedIndex = 0; displayedIndex < displayed.length; displayedIndex += 1) {
            const { derived, info } = displayed[displayedIndex]!;
            const history = histories[displayedIndex] ?? null;
            if (history !== null) {
              historyDetails += 1;
              historyIndexedHeight = Math.max(historyIndexedHeight, history.indexedHeight);
            }
            const finding: RecoveryFinding = {
              id: `platform:${keyClass}:${derived.index}`,
              title: derived.address,
              subtitle: `Platform ${chainLabel.toLowerCase()} address #${derived.index}`,
              balanceAtomic: info.balance,
              balanceLabel: formatDashFromCredits(info.balance),
              ...(history === null ? {} : { history: dashPlatformHistory(history) }),
              fields: [
                { label: "DIP17 derivation path", value: derived.path, copyable: true },
                { label: "Branch", value: `${keyClass}' · ${chainLabel.toLowerCase()}` },
                { label: "Address index", value: String(derived.index) },
                { label: "Outgoing nonce", value: info.nonce.toString() },
                ...(history === null ? [] : platformHistoryFields(history)),
                { label: "Public-key hash", value: derived.publicKeyHash, copyable: true },
              ],
            };
            findings.push(finding);
            onFinding(finding);
          }
          scanned += chunk.length;
          offset = end;
          onProgress({
            inputId,
            section: "platform",
            message: `Proof-checked ${scanned.toLocaleString()} Platform addresses · ${chainLabel} · maintaining an independent ${ADDRESS_DISCOVERY_GAP}-address empty gap`,
            completed: scanned,
            total:
              scannedBeforeChain +
              target +
              (DIP17_PAYMENT_CHAINS.length - chainIndex - 1) * config.platformAddressCount,
          });
        }
      } finally {
        account.wipePrivateData();
      }
    }
  } finally {
    root.wipePrivateData();
  }

  return {
    id: "platform",
    title: "Dash Platform addresses",
    description:
      "DIP17 receive (0') and internal/change (1') addresses are derived locally and queried through proof-verified Platform DAPI batches.",
    state: gap.truncated ? "partial" : "complete",
    metrics: [
      {
        label: "Address balance",
        value: formatDashFromCredits(totalBalance),
        tone: totalBalance > 0n ? "positive" : "neutral",
      },
      { label: "Funded addresses", value: String(fundedCount) },
      { label: "Previously used · empty", value: String(usedCount - fundedCount) },
      {
        label: "Addresses checked",
        value: `${scanned} · minimum ${config.platformAddressCount} per receive/internal chain`,
      },
      { label: "History details", value: `${historyDetails}/${findings.length} enriched` },
    ],
    findings,
    scanned,
    source:
      "Dash Platform DAPI · trusted quorum discovery; synchronized Platform Explorer · auxiliary history",
    proof: `Balance proof verified at Platform height ${proofHeight} · ${ADDRESS_DISCOVERY_GAP}-address post-use gap per receive/internal chain${historyIndexedHeight > 0 ? ` · history indexed through height ${historyIndexedHeight}` : ""}`,
    ...(gap.truncated || historyDetailFailures > 0
      ? {
          warning: [
            ...(gap.warning === undefined ? [] : [gap.warning]),
            ...(historyDetailFailures > 0
              ? [
                  `Historical details were unavailable or failed the DAPI balance cross-check for ${historyDetailFailures} displayed address${historyDetailFailures === 1 ? "" : "es"}; proof-verified balances remain valid.`,
                ]
              : []),
          ].join(" "),
        }
      : {}),
  };
};

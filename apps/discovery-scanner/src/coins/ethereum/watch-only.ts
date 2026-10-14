import { WalletScan } from "../../wallet-result.js";
import { watchOnlyPublicKey } from "@ckd/recovery/watch-only.js";
import { ETHEREUM_COIN } from "./coin.js";
import { ScanSecrets } from "../../scan-secrets.js";
import { assertWatchOnlyMinimum } from "@ckd/recovery/watch-only.js";
import { HDKey } from "@scure/bip32";
import { ethereumAddressOfKey } from "@ckd/coins/ethereum/index.js";
import { requirePublic } from "@ckd/core/bip32.js";
import { RECOVERY_EVM_ACCOUNT_BATCH, type EvmAccountView } from "@ckd/network-boundary/protocol.js";
import type {
  RecoveryFinding,
  RecoveryScanContext,
  RecoverySection,
  RecoveryWalletResult,
  RecoveryWatchOnlyInput,
  RecoveryWatchOnlyScanConfig,
} from "../../types.js";
import { AddressBook, scanBranches } from "../../address-book.js";
import {
  ETHEREUM_SOURCES,
  ETHEREUM_VERSIONS,
  EthereumAccounts,
  ethereumChainLabel,
  formatEther,
} from "./shared.js";

function addressForNode(node: HDKey): string {
  return ethereumAddressOfKey(requirePublic(node, "the watch-only key"));
}

interface EthCandidateProfile {
  id: string;
  label: string;
  path: string;
  deriveChild(index: number): HDKey;
}

export async function scanEthereumWatchOnly(
  input: RecoveryWatchOnlyInput,
  config: RecoveryWatchOnlyScanConfig,
  context: RecoveryScanContext,
): Promise<RecoveryWalletResult> {
  assertWatchOnlyMinimum(config.minimumCount);
  const secrets = new ScanSecrets(context);
  secrets.watchOnly(input, "Ethereum");
  const gateway = secrets.gateway(context);
  const walletScan = new WalletScan(input, ETHEREUM_COIN, config.network);
  const accounts = new EthereumAccounts(gateway, config.network, context.signal);
  const book = new AddressBook(accounts);
  const findings: RecoveryFinding[] = [];
  let scanned = 0;
  let descriptionText: string;

  const recordFinding = (
    address: string,
    path: string,
    label: string,
    entry: EvmAccountView,
  ): void => {
    const balance = BigInt(entry.balance);
    if (balance === 0n && !(config.includeUsedZeroBalance && accounts.used(entry))) return;
    const finding: RecoveryFinding = {
      id: `ethereum:watch:${address}`,
      title: address,
      subtitle: label,
      balanceAtomic: balance,
      balanceLabel: formatEther(balance),
      fields: [
        { label: "Scan profile", value: label },
        { label: "Relative derivation path", value: path, copyable: true },
        { label: "Transactions sent / nonce", value: BigInt(entry.nonce).toString() },
      ],
    };
    findings.push(finding);
    context.onFinding(input.id, "core", finding);
  };
  /** One exact account: a public key or a leaf key, which derive nothing further. */
  const recordExact = async (address: string, path: string, label: string): Promise<void> => {
    const [entry] = await book.states([address]);
    recordFinding(address, path, label, entry!);
    scanned = 1;
  };

  if (input.kind === "public-key") {
    const { uncompressed } = watchOnlyPublicKey(input.value);
    await recordExact(
      ethereumAddressOfKey(uncompressed),
      "exact public key",
      "Exact public key · EOA",
    );
    descriptionText =
      "A single public key maps to exactly one EOA; it cannot derive descendant addresses.";
  } else {
    let node: HDKey;
    try {
      node = HDKey.fromExtendedKey(input.value, ETHEREUM_VERSIONS);
    } catch {
      throw new Error(
        "This extended public key is malformed or does not match the expected Ethereum version bytes.",
      );
    }
    if (node.depth === 0) {
      throw new Error(
        "This is the root/master extended public key. It sits above the hardened BIP44 account level and cannot derive standard wallet addresses. Copy the account xpub instead.",
      );
    }
    if (node.depth === 5) {
      await recordExact(addressForNode(node), "exact leaf key", "Exact leaf public key · EOA");
      descriptionText =
        "A depth-5 leaf extended public key is already one exact account key; it cannot derive further descendants.";
    } else if (node.depth === 3 || node.depth === 4) {
      const profiles: EthCandidateProfile[] =
        node.depth === 4
          ? [
              {
                id: "branch",
                label: "Branch xpub · relative /i",
                path: "<branch xpub>/i",
                deriveChild: (index) => node.deriveChild(index),
              },
            ]
          : [
              {
                id: "standard",
                label: "Account xpub · relative /0/i · standard receive chain",
                path: "<account xpub>/0/i",
                deriveChild: (index) => node.deriveChild(0).deriveChild(index),
              },
              {
                id: "legacy",
                label: "Account xpub · relative /i · legacy Ledger/MEW",
                path: "<account xpub>/i",
                deriveChild: (index) => node.deriveChild(index),
              },
            ];
      scanned = await scanBranches(profiles, (profile, before) => ({
        initial: config.minimumCount,
        batchSize: RECOVERY_EVM_ACCOUNT_BATCH,
        signal: context.signal,
        cancelled: "Ethereum watch-only scan cancelled.",
        derive: (index) => ({
          address: addressForNode(profile.deriveChild(index)),
          index,
          path: profile.path.replace("i", String(index)),
        }),
        lookUp: book.lookUpWith({ includeUsedZeroBalance: config.includeUsedZeroBalance }),
        show: ({ derived: item, state: entry }) =>
          recordFinding(item.address, item.path, profile.label, entry),
        progress: (checked, target) =>
          context.onProgress({
            inputId: input.id,
            section: "core",
            message: `${profile.label}: checked ${checked} of ${target}`,
            completed: before + checked,
            total: null,
          }),
      }));
      descriptionText =
        node.depth === 4
          ? "Depth-4 branch extended public key: scanning its relative /i indices."
          : "Depth-3 account extended public key: scanning the standard /0/i receive chain and the legacy Ledger/MEW /i chain.";
    } else {
      throw new Error(
        `This extended public key has depth ${node.depth}. Only an account xpub (depth 3), a branch xpub (depth 4), or a leaf xpub (depth 5) can be scanned.`,
      );
    }
  }

  const warning = book.gap.warning;
  const section: RecoverySection = {
    id: "core",
    title: "Ethereum watch-only EOA addresses",
    description: descriptionText,
    state: "complete",
    metrics: [
      ...book.metrics(formatEther),
      { label: "Unique addresses queried", value: String(book.queried) },
      { label: "Derivation candidates", value: String(scanned) },
    ],
    findings,
    scanned,
    source: ETHEREUM_SOURCES[config.network],
    proof: `${ethereumChainLabel(config.network)} JSON-RPC state at block ${accounts.blocks.latest ?? 0n}`,
    ...(warning === undefined ? {} : { warning }),
  };
  return walletScan.result({
    overview: [
      ...book.overview(formatEther, "Funded accounts"),
      { label: "Unique addresses queried", value: String(book.queried) },
    ],
    sections: [section],
    warnings: [
      "Only native ETH is scanned; tokens and smart-contract wallets require separate recovery tooling.",
    ],
  });
}

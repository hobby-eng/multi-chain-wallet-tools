// The watch-only scan of every EVM network: a public key, or an account, branch or leaf xpub, read
// from the network's own JSON-RPC.
import { WalletScan } from "../../wallet-result.js";
import { watchOnlyPublicKey } from "@ckd/recovery/watch-only.js";
import { ScanSecrets } from "../../scan-secrets.js";
import { assertWatchOnlyMinimum } from "@ckd/recovery/watch-only.js";
import { HDKey } from "@scure/bip32";
import { evmAddressOfKey } from "@ckd/coins/keccak-account.js";
import { requirePublic } from "@ckd/core/bip32.js";
import { RECOVERY_EVM_ACCOUNT_BATCH, type EvmAccountView } from "@ckd/network-boundary/protocol.js";
import {
  EVM_NETWORK_ERRORS,
  evmChain,
  type EvmNetworkFacts,
} from "@ckd/public-data-providers/evm-network-facts.js";
import type {
  RecoveryFinding,
  RecoveryScanContext,
  RecoverySection,
  RecoveryWalletResult,
  RecoveryWatchOnlyInput,
  RecoveryWatchOnlyScanConfig,
} from "../../types.js";
import { AddressBook, scanBranches } from "../../address-book.js";
import type { RecoveryCoinFacts } from "../registry.js";
import { EVM_VERSIONS, EvmAccounts, evmAmountFormatter } from "./accounts.js";

function addressForNode(node: HDKey): string {
  return evmAddressOfKey(requirePublic(node, "the watch-only key"));
}

interface EvmCandidateProfile {
  id: string;
  label: string;
  path: string;
  deriveChild(index: number): HDKey;
}

/** The candidate chains of an account (depth 3) or branch (depth 4) xpub. */
function candidateProfiles(node: HDKey): EvmCandidateProfile[] {
  if (node.depth === 4)
    return [
      {
        id: "branch",
        label: "Branch xpub · relative /i",
        path: "<branch xpub>/i",
        deriveChild: (index) => node.deriveChild(index),
      },
    ];
  return [
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
}

/** The extended public key of `input`, refused unless it can name EVM accounts. */
function extendedKey(value: string, label: string): HDKey {
  let node: HDKey;
  try {
    node = HDKey.fromExtendedKey(value, EVM_VERSIONS);
  } catch {
    throw new Error(
      `This extended public key is malformed or does not match the expected ${label} version bytes.`,
    );
  }
  if (node.depth === 0)
    throw new Error(
      "This is the root/master extended public key. It sits above the hardened BIP44 account level and cannot derive standard wallet addresses. Copy the account xpub instead.",
    );
  if (node.depth < 3 || node.depth > 5)
    throw new Error(
      `This extended public key has depth ${node.depth}. Only an account xpub (depth 3), a branch xpub (depth 4), or a leaf xpub (depth 5) can be scanned.`,
    );
  return node;
}

/** The watch-only scan of the EVM network `facts`, reported as the coin `coin`. */
export function evmWatchOnlyScan(facts: EvmNetworkFacts, coin: RecoveryCoinFacts) {
  const { label, asset } = facts;
  const format = evmAmountFormatter(facts);
  return async (
    input: RecoveryWatchOnlyInput,
    config: RecoveryWatchOnlyScanConfig,
    context: RecoveryScanContext,
  ): Promise<RecoveryWalletResult> => {
    assertWatchOnlyMinimum(config.minimumCount);
    evmChain(facts, config.network);
    const secrets = new ScanSecrets(context);
    secrets.watchOnly(input, label);
    const gateway = secrets.gateway(context);
    const walletScan = new WalletScan(input, coin, config.network);
    const accounts = new EvmAccounts(gateway, facts, config.network, context.signal);
    const book = new AddressBook(accounts);
    const findings: RecoveryFinding[] = [];
    let scanned = 0;
    let descriptionText: string;

    const recordFinding = (
      address: string,
      path: string,
      profileLabel: string,
      entry: EvmAccountView,
    ): void => {
      const balance = BigInt(entry.balance);
      if (balance === 0n && !(config.includeUsedZeroBalance && accounts.used(entry))) return;
      const finding: RecoveryFinding = {
        id: `${facts.id}:watch:${address}`,
        title: address,
        subtitle: profileLabel,
        balanceAtomic: balance,
        balanceLabel: format(balance),
        fields: [
          { label: "Scan profile", value: profileLabel },
          { label: "Relative derivation path", value: path, copyable: true },
          { label: "Transactions sent / nonce", value: BigInt(entry.nonce).toString() },
        ],
      };
      findings.push(finding);
      context.onFinding(input.id, "core", finding);
    };
    /** One exact account: a public key or a leaf key, which derive nothing further. */
    const recordExact = async (address: string, path: string, profileLabel: string) => {
      const [entry] = await book.states([address]);
      if (entry === undefined) throw EVM_NETWORK_ERRORS.response(label, "no account state");
      recordFinding(address, path, profileLabel, entry);
      scanned = 1;
    };

    if (input.kind === "public-key") {
      const { uncompressed } = watchOnlyPublicKey(input.value);
      await recordExact(
        evmAddressOfKey(uncompressed),
        "exact public key",
        "Exact public key · EOA",
      );
      descriptionText =
        "A single public key maps to exactly one EOA; it cannot derive descendant addresses.";
    } else {
      const node = extendedKey(input.value, label);
      if (node.depth === 5) {
        await recordExact(addressForNode(node), "exact leaf key", "Exact leaf public key · EOA");
        descriptionText =
          "A depth-5 leaf extended public key is already one exact account key; it cannot derive further descendants.";
      } else {
        scanned = await scanBranches(candidateProfiles(node), (profile, before) => ({
          initial: config.minimumCount,
          batchSize: RECOVERY_EVM_ACCOUNT_BATCH,
          signal: context.signal,
          cancelled: `${label} watch-only scan cancelled.`,
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
      }
    }

    const warning = book.gap.warning;
    const section: RecoverySection = {
      id: "core",
      title: `${label} watch-only EOA addresses`,
      description: descriptionText,
      state: "complete",
      metrics: book.scanMetrics(format, scanned),
      findings,
      scanned,
      source: accounts.chain.rpc,
      proof: `${accounts.chain.name} JSON-RPC state at block ${accounts.blocks.latest ?? 0n} · chain id ${accounts.chain.chainId}`,
      ...(warning === undefined ? {} : { warning }),
    };
    return walletScan.result({
      overview: [
        ...book.overview(format, "Funded accounts"),
        { label: "Unique addresses queried", value: String(book.queried) },
      ],
      sections: [section],
      warnings: [
        `Only native ${asset} is scanned; tokens and smart-contract wallets require separate recovery tooling.`,
      ],
    });
  };
}

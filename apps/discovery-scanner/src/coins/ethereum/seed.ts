import { WalletScan } from "../../wallet-result.js";
import { BIP32_BRANCH_SIZE, assertAddressCount } from "@ckd/core/bip32-limits.js";
import { ETHEREUM_COIN } from "./coin.js";
import { SeedScanSecrets } from "../../seed-scan-secrets.js";
import { assertIndex, requirePublic, rootFromSeed } from "@ckd/core/bip32.js";
import { wipe } from "@ckd/core/crypto.js";
import { ethereumAddressOfKey } from "@ckd/coins/ethereum/index.js";
import { RECOVERY_EVM_ACCOUNT_BATCH } from "@ckd/network-boundary/protocol.js";
import type {
  RecoveryCoinAdapter,
  RecoveryScanConfig,
  RecoverySection,
  RecoverySeedInput,
  RecoveryWalletResult,
} from "../../types.js";
import { appendCustomPaths, customScanPaths } from "../custom-path.js";
import { ADDRESS_DISCOVERY_GAP } from "../../address-gap.js";
import { AddressBook, AddressFindings, scanBranches } from "../../address-book.js";
import { lookupBatches } from "../../scan-estimate.js";
import {
  ETHEREUM_SOURCES,
  ETHEREUM_VERSIONS,
  EthereumAccounts,
  ethereumChainLabel,
  formatEther,
} from "./shared.js";

interface EthereumPathProfile {
  id: string;
  label: string;
  path(index: number): string;
  maximumCount: number;
  initialCount: number;
}

/** The standard profiles of pathProfiles: BIP44, Ledger Live and legacy Ledger / MEW. */
const STANDARD_PROFILE_COUNT = 3;

function pathProfiles(
  config: RecoveryScanConfig,
): Iterable<EthereumPathProfile> & { readonly length: number } {
  const profiles: EthereumPathProfile[] = [
    {
      id: "standard",
      label: "Standard BIP44 · MetaMask / Trezor",
      path: (index) => `m/44'/60'/${config.account}'/0/${index}`,
      initialCount: config.coreReceiveCount,
      maximumCount: BIP32_BRANCH_SIZE,
    },
    {
      id: "ledger-live",
      label: "Ledger Live accounts",
      path: (index) => `m/44'/60'/${config.account + index}'/0/0`,
      initialCount: config.coreReceiveCount,
      maximumCount: BIP32_BRANCH_SIZE - config.account,
    },
    {
      id: "ledger-legacy",
      label: "Legacy Ledger / MEW",
      path: (index) => `m/44'/60'/0'/${index}`,
      initialCount: config.coreReceiveCount,
      maximumCount: BIP32_BRANCH_SIZE,
    },
  ];
  if (profiles.some((profile) => profile.initialCount > profile.maximumCount))
    throw new Error("The requested Ethereum scan range exceeds the BIP32 index space.");
  const custom = customScanPaths(config);
  if (custom.length > 0 && config.customPathFormat !== "eoa")
    throw new Error("Ethereum custom paths require the EOA address format.");
  return appendCustomPaths<EthereumPathProfile>(profiles, custom, (path) => ({
    id: path.id,
    label: `${path.label} · EVM`,
    path: path.path,
    initialCount: path.minimum,
    maximumCount: BIP32_BRANCH_SIZE,
  }));
}

function deriveAddress(root: ReturnType<typeof rootFromSeed>, path: string): string {
  const child = root.derive(path);
  const publicKey = requirePublic(child, path);
  try {
    return ethereumAddressOfKey(publicKey);
  } finally {
    wipe(publicKey);
    child.wipePrivateData();
  }
}

async function scanEthereum(
  input: RecoverySeedInput,
  config: RecoveryScanConfig,
  context: Parameters<RecoveryCoinAdapter["scan"]>[2],
): Promise<RecoveryWalletResult> {
  assertIndex(config.account, "Account");
  assertAddressCount(config.coreReceiveCount, "Ethereum address minimum");
  if (config.scanCustomPath === true)
    assertAddressCount(config.customPathCount ?? 0, "Custom path address count");
  const profiles = pathProfiles(config);
  const { secrets, seed, gateway } = SeedScanSecrets.forSeed(input, context);
  const root = rootFromSeed(seed, ETHEREUM_VERSIONS);
  const accounts = new EthereumAccounts(gateway, config.network, context.signal);
  const book = new AddressBook(accounts);
  const found = AddressFindings.reportedTo(context, input.id, "core");
  const walletScan = new WalletScan(input, ETHEREUM_COIN, config.network);
  try {
    const scanned = await scanBranches(profiles, (profile, before) => ({
      initial: profile.initialCount,
      batchSize: RECOVERY_EVM_ACCOUNT_BATCH,
      signal: context.signal,
      cancelled: "Ethereum scan cancelled.",
      derive: (index) => {
        const path = profile.path(index);
        return { address: deriveAddress(root, path), index, path };
      },
      lookUp: book.lookUpWith({
        includeUsedZeroBalance: config.includeUsedZeroBalance,
        maximum: profile.maximumCount,
      }),
      show: ({ derived: item, state: entry }) => {
        const balance = BigInt(entry.balance);
        found.show(accounts.key(item.address), item.path, () => ({
          id: `ethereum:${profile.id}:${item.index}`,
          title: item.address,
          subtitle: `${profile.label} · index ${item.index}`,
          balanceAtomic: balance,
          balanceLabel: formatEther(balance),
          fields: [
            { label: "Scan profile", value: profile.label },
            { label: "Derivation path", value: item.path, copyable: true },
            { label: "Profile index", value: String(item.index) },
            { label: "Transactions sent / nonce", value: BigInt(entry.nonce).toString() },
          ],
        }));
      },
      progress: (checked, target) =>
        context.onProgress({
          inputId: input.id,
          section: "core",
          message: `${profile.label}: checked ${checked} of ${target} derivation candidates`,
          completed: before + checked,
          total: null,
        }),
    }));
    const { lowest, highest } = accounts.blocks;
    const section: RecoverySection = {
      id: "core",
      title: "Ethereum EOA addresses",
      description: `Scans three standard EOA profiles${config.scanCustomPath ? " and the selected custom paths" : ""} through independent ${ADDRESS_DISCOVERY_GAP}-address post-use gaps.`,
      state: book.gap.truncated ? "partial" : "complete",
      metrics: [
        ...book.metrics(formatEther),
        { label: "Unique addresses queried", value: String(book.queried) },
        { label: "Derivation candidates", value: String(scanned) },
      ],
      findings: found.list,
      scanned,
      source: ETHEREUM_SOURCES[config.network],
      proof: `${ethereumChainLabel(config.network)} JSON-RPC account batches at heights ${lowest ?? "unavailable"}–${highest ?? "unavailable"} · independent ${ADDRESS_DISCOVERY_GAP}-address post-use gaps`,
      warning: [
        book.gap.warning,
        "Each account batch uses an explicit block height; different batches may use different heights. This is a single-source public RPC view, without a block-hash snapshot across reorganizations. ERC-20 token balances and contract-wallet ownership are not scanned.",
      ]
        .filter(Boolean)
        .join(" "),
    };
    return walletScan.result({
      overview: [
        ...book.overview(formatEther, "Funded accounts"),
        { label: "Used accounts", value: String(book.used) },
        { label: "Path profiles", value: String(profiles.length) },
        { label: "Unique addresses queried", value: String(book.queried) },
      ],
      sections: [section],
      warnings: [
        "Only native ETH in mnemonic-derived EOAs is scanned; tokens and smart-contract wallets require separate recovery tooling.",
      ],
    });
  } finally {
    root.wipePrivateData();
    secrets.close();
  }
}

export const ETHEREUM_SEED_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  ...ETHEREUM_COIN,
  // Every standard wallet profile, receive addresses only.
  minimumSeedLookups: (settings) =>
    STANDARD_PROFILE_COUNT * lookupBatches(settings.coreReceiveCount, RECOVERY_EVM_ACCOUNT_BATCH),
  scan: scanEthereum,
};

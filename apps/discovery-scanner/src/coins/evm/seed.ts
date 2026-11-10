// The seed scan of every EVM network: the three standard EOA profiles of EVM wallets and the custom
// paths, each through its post-use gap, read from the network's own JSON-RPC.
import { WalletScan } from "../../wallet-result.js";
import { BIP32_BRANCH_SIZE, assertAddressCount } from "@ckd/core/bip32-limits.js";
import { SeedScanSecrets } from "../../seed-scan-secrets.js";
import { assertIndex, requirePublic, rootFromSeed } from "@ckd/core/bip32.js";
import { wipe } from "@ckd/core/crypto.js";
import { evmAddressOfKey } from "@ckd/coins/keccak-account.js";
import { RECOVERY_EVM_ACCOUNT_BATCH } from "@ckd/network-boundary/protocol.js";
import { evmChain, type EvmNetworkFacts } from "@ckd/public-data-providers/evm-network-facts.js";
import type {
  RecoveryCoinAdapter,
  RecoveryScanConfig,
  RecoveryScanContext,
  RecoverySection,
  RecoverySeedInput,
  RecoveryWalletResult,
} from "../../types.js";
import { appendCustomPaths, customScanPaths } from "../custom-path.js";
import { ADDRESS_DISCOVERY_GAP } from "../../address-gap.js";
import { AddressBook, AddressFindings, scanBranches } from "../../address-book.js";
import { lookupBatches } from "../../scan-estimate.js";
import type { RecoveryCoinFacts } from "../registry.js";
import { EVM_VERSIONS, EvmAccounts, evmAmountFormatter } from "./accounts.js";
import { evmCoinFacts, type EvmCoinOptions } from "./coin.js";

interface EvmPathProfile {
  id: string;
  label: string;
  path(index: number): string;
  maximumCount: number;
  initialCount: number;
}

/** The standard profiles of pathProfiles: BIP44, Ledger Live and legacy Ledger / MEW. */
const STANDARD_PROFILE_COUNT = 3;

function pathProfiles(
  label: string,
  config: RecoveryScanConfig,
): Iterable<EvmPathProfile> & { readonly length: number } {
  const profiles: EvmPathProfile[] = [
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
    throw new Error(`The requested ${label} scan range exceeds the BIP32 index space.`);
  const custom = customScanPaths(config);
  if (custom.length > 0 && config.customPathFormat !== "eoa")
    throw new Error(`${label} custom paths require the EOA address format.`);
  return appendCustomPaths<EvmPathProfile>(profiles, custom, (path) => ({
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
    return evmAddressOfKey(publicKey);
  } finally {
    wipe(publicKey);
    child.wipePrivateData();
  }
}

/** The seed scan of the EVM network `facts`, reported as the coin `coin`. */
function evmSeedScan(facts: EvmNetworkFacts, coin: RecoveryCoinFacts) {
  const { label, asset } = facts;
  const format = evmAmountFormatter(facts);
  return async (
    input: RecoverySeedInput,
    config: RecoveryScanConfig,
    context: RecoveryScanContext,
  ): Promise<RecoveryWalletResult> => {
    assertIndex(config.account, "Account");
    assertAddressCount(config.coreReceiveCount, `${label} address minimum`);
    if (config.scanCustomPath === true)
      assertAddressCount(config.customPathCount ?? 0, "Custom path address count");
    const profiles = pathProfiles(label, config);
    // A network without this chain (most EVM networks have no testnet here) is refused before the
    // seed is copied.
    evmChain(facts, config.network);
    const { secrets, seed, gateway } = SeedScanSecrets.forSeed(input, context);
    const root = rootFromSeed(seed, EVM_VERSIONS);
    const chainAccounts = new EvmAccounts(gateway, facts, config.network, context.signal);
    const book = new AddressBook(chainAccounts);
    const found = AddressFindings.reportedTo(context, input.id, "core");
    const walletScan = new WalletScan(input, coin, config.network);
    try {
      const scanned = await scanBranches(profiles, (profile, before) => ({
        initial: profile.initialCount,
        batchSize: RECOVERY_EVM_ACCOUNT_BATCH,
        signal: context.signal,
        cancelled: `${label} scan cancelled.`,
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
          found.show(chainAccounts.key(item.address), item.path, () => ({
            id: `${facts.id}:${profile.id}:${item.index}`,
            title: item.address,
            subtitle: `${profile.label} · index ${item.index}`,
            balanceAtomic: balance,
            balanceLabel: format(balance),
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
      const { lowest, highest } = chainAccounts.blocks;
      const section: RecoverySection = {
        id: "core",
        title: `${label} EOA addresses`,
        description: `Scans three standard EOA profiles${config.scanCustomPath ? " and the selected custom paths" : ""} through independent ${ADDRESS_DISCOVERY_GAP}-address post-use gaps.`,
        state: book.gap.truncated ? "partial" : "complete",
        metrics: [
          ...book.metrics(format),
          { label: "Unique addresses queried", value: String(book.queried) },
          { label: "Derivation candidates", value: String(scanned) },
        ],
        findings: found.list,
        scanned,
        source: chainAccounts.chain.rpc,
        proof: `${chainAccounts.chain.name} JSON-RPC account batches at heights ${lowest ?? "unavailable"}–${highest ?? "unavailable"} · chain id ${chainAccounts.chain.chainId} · independent ${ADDRESS_DISCOVERY_GAP}-address post-use gaps`,
        warning: [
          book.gap.warning,
          "Each account batch uses an explicit block height; different batches may use different heights. This is a single-source public RPC view, without a block-hash snapshot across reorganizations. Token balances and contract-wallet ownership are not scanned.",
        ]
          .filter(Boolean)
          .join(" "),
      };
      return walletScan.result({
        overview: [
          ...book.overview(format, "Funded accounts"),
          { label: "Used accounts", value: String(book.used) },
          { label: "Path profiles", value: String(profiles.length) },
          { label: "Unique addresses queried", value: String(book.queried) },
        ],
        sections: [section],
        warnings: [
          `Only native ${asset} in mnemonic-derived EOAs is scanned; tokens and smart-contract wallets require separate recovery tooling.`,
        ],
      });
    } finally {
      root.wipePrivateData();
      secrets.close();
    }
  };
}

/**
 * The seed adapter of the EVM network `facts`, a EVM network table row; `options` adds what the row does
 * not say, such as Ethereum's history.
 */
export function createEvmSeedRecoveryAdapter(
  facts: EvmNetworkFacts,
  options: EvmCoinOptions = {},
): RecoveryCoinAdapter {
  const coin = evmCoinFacts(facts, options);
  return {
    ...coin,
    // Every standard wallet profile, receive addresses only.
    minimumSeedLookups: (settings) =>
      STANDARD_PROFILE_COUNT * lookupBatches(settings.coreReceiveCount, RECOVERY_EVM_ACCOUNT_BATCH),
    scan: evmSeedScan(facts, coin),
  };
}

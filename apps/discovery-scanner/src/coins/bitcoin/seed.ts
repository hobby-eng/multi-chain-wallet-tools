import { WalletScan } from "../../wallet-result.js";
import { assertAddressCount } from "@ckd/core/bip32-limits.js";
import { BITCOIN_COIN } from "./coin.js";
import { SeedScanSecrets } from "../../seed-scan-secrets.js";
import { assertIndex, requirePublic, rootFromSeed } from "@ckd/core/bip32.js";
import { bytesToHex, wipe } from "@ckd/core/crypto.js";
import { getBitcoinNetwork } from "@ckd/core/networks.js";
import { RECOVERY_UTXO_ADDRESS_BATCH } from "@ckd/network-boundary/protocol.js";
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
  addressFor,
  bitcoinAddressSource,
  BITCOIN_MODES as MODES,
  BITCOIN_PROOF,
  BITCOIN_SOURCES,
  formatBitcoin,
  type BitcoinMode,
} from "./shared.js";

interface BitcoinPathProfile {
  id: string;
  label: string;
  mode: BitcoinMode;
  initialCount: number;
  path(index: number): string;
}

function pathProfiles(
  config: RecoveryScanConfig,
  coinType: number,
): Iterable<BitcoinPathProfile> & { readonly length: number } {
  const profiles = MODES.flatMap((family) =>
    ([0, 1] as const).flatMap((branch) => {
      const initialCount = branch === 0 ? config.coreReceiveCount : config.coreChangeCount;
      return initialCount === 0
        ? []
        : [
            {
              id: `${family.mode}:${branch}`,
              label: `${family.label} · ${branch === 0 ? "receive / external" : "change / internal"}`,
              mode: family.mode,
              initialCount,
              path: (index: number) =>
                `m/${family.purpose}'/${coinType}'/${config.account}'/${branch}/${index}`,
            },
          ];
    }),
  );
  const custom = customScanPaths(config);
  const selectedMode = MODES.find((entry) => entry.mode === config.customPathFormat);
  if (custom.length > 0 && selectedMode === undefined)
    throw new Error("Select a valid Bitcoin address format for the custom path.");
  return appendCustomPaths<BitcoinPathProfile>(profiles, custom, (parsed) => ({
    id: parsed.id,
    label: `${parsed.label} · ${selectedMode!.label}`,
    mode: selectedMode!.mode,
    initialCount: parsed.minimum,
    path: parsed.path,
  }));
}

async function scanBitcoin(
  input: RecoverySeedInput,
  config: RecoveryScanConfig,
  context: Parameters<RecoveryCoinAdapter["scan"]>[2],
): Promise<RecoveryWalletResult> {
  assertIndex(config.account, "Account");
  assertAddressCount(config.coreReceiveCount, "Bitcoin receive count", 0);
  assertAddressCount(config.coreChangeCount, "Bitcoin change count", 0);
  if (config.coreReceiveCount + config.coreChangeCount < 1)
    throw new Error("At least one Bitcoin receive or change address must be scanned.");
  if (config.scanCustomPath === true)
    assertAddressCount(config.customPathCount ?? 0, "Custom path address count");
  const network = getBitcoinNetwork(config.network);
  const profiles = pathProfiles(config, network.coinType);
  const { secrets, seed, gateway } = SeedScanSecrets.forSeed(input, context);
  const root = rootFromSeed(seed, network.versions);
  const book = new AddressBook(bitcoinAddressSource(gateway, config.network, context.signal));
  const found = AddressFindings.reportedTo(context, input.id, "core");
  const walletScan = new WalletScan(input, BITCOIN_COIN, config.network);
  try {
    const scanned = await scanBranches(profiles, (profile, before) => ({
      initial: profile.initialCount,
      batchSize: RECOVERY_UTXO_ADDRESS_BATCH,
      signal: context.signal,
      cancelled: "Bitcoin scan cancelled.",
      derive: (index) => {
        const path = profile.path(index);
        const child = root.derive(path);
        const publicKey = requirePublic(child, path);
        try {
          return {
            address: addressFor(profile.mode, publicKey, network),
            index,
            path,
            publicKey: bytesToHex(publicKey),
          };
        } finally {
          wipe(publicKey);
          child.wipePrivateData();
        }
      },
      lookUp: book.lookUpWith({ includeUsedZeroBalance: config.includeUsedZeroBalance }),
      show: ({ derived: item, state: entry }) => {
        const balance = BigInt(entry.balance);
        found.show(item.address, item.path, () => ({
          id: `bitcoin:${profile.id}:${item.index}`,
          title: item.address,
          subtitle: `${profile.label} · index ${item.index}`,
          balanceAtomic: balance,
          balanceLabel: formatBitcoin(balance),
          fields: [
            { label: "Scan family", value: profile.label },
            { label: "Derivation path", value: item.path, copyable: true },
            { label: "Profile index", value: String(item.index) },
            { label: "Transactions reported", value: String(entry.transactionCount) },
            { label: "Public key", value: item.publicKey, copyable: true },
          ],
        }));
      },
      progress: (checked, target) =>
        context.onProgress({
          inputId: input.id,
          section: "core",
          message: `${profile.label}: checked ${checked} of ${target}`,
          completed: before + checked,
          total: null,
        }),
    }));
    const section: RecoverySection = {
      id: "core",
      title: "Bitcoin wallet addresses",
      description: `Scans BIP44 legacy, BIP49 nested SegWit, BIP84 native SegWit, BIP86 Taproot${config.scanCustomPath === true ? ", and the selected custom path" : ""}.`,
      state: book.gap.truncated ? "partial" : "complete",
      metrics: [
        ...book.metrics(formatBitcoin),
        { label: "Unique addresses queried", value: String(book.queried) },
        { label: "Derivation candidates", value: String(scanned) },
      ],
      findings: found.list,
      scanned,
      source: BITCOIN_SOURCES[config.network],
      proof: `${BITCOIN_PROOF} · ${ADDRESS_DISCOVERY_GAP}-address post-use gap per path profile`,
      warning: [
        book.gap.warning,
        "Public Bitcoin indexes can lag or disagree. Verify every funded address in a standard Bitcoin wallet before recovery.",
      ]
        .filter(Boolean)
        .join(" "),
    };
    return walletScan.result({
      overview: [
        ...book.overview(formatBitcoin),
        { label: "Path profiles", value: String(profiles.length) },
        { label: "Unique addresses queried", value: String(book.queried) },
      ],
      sections: [section],
      warnings: [
        "Restore discovered paths in a standard Bitcoin wallet and independently verify balances before moving funds.",
      ],
    });
  } finally {
    root.wipePrivateData();
    secrets.close();
  }
}

export const BITCOIN_SEED_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  ...BITCOIN_COIN,
  // Every standard address family, on its receive and its change branch.
  minimumSeedLookups: (settings) =>
    MODES.length *
    (lookupBatches(settings.coreReceiveCount, RECOVERY_UTXO_ADDRESS_BATCH) +
      lookupBatches(settings.coreChangeCount, RECOVERY_UTXO_ADDRESS_BATCH)),
  scan: scanBitcoin,
};

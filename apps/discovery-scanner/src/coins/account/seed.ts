// The seed scan of every account coin: each address layout of the coin (the Deriver's variants, and
// BIP44's account index), each through its post-use gap, its addresses derived by the coin's own
// derivation without private key forms and read from the coin's own provider.
import { assertAddressCount } from "@ckd/core/bip32-limits.js";
import { assertIndex } from "@ckd/core/bip32.js";
import type { AddressLayout, CoinAddressScheme, SeedAddresses } from "@ckd/coins/address-scheme.js";
import {
  ACCOUNT_COIN_ERRORS,
  type AccountCoinFacts,
} from "@ckd/public-data-providers/account-coin-facts.js";
import { WalletScan, amountFormatter } from "../../wallet-result.js";
import { SeedScanSecrets } from "../../seed-scan-secrets.js";
import type { AccountStateView } from "@ckd/network-boundary/protocol.js";
import type {
  RecoveryCoinAdapter,
  RecoveryFinding,
  RecoveryScanConfig,
  RecoverySection,
} from "../../types.js";
import { ADDRESS_DISCOVERY_GAP } from "../../address-gap.js";
import { AddressBook, AddressFindings, scanBranches } from "../../address-book.js";
import { lookupBatches } from "../../scan-estimate.js";
import type { RecoveryCoinFacts } from "../registry.js";
import { accountCoinFacts } from "./coin.js";
import { AccountStates } from "./states.js";

/** A layout of one scan: its addresses from the scan's account on, and how many it may reach. */
interface ScanProfile {
  readonly layout: AddressLayout;
  readonly maximumCount: number;
}

/**
 * The scan's profiles, its settings checked before the seed is read: an ordinary account, an
 * address minimum within each layout's index space, and Mainnet, the account coins' only network.
 */
function scanProfiles(
  label: string,
  addresses: CoinAddressScheme,
  config: RecoveryScanConfig,
): ScanProfile[] {
  assertIndex(config.account, "Account");
  assertAddressCount(config.coreReceiveCount, `${label} address minimum`);
  if (config.network !== "mainnet") throw ACCOUNT_COIN_ERRORS.network(label);
  const profiles = addresses.layouts.map((layout) => ({
    layout,
    maximumCount: layout.maximumCount(config.account),
  }));
  if (profiles.some(({ maximumCount }) => config.coreReceiveCount > maximumCount))
    throw new Error(`The requested ${label} scan range exceeds the BIP32 index space.`);
  return profiles;
}

/** What the section says besides its gap: the provider's view and what it leaves out. */
const ACCOUNT_SECTION_WARNING =
  "Each request reads the provider's latest state, so different requests may read different heights; this is a single-source public provider view. Balances include any reserve the network keeps locked. An account that was emptied and closed no longer exists on its network and reads as unused, unless the provider still lists its transactions (Solana's signatures). Tokens, staked amounts and transaction history are not read.";

/** The section proof's heights, or that the provider reports none. */
function heightsText(heights: { lowest: bigint | null; highest: bigint | null }): string {
  const { lowest, highest } = heights;
  return lowest === null || highest === null
    ? "the provider reports no height"
    : `at heights ${lowest}–${highest}`;
}

/** The finding of a shown address of `layout`: its path, index and account. */
function accountFinding(
  facts: AccountCoinFacts,
  layout: AddressLayout,
  item: { readonly address: string; readonly index: number; readonly path: string },
  state: AccountStateView,
): RecoveryFinding {
  const balance = BigInt(state.balance);
  return {
    id: `${facts.id}:${layout.id}:${item.index}`,
    title: item.address,
    subtitle: `${layout.label} · index ${item.index}`,
    balanceAtomic: balance,
    balanceLabel: amountFormatter(facts)(balance),
    fields: [
      { label: "Scan profile", value: layout.label },
      { label: "Derivation path", value: item.path, copyable: true },
      { label: "Profile index", value: String(item.index) },
      {
        label: "Account on the network",
        value: state.exists ? "Exists" : "Not held now; transactions listed",
      },
      ...(state.sequence === null ? [] : [{ label: "Account sequence", value: state.sequence }]),
    ],
  };
}

/** The seed scan of the account coin `facts`, reported as the coin `coin`. */
function accountSeedScan(
  facts: AccountCoinFacts,
  addresses: CoinAddressScheme,
  coin: RecoveryCoinFacts,
): RecoveryCoinAdapter["scan"] {
  const { label, asset } = facts;
  const format = amountFormatter(facts);
  return async (input, config, context) => {
    const profiles = scanProfiles(label, addresses, config);
    const { secrets, seed, gateway } = SeedScanSecrets.forSeed(input, context);
    let opened: SeedAddresses | undefined;
    try {
      const seedAddresses = addresses.open(seed);
      // Held for the wipe below; the scan's callbacks read the constant.
      opened = seedAddresses;
      const states = new AccountStates(gateway, facts, context.signal);
      const book = new AddressBook(states);
      const found = AddressFindings.reportedTo(context, input.id, "core");
      const walletScan = new WalletScan(input, coin, config.network);
      const scanned = await scanBranches(profiles, ({ layout, maximumCount }, before) => ({
        initial: config.coreReceiveCount,
        batchSize: facts.batch,
        signal: context.signal,
        cancelled: `${label} scan cancelled.`,
        derive: (index) => ({
          address: seedAddresses.address(layout, config.account, index),
          index,
          path: layout.path(config.account, index),
        }),
        lookUp: book.lookUpWith({
          includeUsedZeroBalance: config.includeUsedZeroBalance,
          maximum: maximumCount,
        }),
        show: ({ derived: item, state }) =>
          found.show(item.address, item.path, () => accountFinding(facts, layout, item, state)),
        progress: (checked, target) =>
          context.onProgress({
            inputId: input.id,
            section: "core",
            message: `${layout.label}: checked ${checked} of ${target} derivation candidates`,
            completed: before + checked,
            total: null,
          }),
      }));
      const section: RecoverySection = {
        id: "core",
        title: `${label} addresses`,
        description: `Scans ${profiles.length} wallet path profile${profiles.length === 1 ? "" : "s"} through independent ${ADDRESS_DISCOVERY_GAP}-address post-use gaps.`,
        state: book.gap.truncated ? "partial" : "complete",
        metrics: book.scanMetrics(format, scanned),
        findings: found.list,
        scanned,
        source: facts.endpoint,
        proof: `${label} account states from ${new URL(facts.endpoint).host} ${heightsText(states.heights)} · independent ${ADDRESS_DISCOVERY_GAP}-address post-use gaps`,
        warning: [book.gap.warning, ACCOUNT_SECTION_WARNING].filter(Boolean).join(" "),
      };
      return walletScan.result({
        overview: book.accountOverview(format, profiles.length),
        sections: [section],
        warnings: [
          `Only native ${asset} at the listed path profiles is scanned; tokens, staking and other wallets' paths require separate recovery tooling.`,
        ],
      });
    } finally {
      try {
        opened?.wipe();
      } finally {
        secrets.close();
      }
    }
  };
}

/**
 * The seed adapter of the account coin `facts` (an account coin table row), whose addresses
 * `addresses` derives: the coin's own derivation (packages/coin-protocols/src/coins/<coin>/).
 */
export function createAccountSeedRecoveryAdapter(
  facts: AccountCoinFacts,
  addresses: CoinAddressScheme,
): RecoveryCoinAdapter {
  const coin = accountCoinFacts(facts, addresses);
  return {
    ...coin,
    // Every layout, from the minimum; each provider request reads addressesPerRequest addresses.
    minimumSeedLookups: (settings) =>
      addresses.layouts.length *
      lookupBatches(settings.coreReceiveCount, facts.addressesPerRequest),
    scan: accountSeedScan(facts, addresses, coin),
  };
}

// The facts of an EVM network that its seed and watch-only adapters share, all from its row of the
// EVM network table: one factory for Ethereum and every other EVM network, so that a network is one
// row.
import type { CoinAddressScheme } from "@ckd/coins/address-scheme.js";
import {
  evmAmountUnit,
  evmNetworkNames,
  type EvmNetworkFacts,
} from "@ckd/public-data-providers/evm-network-facts.js";
import { ADDRESS_DISCOVERY_GAP } from "../../address-gap.js";
import { evmScanEstimate } from "../../scan-estimate.js";
import type { RecoveryCoinFacts } from "../registry.js";
import { evmCustomPathTemplate, evmLayouts, evmOwnLayoutsNote } from "./layouts.js";

/** The coin menus' group of every EVM network, Ethereum's included. */
export const EVM_NETWORK_GROUP = "EVM networks";

/**
 * What scanning several of a build's EVM networks (`networks`) reveals, said beside their box and in
 * each scan's note: every chosen network's provider receives the same derived addresses, and an
 * operator that runs the endpoints of several of them can link them.
 */
export function evmNetworkPrivacy(
  networks: readonly Pick<EvmNetworkFacts, "rpcOperator">[],
): string {
  const counts = new Map<string, number>();
  for (const { rpcOperator } of networks)
    counts.set(rpcOperator, (counts.get(rpcOperator) ?? 0) + 1);
  const linking = [...counts]
    .filter(([, count]) => count > 1)
    .map(
      ([operator, count]) =>
        `; ${operator} runs the endpoints of ${count < networks.length ? `${count} of these ${networks.length} networks` : count === 2 ? "both networks" : `all ${count} networks`} and can link them`,
    );
  return `Each selected network's provider receives the same derived addresses with your IP address${linking.join("")}. Choose only the networks the wallet used.`;
}

/**
 * Where a finding the Deriver cannot show is recovered: the Deriver takes no custom path, and has no
 * row of the legacy Ledger paths (m/44'/60'/0'/i, and Ethereum Classic's m/44'/60'/160720'/0'/i).
 */
const EVM_DERIVER_NOTE =
  "A finding at a legacy Ledger path or at a custom path cannot be opened in the Deriver, which takes no custom paths; recover it with Ledger Live, MEW or another wallet that takes the path.";

/** What an EVM network adds to its row where the build has it. */
export interface EvmCoinOptions {
  /** Its history, where its row names a history endpoint (Ethereum, Ethereum Classic). */
  readonly getHistory?: RecoveryCoinFacts["getHistory"];
  /**
   * Its own wallets' layouts, checked before Ethereum's: its Deriver coin's public address scheme
   * (Ethereum Classic's), which only a seed scan derives. A build without seed discovery
   * deliberately carries none of that coin's derivation modules (CORE-31), so its facts describe
   * Ethereum's layouts; it runs no seed scan that could use them.
   */
  readonly addresses?: CoinAddressScheme;
  /**
   * The privacy note of the build's EVM networks (evmNetworkPrivacy); by default, that of the
   * network alone.
   */
  readonly privacy?: string;
}

/** The coin facts of the EVM network `facts`; without `getHistory` its history is unsupported. */
export function evmCoinFacts(
  facts: EvmNetworkFacts,
  options: EvmCoinOptions = {},
): RecoveryCoinFacts {
  const { label } = facts;
  const layouts = evmLayouts(options.addresses);
  const ownNote = evmOwnLayoutsNote(facts, options.addresses);
  const privacy = options.privacy ?? evmNetworkPrivacy([facts]);
  const template = evmCustomPathTemplate(options.addresses);
  return {
    id: facts.id,
    label,
    networks: evmNetworkNames(facts),
    group: EVM_NETWORK_GROUP,
    groupNote: privacy,
    amountUnit: () => evmAmountUnit(facts),
    ...(options.getHistory === undefined ? {} : { getHistory: options.getHistory }),
    // A custom path starts from the network's own first layout: Ethereum's, or its wallets' own.
    customPath: {
      description: `Optional; the ${layouts.length} standard profiles stay enabled.`,
      placeholder: template,
      defaultTemplate: () => template,
      formats: [{ id: "eoa", label: `${label} EOA · EIP-55` }],
    },
    standardScan: {
      receiveLabel: `${label} EOA address minimum`,
      coverage: `Scan ${layouts.length} common ${label} externally owned account path profiles.`,
      note: `${label} discovery checks ${layouts.map((layout) => layout.label).join("; ")} by default, extending each through a ${ADDRESS_DISCOVERY_GAP}-address post-use gap.${ownNote === undefined ? "" : ` In these paths, a is the Account setting, and account indexes i' start at it; a path without a or i' ignores the Account setting. ${ownNote}`} Duplicate addresses are queried and counted once. ${EVM_DERIVER_NOTE} Tokens and contract wallets are outside this scan. ${privacy}`,
      startLabel: `Scan ${label} holdings`,
      estimate: (receiveCount, _changeCount, estimate) =>
        evmScanEstimate(label, layouts.length, receiveCount, estimate),
    },
  };
}

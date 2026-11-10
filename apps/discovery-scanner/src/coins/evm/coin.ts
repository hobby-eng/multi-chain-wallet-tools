// The facts of an EVM network that its seed and watch-only adapters share, all from its row of the
// EVM network table: one factory for Ethereum and every other EVM network, so that a network is one
// row.
import {
  evmAmountUnit,
  evmNetworkNames,
  type EvmNetworkFacts,
} from "@ckd/public-data-providers/evm-network-facts.js";
import { ADDRESS_DISCOVERY_GAP } from "../../address-gap.js";
import { evmScanEstimate } from "../../scan-estimate.js";
import type { RecoveryCoinFacts } from "../registry.js";

/** The coin menus' group of every EVM network, Ethereum's included. */
export const EVM_NETWORK_GROUP = "EVM networks";

/** What scanning several EVM networks reveals, said beside their box and in each scan's note. */
const EVM_NETWORK_PRIVACY =
  "Each selected network's provider (PublicNode for all of them) receives the same derived addresses with your IP address, so choose only the networks the wallet used.";

/** What an EVM network adds to its row: its history, where the tools read one (Ethereum). */
export interface EvmCoinOptions {
  readonly getHistory?: RecoveryCoinFacts["getHistory"];
}

/** The coin facts of the EVM network `facts`; without `getHistory` its history is unsupported. */
export function evmCoinFacts(
  facts: EvmNetworkFacts,
  options: EvmCoinOptions = {},
): RecoveryCoinFacts {
  const { label } = facts;
  return {
    id: facts.id,
    label,
    networks: evmNetworkNames(facts),
    group: EVM_NETWORK_GROUP,
    groupNote: EVM_NETWORK_PRIVACY,
    amountUnit: () => evmAmountUnit(facts),
    ...(options.getHistory === undefined ? {} : { getHistory: options.getHistory }),
    // Every EVM network's wallets derive their 0x accounts at Ethereum's coin type 60.
    customPath: {
      description: "Optional; three standard profiles stay enabled.",
      placeholder: "m/44'/60'/0'/0/{index}",
      defaultTemplate: () => "m/44'/60'/0'/0/{index}",
      formats: [{ id: "eoa", label: `${label} EOA · EIP-55` }],
    },
    standardScan: {
      receiveLabel: `${label} EOA address minimum`,
      coverage: `Scan three common ${label} externally owned account path profiles.`,
      note: `${label} discovery checks Standard BIP44, Ledger Live, and Legacy Ledger paths by default, extending each through a ${ADDRESS_DISCOVERY_GAP}-address post-use gap. Duplicate addresses are queried and counted once. Tokens and contract wallets are outside this scan. ${EVM_NETWORK_PRIVACY}`,
      startLabel: `Scan ${label} holdings`,
      estimate: (receiveCount, _changeCount, estimate) =>
        evmScanEstimate(label, receiveCount, estimate),
    },
  };
}

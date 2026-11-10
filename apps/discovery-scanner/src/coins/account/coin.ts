// The facts of an account coin that its seed scan shows, from its row of the account coin table and
// its address layouts (the Deriver's variants): one factory for every account coin, so that a coin is
// its row and its derivation.
import type { CoinAddressScheme } from "@ckd/coins/address-scheme.js";
import {
  accountAmountUnit,
  type AccountCoinFacts,
} from "@ckd/public-data-providers/account-coin-facts.js";
import { ADDRESS_DISCOVERY_GAP } from "../../address-gap.js";
import { accountScanEstimate } from "../../scan-estimate.js";
import type { RecoveryCoinFacts } from "../registry.js";

/**
 * The coin menus' group of every account coin. The coins share no family name a person knows them
 * by, as the EVM networks do: someone who finds a coin neither by its own name nor among the EVM
 * networks looks for it among the other networks.
 */
export const ACCOUNT_COIN_GROUP = "Other networks";

/** What scanning several of these networks reveals, said beside their box and in each scan's note. */
const ACCOUNT_COIN_PRIVACY =
  "Each selected network's provider receives that network's derived addresses with your IP address, so choose only the networks the wallet used.";

/** The coin facts of the account coin `facts`, whose addresses `addresses` derives. */
export function accountCoinFacts(
  facts: AccountCoinFacts,
  addresses: CoinAddressScheme,
): RecoveryCoinFacts {
  const { label } = facts;
  const profiles = addresses.layouts.length;
  return {
    id: facts.id,
    label,
    networks: ["mainnet"],
    group: ACCOUNT_COIN_GROUP,
    groupNote: ACCOUNT_COIN_PRIVACY,
    amountUnit: () => accountAmountUnit(facts),
    standardScan: {
      receiveLabel: `${label} address minimum`,
      coverage: `Scan ${profiles} ${label} wallet path profile${profiles === 1 ? "" : "s"}.`,
      note: `${label} discovery checks ${addresses.layouts.map((layout) => layout.label).join("; ")}, extending each through a ${ADDRESS_DISCOVERY_GAP}-address post-use gap; a is the Account setting, and account indexes i' start at it. It reads each address's ${facts.asset} balance and whether the network holds its account; tokens, staking and transaction history are outside this scan, and custom paths are not offered. ${ACCOUNT_COIN_PRIVACY}`,
      startLabel: `Scan ${label} holdings`,
      estimate: (receiveCount, _changeCount, estimate) =>
        accountScanEstimate(label, profiles, receiveCount, estimate),
    },
  };
}

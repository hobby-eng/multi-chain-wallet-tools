import { balanceOnlyHistory } from "@ckd/network-boundary/recovery-history.js";
import { normalizeEthereumAddress } from "@ckd/public-data-providers/address-normalization.js";
import type { EthereumPublicDataService } from "@ckd/public-data-providers/ethereum-service.js";
import {
  EVM_DECIMALS,
  EVM_NETWORK_ERRORS,
  evmAmountUnit,
  evmChain,
  evmNetworkNames,
  type EvmNetworkFacts,
} from "@ckd/public-data-providers/evm-network-facts.js";
import type { EvmAccountService } from "@ckd/public-data-providers/evm-service.js";
import type { PublicDataNetwork, RecoveryHistory } from "@ckd/public-data-providers/types.js";
import type { ExternalActivityAdapter } from "./external-activity.js";

type EvmAccountReader = Pick<EvmAccountService, "accounts">;
type EvmHistoryReader = Pick<EthereumPublicDataService, "addressHistory">;

/** The name of the EIP-55 known answers, the same for every EVM network, so listed once. */
const EIP55_CHECK = "EVM EIP-55 address checksum";

// EIP-55's own example address: lower case gets its checksum, and a wrong mixed case is refused.
function eip55SelfTest(): readonly string[] {
  const checksummed = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
  if (normalizeEthereumAddress(checksummed.toLowerCase()) !== checksummed)
    throw new Error("Self-test failed: EIP-55 checksum.");
  let refused = false;
  try {
    normalizeEthereumAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD");
  } catch {
    refused = true;
  }
  if (!refused) throw new Error("Self-test failed: EIP-55 refusal of a wrong checksum.");
  return [EIP55_CHECK];
}

/** The history of a network whose history the tools do not read: unsupported, never empty. */
function evmBalanceOnlyHistory(
  facts: EvmNetworkFacts,
  network: PublicDataNetwork,
): RecoveryHistory {
  return balanceOnlyHistory(
    evmAmountUnit(facts),
    facts.label,
    evmChain(facts, network).rpc,
    "balance and account nonce",
  );
}

/**
 * The public-address activity of the EVM network `facts` (a row of the EVM network table): balance
 * and nonce from `accounts`, and history from `history` where the network has one (Ethereum's
 * Blockscout).
 */
export function createEvmActivityAdapter(
  facts: EvmNetworkFacts,
  accounts: EvmAccountReader,
  history?: EvmHistoryReader,
): ExternalActivityAdapter {
  const { label } = facts;
  return {
    id: facts.id,
    label,
    asset: facts.asset,
    decimals: EVM_DECIMALS,
    networks: evmNetworkNames(facts),
    readsHistory: history !== undefined,
    nonceLabel: "Account nonce",
    singlePlaceholder: `Paste a ${label} 0x address`,
    batchPlaceholder: `One ${label} 0x address per line`,
    normalize: (value) => normalizeEthereumAddress(value),
    selfTest: eip55SelfTest,
    dedupeKey: (value) => value.toLowerCase(),
    async query(address, network, signal) {
      const [found, batch] = await Promise.all([
        history === undefined
          ? evmBalanceOnlyHistory(facts, network)
          : history.addressHistory(network, address, signal),
        accounts.accounts(facts.id, network, [address], signal),
      ]);
      const [account] = batch.entries;
      if (account === undefined) throw EVM_NETWORK_ERRORS.response(label, "no account state");
      return {
        coin: facts.id,
        address: account.address,
        balanceAtomic: BigInt(account.balance),
        nonce: BigInt(account.nonce),
        blockHeight: BigInt(batch.blockNumber),
        history: found,
      };
    },
  };
}

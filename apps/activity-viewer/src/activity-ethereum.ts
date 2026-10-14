import { normalizeEthereumAddress } from "@ckd/public-data-providers/address-normalization.js";
import { EthereumPublicDataService } from "@ckd/public-data-providers/ethereum-service.js";
import type { ExternalActivityAdapter } from "./external-activity.js";

type EthereumActivityService = Pick<EthereumPublicDataService, "addressHistory" | "evmAccounts">;

export function createEthereumActivityAdapter(
  service: EthereumActivityService = new EthereumPublicDataService(),
): ExternalActivityAdapter {
  return {
    id: "ethereum",
    label: "Ethereum",
    asset: "ETH",
    decimals: 18,
    singlePlaceholder: "Paste an Ethereum 0x address",
    batchPlaceholder: "One Ethereum address per line",
    normalize: (value) => normalizeEthereumAddress(value),
    // EIP-55's own example address: lower case gets its checksum, and a wrong mixed case is refused.
    selfTest() {
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
      return ["Ethereum EIP-55 address checksum"];
    },
    dedupeKey: (value) => value.toLowerCase(),
    async query(address, network, signal) {
      const [history, accounts] = await Promise.all([
        service.addressHistory(network, address, signal),
        service.evmAccounts(network, [address], signal),
      ]);
      const account = accounts.entries[0]!;
      return {
        coin: "ethereum",
        address: account.address,
        balanceAtomic: BigInt(account.balance),
        nonce: BigInt(account.nonce),
        blockHeight: BigInt(accounts.blockNumber),
        history,
      };
    },
  };
}

export const ETHEREUM_ACTIVITY_ADAPTER = createEthereumActivityAdapter();

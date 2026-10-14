import { normalizeBitcoinAddress } from "@ckd/public-data-providers/address-normalization.js";
import { BitcoinPublicDataService } from "@ckd/public-data-providers/bitcoin-service.js";
import type { ExternalActivityAdapter } from "./external-activity.js";

type BitcoinActivityService = Pick<BitcoinPublicDataService, "addressHistory" | "utxoAddresses">;

export function createBitcoinActivityAdapter(
  service: BitcoinActivityService = new BitcoinPublicDataService(),
): ExternalActivityAdapter {
  return {
    id: "bitcoin",
    label: "Bitcoin",
    asset: "BTC",
    decimals: 8,
    singlePlaceholder: "Paste a Bitcoin address",
    batchPlaceholder: "One Bitcoin address per line",
    normalize: normalizeBitcoinAddress,
    // BIP173's and BIP350's valid addresses pass in their canonical lower case, and BIP173's
    // address with one changed checksum character is refused.
    selfTest() {
      const vectors = [
        [
          "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4",
          "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        ],
        [
          "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
          "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
        ],
      ];
      for (const [typed, canonical] of vectors)
        if (normalizeBitcoinAddress(typed, "mainnet") !== canonical)
          throw new Error("Self-test failed: Bitcoin address normalization.");
      let refused = false;
      try {
        normalizeBitcoinAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5", "mainnet");
      } catch {
        refused = true;
      }
      if (!refused) throw new Error("Self-test failed: Bitcoin address checksum refusal.");
      return ["Bitcoin BIP173/BIP350 address checksum"];
    },
    dedupeKey: (value) => value,
    async query(address, network, signal) {
      const [history, entries] = await Promise.all([
        service.addressHistory(network, address, signal),
        service.utxoAddresses(network, [address], signal),
      ]);
      return {
        coin: "bitcoin",
        address,
        balanceAtomic: BigInt(entries[0]!.balance),
        nonce: null,
        blockHeight: null,
        history,
      };
    },
  };
}

export const BITCOIN_ACTIVITY_ADAPTER = createBitcoinActivityAdapter();

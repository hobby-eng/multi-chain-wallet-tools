import { PROVIDER_UNSIGNED_DECIMAL } from "@ckd/core/numeric-limits.js";
import { BitcoinPurposeProfile, type BitcoinMode } from "@ckd/coins/bitcoin/profiles.js";
import type { UtxoAddressView } from "@ckd/network-boundary/protocol.js";
import type { AddressSource } from "../../address-book.js";
import type { RecoveryNetworkGateway } from "../../network-gateway.js";
import type { RecoveryNetwork } from "../../types.js";
import { amountFormatter } from "../../wallet-result.js";
import { getBitcoinNetwork } from "@ckd/core/networks.js";
import { BITCOIN_SINGLE_KEY_ENCODINGS } from "@ckd/coins/bitcoin/single-key-addresses.js";
import { Taproot } from "@ckd/coins/bitcoin/taproot.js";

export type { BitcoinMode } from "@ckd/coins/bitcoin/profiles.js";

export const BITCOIN_MODES = BitcoinPurposeProfile.profiles.map((profile) => ({
  mode: profile.mode,
  label: profile.label,
  purpose: profile.purpose,
}));

/** An amount in satoshis, written in BTC. */
export const formatBitcoin = amountFormatter({ asset: "BTC", decimals: 8 });

export function addressFor(
  mode: BitcoinMode,
  publicKey: Uint8Array,
  network: ReturnType<typeof getBitcoinNetwork>,
): string {
  return mode === "taproot"
    ? Taproot.address(publicKey, network).address
    : BITCOIN_SINGLE_KEY_ENCODINGS[mode](publicKey, network).address;
}

/** The providers a Bitcoin section names as its source. */
export const BITCOIN_SOURCES: Readonly<Record<RecoveryNetwork, string>> = {
  mainnet:
    "https://blockchain.info · fallbacks https://api.blockcypher.com, https://blockstream.info, and https://mempool.space",
  testnet:
    "https://api.blockcypher.com · fallbacks https://blockstream.info/testnet and https://mempool.space/testnet",
};

/** What a Bitcoin section's balances rest on. */
export const BITCOIN_PROOF =
  "Indexed Bitcoin chain and mempool state · batch lookup where available · bounded retry with provider failover";

/** The Bitcoin address service as the source of an address book, its answers checked. */
export function bitcoinAddressSource(
  gateway: RecoveryNetworkGateway,
  network: RecoveryNetwork,
  signal: AbortSignal,
): AddressSource<UtxoAddressView> {
  return {
    async lookUp(addresses) {
      const value = await gateway.runPublic(
        { network, addresses },
        "utxo.addresses",
        () => gateway.networkApi.utxoAddresses(network, [...addresses], signal),
        signal,
      );
      if (!Array.isArray(value) || value.length !== addresses.length)
        throw new Error("Bitcoin address service returned an incomplete batch.");
      return value.map((entry, index) => {
        if (
          entry.address !== addresses[index] ||
          !PROVIDER_UNSIGNED_DECIMAL.test(entry.balance) ||
          !Number.isSafeInteger(entry.transactionCount) ||
          entry.transactionCount < 0
        )
          throw new Error("Bitcoin address service returned malformed data.");
        return entry;
      });
    },
    balance: (entry) => BigInt(entry.balance),
    used: (entry) => entry.transactionCount > 0 || BigInt(entry.balance) > 0n,
  };
}

// The facts of Bitcoin that its seed and its watch-only adapters share.
import type { RecoveryCoinFacts } from "../registry.js";
import { bitcoinScanEstimate } from "../../scan-estimate.js";
import { getBitcoinHistory } from "./history.js";

export const BITCOIN_COIN: RecoveryCoinFacts = {
  id: "bitcoin",
  amountUnit: () => ({ asset: "BTC", atomicUnit: "satoshis", decimals: 8 }),
  getHistory: getBitcoinHistory,
  label: "Bitcoin",
  networks: ["mainnet", "testnet"],
  customPath: {
    description: "Optional; four standard families stay enabled.",
    placeholder: "m/44'/0'/0'/0/{index}",
    defaultTemplate: (network) => `m/44'/${network === "mainnet" ? 0 : 1}'/0'/0/{index}`,
    formats: [
      { id: "legacy", label: "Legacy · P2PKH" },
      { id: "nested-segwit", label: "Nested SegWit · P2SH-P2WPKH" },
      { id: "native-segwit", label: "Native SegWit · P2WPKH" },
      { id: "taproot", label: "Taproot · BIP86 P2TR" },
    ],
  },
  standardScan: {
    receiveLabel: "Receive addresses per Bitcoin family",
    changeLabel: "Change addresses per Bitcoin family",
    coverage: "Scan the standard Bitcoin BIP44, BIP49, BIP84, and BIP86 receive/change families.",
    note: "Bitcoin discovery includes legacy, nested SegWit, native SegWit, and Taproot, extending every receive/change chain through a 20-address post-use gap.",
    startLabel: "Scan Bitcoin holdings",
    estimate: bitcoinScanEstimate,
  },
};

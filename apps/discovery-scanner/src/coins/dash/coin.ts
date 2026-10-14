// The facts of Dash that its seed and its watch-only adapters share.
import type { RecoveryCoinFacts } from "../registry.js";
import { dashAmountUnit, getDashHistory } from "./history.js";

export const DASH_COIN: RecoveryCoinFacts = {
  id: "dash",
  getHistory: getDashHistory,
  amountUnit: dashAmountUnit,
  label: "Dash",
  networks: ["mainnet", "testnet"],
  customPath: {
    description: "Optional; standard Dash recovery stays enabled.",
    placeholder: "m/44'/5'/0'/0/{index}",
    defaultTemplate: (network) => `m/44'/${network === "mainnet" ? 5 : 1}'/0'/0/{index}`,
    formats: [{ id: "p2pkh", label: "Dash Core · P2PKH" }],
  },
};

// The facts of Ethereum that its seed and its watch-only adapters share.
import type { RecoveryCoinFacts } from "../registry.js";
import { getEthereumHistory } from "./history.js";

export const ETHEREUM_COIN: RecoveryCoinFacts = {
  id: "ethereum",
  amountUnit: () => ({ asset: "ETH", atomicUnit: "wei", decimals: 18 }),
  getHistory: getEthereumHistory,
  label: "Ethereum",
  networks: ["mainnet", "testnet"],
  customPath: {
    description: "Optional; three standard profiles stay enabled.",
    placeholder: "m/44'/60'/0'/0/{index}",
    defaultTemplate: () => "m/44'/60'/0'/0/{index}",
    formats: [{ id: "eoa", label: "Ethereum EOA · EIP-55" }],
  },
};

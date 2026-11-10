import { evmNetwork } from "@ckd/public-data-providers/evm-networks.js";
import type { RecoveryCoinAdapter } from "../../types.js";
import { createEvmRecoveryAdapter } from "../evm/index.js";
import { getEthereumHistory } from "./history.js";

/** Ethereum: the EVM network table's first row, with the Blockscout history it alone reads. */
export const ETHEREUM_RECOVERY_ADAPTER: RecoveryCoinAdapter = createEvmRecoveryAdapter(
  evmNetwork("ethereum"),
  { getHistory: getEthereumHistory },
);

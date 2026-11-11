import { evmNetwork } from "@ckd/public-data-providers/evm-networks.js";
import type { RecoveryCoinAdapter } from "../../types.js";
import { developmentEvmOptions } from "../evm-networks.js";
import { createEvmRecoveryAdapter } from "../evm/index.js";

const ETHEREUM = evmNetwork("ethereum");

/** Ethereum: the EVM network table's first row, with its Blockscout history. */
export const ETHEREUM_RECOVERY_ADAPTER: RecoveryCoinAdapter = createEvmRecoveryAdapter(
  ETHEREUM,
  developmentEvmOptions(ETHEREUM),
);

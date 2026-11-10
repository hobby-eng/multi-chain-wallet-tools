// The EVM networks besides Ethereum, built from the EVM network table for the development build; a
// composed build inlines the rows of its selected networks instead
// (tooling/discovery-composition.mjs).
import { EVM_NETWORKS } from "@ckd/public-data-providers/evm-networks.js";
import type { RecoveryCoinAdapter } from "../types.js";
import { createEvmRecoveryAdapter } from "./evm/index.js";

/** Every EVM network of the EVM network table except Ethereum, in the table's order. */
export const EVM_NETWORK_RECOVERY_ADAPTERS: readonly RecoveryCoinAdapter[] = EVM_NETWORKS.filter(
  ({ id }) => id !== "ethereum",
).map((facts) => createEvmRecoveryAdapter(facts));

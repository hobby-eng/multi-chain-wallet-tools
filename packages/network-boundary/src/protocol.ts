/** Compatibility facade. New code should import the focused protocol module it consumes. */
export * from './transport-protocol.js';
export * from './iframe-protocol.js';
export * from './dash-recovery-protocol.js';
export * from './public-recovery-protocol.js';
export * from './recovery-protocol.js';
export type { EvmAccountBatchView, EvmAccountView, RecoveryHistory, UtxoAddressView } from './data-types.js';
// These ceilings are part of the reviewed public-provider request contract.
export { RECOVERY_UTXO_ADDRESS_BATCH, RECOVERY_EVM_ACCOUNT_BATCH } from './data-types.js';

import { RECOVERY_VAULT_CHANNEL } from '@ckd/network-boundary/protocol.js';

export interface VaultChannelDelivery {
  readonly type: typeof RECOVERY_VAULT_CHANNEL;
}

export interface VaultRuntimeOptions {
  readonly channelType: VaultChannelDelivery['type'];
  readonly timeoutMs: number;
}

export const DEFAULT_VAULT_RUNTIME_OPTIONS: VaultRuntimeOptions = {
  channelType: RECOVERY_VAULT_CHANNEL,
  timeoutMs: 15_000,
};

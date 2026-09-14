import { DEFAULT_VAULT_RUNTIME_OPTIONS, type VaultRuntimeOptions } from './vault-protocol.js';

export interface VaultChannelClient {
  readonly port: MessagePort;
  deliver(): void;
}

export function createVaultChannel(
  vault: HTMLIFrameElement,
  port: MessagePort,
  options: VaultRuntimeOptions = DEFAULT_VAULT_RUNTIME_OPTIONS,
): VaultChannelClient {
  let delivered = false;
  return {
    port,
    deliver(): void {
      if (delivered) return;
      delivered = true;
      const target = vault.contentWindow;
      if (target === null) throw new Error('The browser did not create the isolated Secret Vault.');
      target.postMessage({ type: options.channelType }, '*', [port]);
    },
  };
}

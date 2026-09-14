import { DEFAULT_VAULT_RUNTIME_OPTIONS, type VaultRuntimeOptions } from './vault-protocol.js';

export interface VaultChannelClient {
  readonly port: MessagePort;
  deliver(): void;
  close(): void;
}

export function createVaultChannel(
  vault: HTMLIFrameElement,
  port: MessagePort,
  options: VaultRuntimeOptions = DEFAULT_VAULT_RUNTIME_OPTIONS,
): VaultChannelClient {
  let delivered = false;
  let closed = false;
  return {
    port,
    deliver(): void {
      if (delivered) return;
      if (closed) throw new Error('The Secret Vault channel was closed before delivery.');
      delivered = true;
      const target = vault.contentWindow;
      if (target === null) throw new Error('The browser did not create the isolated Secret Vault.');
      target.postMessage({ type: options.channelType }, '*', [port]);
    },
    close(): void {
      if (delivered || closed) return;
      closed = true;
      port.close();
    },
  };
}

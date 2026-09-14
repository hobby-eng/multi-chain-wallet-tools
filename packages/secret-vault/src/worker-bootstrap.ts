import { createVaultChannel } from './vault-client.js';

export interface VaultBootstrap {
  stop(): void;
}

export function bootstrapVaultDocument(
  vault: HTMLIFrameElement,
  html: string,
  port: MessagePort,
  onError: (cause: unknown) => void,
): VaultBootstrap {
  const channel = createVaultChannel(vault, port);
  const onLoad = (): void => {
    try {
      channel.deliver();
    } catch (cause) {
      onError(cause);
    }
  };
  vault.addEventListener('load', onLoad);
  vault.srcdoc = html;
  return {
    stop(): void {
      vault.removeEventListener('load', onLoad);
      // If unload wins the race with iframe readiness, release the untransferred port.
      channel.close();
    },
  };
}

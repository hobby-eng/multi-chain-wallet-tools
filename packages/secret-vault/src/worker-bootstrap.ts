import { bootstrapIsolatedBoundary, type IsolatedBoundaryBootstrap } from '@ckd/network-boundary/iframe-bootstrap.js';

export type VaultBootstrap = IsolatedBoundaryBootstrap;

/**
 * Seed-capable semantic layer over the shared opaque iframe transport. Keeping
 * this wrapper separate lets watch-only builds exclude the Secret Vault package.
 */
export function bootstrapVaultDocument(
  vault: HTMLIFrameElement,
  html: string,
  port: MessagePort,
  onError: (cause: unknown) => void,
): VaultBootstrap {
  return bootstrapIsolatedBoundary(vault, html, port, onError);
}

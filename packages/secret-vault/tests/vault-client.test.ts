import { describe, expect, it } from 'vitest';
import { createVaultChannel } from '../src/vault-client.js';

describe('Secret Vault contracts', () => {
  it('delivers its port to the iframe once', () => {
    const posted: unknown[] = [];
    const target = { postMessage: (...args: unknown[]) => posted.push(args) } as unknown as Window;
    const frame = { contentWindow: target } as HTMLIFrameElement;
    const channel = createVaultChannel(frame, {} as MessagePort);

    channel.deliver();
    channel.deliver();
    expect(posted).toHaveLength(1);
    expect((posted[0] as unknown[])[0]).toEqual({ type: 'ckd-recovery-vault-channel-v1' });
  });
});

import { describe, expect, it } from 'vitest';
import { createVaultChannel } from '../src/vault-client.js';

describe('Secret Vault contracts', () => {
  it('delivers its port to the iframe once', () => {
    const posted: unknown[] = [];
    const target = { postMessage: (...args: unknown[]) => posted.push(args) } as unknown as Window;
    const frame = { contentWindow: target } as HTMLIFrameElement;
    const channel = createVaultChannel(frame, { close: () => {} } as unknown as MessagePort);

    channel.deliver();
    channel.deliver();
    expect(posted).toHaveLength(1);
    expect((posted[0] as unknown[])[0]).toEqual({ type: 'ckd-recovery-vault-channel-v1' });
  });

  it('closes an undelivered port and refuses later delivery', () => {
    let closed = 0;
    const target = { postMessage: () => {} } as unknown as Window;
    const frame = { contentWindow: target } as HTMLIFrameElement;
    const channel = createVaultChannel(frame, { close: () => (closed += 1) } as unknown as MessagePort);
    channel.close();
    channel.close();
    expect(closed).toBe(1);
    expect(() => channel.deliver()).toThrow('closed before delivery');
  });
});

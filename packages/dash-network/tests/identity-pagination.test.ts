import { expect, it } from 'vitest';
import { IdentityPageIntegrity } from '../src/identity-pagination.js';
it('retains separate transfer legs sharing a transaction and rejects cross-page overlap', () => {
  const guard = new IdentityPageIntegrity('transfers', 'transfers', 4);
  const a = { txHash: 'same', sender: 'alice', recipient: 'bob', amount: 2 };
  const b = { ...a, recipient: 'charlie' };
  guard.accept([a, b], 4, 2, 4);
  expect(guard.loaded).toBe(2);
  expect(() => guard.accept([b, { ...a, amount: 3 }], 4, 2, 4)).toThrow(/repeated/u);
});
it('preserves indistinguishable transfer legs in a single page', () => {
  const guard = new IdentityPageIntegrity('transfers', 'transfers', 2);
  const leg = { txHash: 'same', sender: 'alice', recipient: 'bob', amount: 2 };
  guard.accept([leg, { ...leg }], 2, 100, 100);
  expect(guard.loaded).toBe(2);
});
it('checks resource identity rather than metadata and refuses summary mismatch', () => {
  const guard = new IdentityPageIntegrity('documents', 'resources', 2);
  guard.accept([{ identifier: 'doc', revision: 1 }], null, 1, 2);
  expect(() => guard.accept([{ identifier: 'doc', revision: 2 }], null, 1, 2)).toThrow(/repeated/u);
  expect(() => new IdentityPageIntegrity('documents', 'resources', 2).accept([], 0, 100, 100)).toThrow(/summary/u);
});

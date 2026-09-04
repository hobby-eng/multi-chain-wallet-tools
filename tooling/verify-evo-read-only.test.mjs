import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertEvoSdkReadOnly, findEvoWriteCalls } from './verify-evo-read-only.mjs';

const root = resolve(import.meta.dirname, '..');
const fixture = (name) => resolve(import.meta.dirname, 'fixtures/evo-read-only', name);

describe('Evo SDK read-only verifier', () => {
  it('accepts reviewed read-only facade calls', () => {
    expect(() => assertEvoSdkReadOnly([fixture('read-only.ts')], 'Fixture', root)).not.toThrow();
  });

  it.each([
    ['direct property access', 'direct-write.ts'],
    ['computed, optional, and aliased access', 'computed-write.ts'],
  ])('rejects %s write calls', (_label, name) => {
    expect(() => assertEvoSdkReadOnly([fixture(name)], 'Fixture', root)).toThrow(
      /crosses its read-only\/scan-only boundary/u,
    );
  });

  it('reports source locations for rejected calls', () => {
    expect(findEvoWriteCalls([fixture('direct-write.ts')], root)).toEqual([
      expect.objectContaining({ path: fixture('direct-write.ts'), line: 2, column: 1 }),
      expect.objectContaining({ path: fixture('direct-write.ts'), line: 3, column: 1 }),
    ]);
  });

  it('covers every write-capable pinned Evo SDK facade', () => {
    const findings = findEvoWriteCalls([fixture('facade-writes.ts')], root);
    expect(findings.map(({ description }) => description)).toEqual([
      'write-capable documents.create facade',
      'write-capable contracts.publish facade',
      'write-capable tokens.transfer facade',
      'write-capable dpns.registerName facade',
      'write-capable voting.masternodeVote facade',
      'low-level state-transition method broadcastStateTransition',
      'low-level state-transition method broadcastAndWaitForAffectedState',
    ]);
  });
});

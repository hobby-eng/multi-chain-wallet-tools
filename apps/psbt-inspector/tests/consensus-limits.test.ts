import { describe, expect, it } from 'vitest';
import { bytesToHex, secp256k1 } from '@ckd/core/crypto.js';
import { CONSENSUS_LIMITS, validateMultisigConsensusLimits } from '../src/consensus-limits.js';
import { decodeDescriptor } from '../src/descriptor.js';

function keys(count: number, xOnly = false): string[] {
  return Array.from({ length: count }, (_, index) => {
    const compressed = bytesToHex(secp256k1.Point.BASE.multiply(BigInt(index + 1)).toBytes(true));
    return xOnly ? compressed.slice(2) : compressed;
  });
}

function multisig(name: 'multi' | 'sortedmulti' | 'multi_a' | 'sortedmulti_a', count: number): string {
  const values = keys(count, name.endsWith('_a'));
  return `${name}(1,${values.join(',')})`;
}

describe('central consensus and descriptor policy limits', () => {
  it.each(['multi', 'sortedmulti'] as const)('accepts 20 and rejects 21 keys in wsh(%s())', (name) => {
    expect(() => decodeDescriptor(`wsh(${multisig(name, 20)})`)).not.toThrow();
    expect(() => decodeDescriptor(`wsh(${multisig(name, 21)})`)).toThrow(/21 keys.*p2wsh limit is 20/u);
  });

  it.each(['multi', 'sortedmulti'] as const)('accepts three and rejects four keys in bare %s()', (name) => {
    expect(() => decodeDescriptor(multisig(name, 3))).not.toThrow();
    expect(() => decodeDescriptor(multisig(name, 4))).toThrow(/4 keys.*bare limit is 3/u);
  });

  it.each(['multi_a', 'sortedmulti_a'] as const)('accepts 999 and rejects 1000 keys in %s()', (name) => {
    expect(() => validateMultisigConsensusLimits(multisig(name, 999), 'tapscript')).not.toThrow();
    expect(() => validateMultisigConsensusLimits(multisig(name, 1000), 'tapscript')).toThrow(/1000 keys.*tapscript limit is 999/u);
  });

  it('owns the script and timelock limits used by the Inspector', () => {
    expect(CONSENSUS_LIMITS).toMatchObject({
      absoluteLockTimeThreshold: 500_000_000,
      bip68SequenceMask: 0xffff,
      maximumBareMultisigKeys: 3,
      maximumCheckMultisigKeys: 20,
      maximumCheckSigAddKeys: 999,
      maximumScriptElementBytes: 520,
      maximumScriptBytes: 10_000,
      maximumTaprootTreeDepth: 128,
    });
  });
});

describe('multisig descriptor presentation', () => {
  const compressed = keys(3);
  const xOnly = compressed.map((key) => key.slice(2));

  it('does not report sortedmulti() as supplied-order multi()', () => {
    const decoded = decodeDescriptor(`wsh(sortedmulti(2,${compressed.join(',')}))`);
    const rows = decoded.rows.filter(({ label }) => label.includes('Multisig'));
    expect(rows).toEqual([
      { label: 'Multisig 1 · threshold', value: '2-of-3' },
      { label: 'Multisig 1 · key order', value: 'BIP67 lexicographic sort · sortedmulti()' },
    ]);
  });

  it('distinguishes supplied and sorted Tapscript multisig ordering', () => {
    const internal = xOnly[0]!;
    const supplied = decodeDescriptor(`tr(${internal},multi_a(2,${xOnly.join(',')}))`);
    const sorted = decodeDescriptor(`tr(${internal},sortedmulti_a(2,${xOnly.join(',')}))`);
    expect(supplied.rows.find(({ label }) => label === 'Tapscript multisig 1')?.value)
      .toBe('2-of-3 · supplied key order · multi_a()');
    expect(sorted.rows.find(({ label }) => label === 'Tapscript multisig 1')?.value)
      .toBe('2-of-3 · lexicographic x-only key sort · sortedmulti_a()');
  });
});

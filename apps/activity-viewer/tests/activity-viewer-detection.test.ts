import { describe, expect, it } from 'vitest';
import {
  assertAutoViewerBatchInput,
  detectViewerInput,
  looksLikeAutoOrchardInput,
} from '../src/detection.js';

describe('Activity Viewer input detection', () => {
  it.each([
    ['XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14', 'mainnet', 'core'],
    ['yPJr631fij5bHLpjMZgwK5hHCsHurSMhCB', 'testnet', 'core'],
    ['dash1kzpkh894d6xxqldkflqk9kac06scjk7emup08hdj', 'mainnet', 'platform'],
    ['tdash1krstjne0t2sd2gt4w047jw0kv5qwfs4wf5npref0', 'testnet', 'platform'],
    ['mrssv.dash', 'mainnet', 'identity'],
    ['FcohZqAAsPRyaL3bGctTJuv2Xzw4wLKY9ybheTDeZ5MG', 'mainnet', 'identity'],
    ['ab'.repeat(64), 'mainnet', 'shielded'],
    ['cd'.repeat(96), 'testnet', 'shielded'],
  ] as const)('detects %s as %s input', (value, network, mode) => {
    expect(detectViewerInput(value, network)).toMatchObject({ mode, value });
  });

  it('supports explicit type prefixes for otherwise ambiguous input', () => {
    expect(detectViewerInput(`orchard-ovk:${'ab'.repeat(32)}`, 'mainnet')).toMatchObject({
      mode: 'shielded',
      value: 'ab'.repeat(32),
      viewingKeyMode: 'outgoing',
      explicit: true,
    });
    expect(detectViewerInput(`identity:idhex:${'ab'.repeat(32)}`, 'mainnet')).toMatchObject({
      mode: 'identity',
      value: `idhex:${'ab'.repeat(32)}`,
      explicit: true,
    });
  });

  it('rejects ambiguous bare 64-hex input and wrong-network addresses', () => {
    expect(() => detectViewerInput('ab'.repeat(32), 'mainnet')).toThrow('Private key-like material');
    expect(() => detectViewerInput('yPJr631fij5bHLpjMZgwK5hHCsHurSMhCB', 'mainnet')).toThrow('mainnet');
    expect(() => detectViewerInput('dash1kzpkh894d6xxqldkflqk9kac06scjk7emup08hdj', 'testnet')).toThrow('testnet');
  });

  it('recognizes inputs that should be concealed in Auto mode', () => {
    expect(looksLikeAutoOrchardInput('ab'.repeat(64))).toBe(true);
    expect(looksLikeAutoOrchardInput(`orchard-ovk:${'ab'.repeat(32)}`)).toBe(true);
    expect(looksLikeAutoOrchardInput('mrssv.dash')).toBe(false);
  });

  it.each([
    [
      'one prefixed word',
      [
        'identity:abandon',
        ...Array.from({ length: 10 }, () => 'abandon'),
        'about',
        'alice.dash',
      ].join('\n'),
    ],
    [
      'every prefixed word',
      [
        ...Array.from({ length: 11 }, () => 'identity:abandon'),
        'identity:about',
        'alice.dash',
      ].join('\n'),
    ],
    [
      'an Orchard-prefixed word',
      [
        'orchard:abandon',
        ...Array.from({ length: 10 }, () => 'abandon'),
        'about',
        'alice.dash',
      ].join('\n'),
    ],
  ])('blocks a multiline mnemonic with %s', (_label, value) => {
    expect(() => assertAutoViewerBatchInput(value)).toThrow('Private key-like material');
  });

  it('allows twelve ordinary alphabetic DPNS names in Auto batch', () => {
    const value = [
      'alice', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot',
      'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima',
    ].join('\n');
    expect(() => assertAutoViewerBatchInput(value)).not.toThrow();
  });

  it('allows an explicitly labelled 32-byte Orchard outgoing viewing capability', () => {
    expect(() => assertAutoViewerBatchInput(`orchard-ovk:${'ab'.repeat(32)}\nalice.dash`)).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { getCoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult } from '@ckd/core/types.js';
import { field } from '@ckd/core/types.js';
import {
  displayedFields,
  formatSelectedRows,
  inspectSelectedRows,
  iterateSelectedRows,
} from '../src/formatter.js';

const result: DerivationResult = {
  id: 'bitcoin-taproot',
  title: 'Export fixture',
  networkLabel: 'Bitcoin mainnet',
  pathTemplate: "m/86'/0'/0'/0/*",
  basicSummary: [],
  summary: [],
  notices: [],
  rows: [0, 1].map((index) => ({
    index,
    path: `m/86'/0'/0'/0/${index}`,
    title: `Address ${index}`,
    basic: [
      field('address', 'Address', `bc1p-address-${index}`),
      field('privateKey', 'BIP32 child WIF', `secret-wif-${index}`, true),
    ],
    advanced: [
      field('tapTweak', 'TapTweak', `tweak-${index}`),
      field('taprootOutputPrivateKey', 'Tweaked output key', `secret-tweaked-${index}`, true),
    ],
  })),
};

describe('generic export formatter', () => {
  const adapter = getCoinAdapter('bitcoin-taproot');

  it('limits basic mode to basic fields and reports secret presence', () => {
    const output = formatSelectedRows(adapter, result, new Set([0]), 'basic', 'allDisplayed', 'structured');
    expect(output.valueCount).toBe(2);
    expect(output.containsSecret).toBe(true);
    expect(output.text).toContain('bc1p-address-0');
    expect(output.text).not.toContain('tweak-0');
  });

  it('exports only selected address values in plain mode', () => {
    const output = formatSelectedRows(adapter, result, new Set([1]), 'advanced', 'addresses', 'plain');
    expect(output).toEqual({ text: 'bc1p-address-1', containsSecret: false, valueCount: 1 });
  });

  it('exports only role-classified private fields and flags them as secret', () => {
    const output = formatSelectedRows(adapter, result, new Set([0, 1]), 'advanced', 'privateKeys', 'plain');
    expect(output.valueCount).toBe(4);
    expect(output.containsSecret).toBe(true);
    expect(output.text).toBe([
      'secret-wif-0',
      'secret-tweaked-0',
      'secret-wif-1',
      'secret-tweaked-1',
    ].join('\n'));
  });

  it('creates a rectangular TSV for multi-row exports', () => {
    const output = formatSelectedRows(adapter, result, new Set([0, 1]), 'advanced', 'selected', 'tsv');
    const lines = output.text.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Index\tPath\tAddress\tBIP32 child WIF\tTapTweak\tTweaked output key');
    expect(lines[1]?.split('\t')).toHaveLength(6);
    expect(lines[2]?.split('\t')).toHaveLength(6);
  });

  it('neutralises spreadsheet formulas in TSV headers and cells', () => {
    const injected: DerivationResult = {
      ...result,
      rows: [{
        index: 0,
        path: "m/86'/0'/0'/0/0",
        title: 'Address 0',
        basic: [field('address', '=Address', '=cmd|calc')],
        advanced: [],
      }],
    };
    const tsv = formatSelectedRows(adapter, injected, new Set([0]), 'basic', 'selected', 'tsv');
    const lines = tsv.text.split('\n');
    expect(lines[0]).toBe("Index\tPath\t'=Address");
    expect(lines[1]).toContain("'=cmd|calc");
    // Plain text is not opened by a spreadsheet, so values stay verbatim there.
    const plain = formatSelectedRows(adapter, injected, new Set([0]), 'basic', 'addresses', 'plain');
    expect(plain.text).toBe('=cmd|calc');
  });

  it('keeps field visibility protocol-neutral', () => {
    expect(displayedFields(result.rows[0]!, 'basic')).toHaveLength(2);
    expect(displayedFields(result.rows[0]!, 'advanced')).toHaveLength(4);
  });

  it('flattens grouped key fields while retaining their group labels in structured exports', () => {
    const grouped: DerivationResult = {
      id: 'dash-identity',
      title: 'Identity fixture',
      networkLabel: 'Dash mainnet Platform',
      pathTemplate: "m/9'/5'/5'/0'/0'/identity_index'/key_id'",
      basicSummary: [],
      summary: [],
      notices: [],
      rows: [{
        index: 0,
        path: "m/9'/5'/5'/0'/0'/0'",
        title: 'Identity candidate #0',
        basic: [],
        advanced: [field('identityId', 'Identity ID', 'Not available until registration')],
        groups: [
          {
            key: 'key0',
            title: 'Key 0 · MASTER AUTHENTICATION',
            basic: [
              field('key0PublicKey', 'Compressed public key', 'master-public'),
              field('key0PrivateKeyWif', 'Private key (Dash WIF)', 'master-private', true),
            ],
            advanced: [field('key0Path', 'DIP13 derivation path', "m/9'/5'/5'/0'/0'/0'/0'")],
          },
          {
            key: 'key1',
            title: 'Key 1 · CRITICAL AUTHENTICATION',
            basic: [
              field('key1PublicKey', 'Compressed public key', 'critical-public'),
              field('key1PrivateKeyWif', 'Private key (Dash WIF)', 'critical-private', true),
            ],
            advanced: [field('key1Path', 'DIP13 derivation path', "m/9'/5'/5'/0'/0'/0'/1'")],
          },
        ],
      }],
    };
    const identityAdapter = getCoinAdapter('dash-identity');

    expect(displayedFields(grouped.rows[0]!, 'basic')).toHaveLength(4);
    const publicKeys = formatSelectedRows(
      identityAdapter,
      grouped,
      new Set([0]),
      'basic',
      'publicKeys',
      'plain',
    );
    expect(publicKeys.text).toBe('master-public\ncritical-public');

    const structured = formatSelectedRows(
      identityAdapter,
      grouped,
      new Set([0]),
      'advanced',
      'allDisplayed',
      'structured',
    );
    expect(structured.text).toContain('Key 0 · MASTER AUTHENTICATION · Compressed public key: master-public');
    expect(structured.text).toContain("Key 1 · CRITICAL AUTHENTICATION · DIP13 derivation path: m/9'/5'/5'/0'/0'/0'/1'");
    expect(structured.containsSecret).toBe(true);
  });

  it('streams the exact same bytes in bounded row-sized chunks', () => {
    const selected = new Set([0, 1]);
    const expected = formatSelectedRows(adapter, result, selected, 'advanced', 'selected', 'structured');
    const chunks = [...iterateSelectedRows(adapter, result, selected, 'advanced', 'selected', 'structured')];
    expect(chunks.join('')).toBe(expected.text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThan(expected.text.length);
    expect(inspectSelectedRows(adapter, result, selected, 'advanced', 'selected')).toEqual({
      containsSecret: true,
      valueCount: 8,
      rowCount: 2,
    });
  });
});

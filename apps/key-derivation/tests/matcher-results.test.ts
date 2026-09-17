import { describe, expect, it } from 'vitest';
import type { ResultField } from '@ckd/core/types.js';
import * as registry from '@ckd/coins/registry.js';
import { createCoinRegistry } from '@ckd/coins/registry-base.js';
import { detectMultiChainMatcherTargets } from '@ckd/recovery/matcher-targets-multichain.js';
import { matcherPrivateTsv } from '../src/ui/matcher-private-export.js';
import { matcherSearchBranches, matcherSearchTargets } from '../src/ui/matcher-search-scope.js';

const BTC = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const DASH = 'XdTw4G5AWW4cogGd7ayybyBNDbuB45UpgH';
const DASH_IDENTITY_MASTER_HASH = '00112233445566778899aabbccddeeff00112233';
const secret = (key: string, label: string, value: string): ResultField => ({ key, label, value, secret: true });

describe('matcher export and coin scope', () => {
  it('keeps each private representation in its own column with blank cells for other protocols', () => {
    const tsv = matcherPrivateTsv(
      [
        ['1', BTC, 'Taproot', 'm/86'],
        ['2', '0x123', 'Ethereum', 'm/44'],
      ],
      [
        [
          secret('wif', 'WIF', 'Labc'),
          secret('hex', 'Private key hex', 'aabb'),
          secret('xprv', 'Child xprv', 'xprv123'),
        ],
        [secret('hex', 'Private key hex', 'ccdd')],
      ],
    );
    const rows = tsv.split('\n').map((row) => row.split('\t'));
    expect(rows[0]).toEqual([
      'Seed',
      'Known address',
      'Wallet structure',
      'Path',
      'WIF',
      'Private key hex',
      'Child xprv',
    ]);
    expect(rows[1]!.slice(4)).toEqual(['Labc', 'aabb', 'xprv123']);
    expect(rows[2]!.slice(4)).toEqual(['', 'ccdd', '']);
    expect(rows.every((row) => row.length === 7)).toBe(true);
  });
  it('does not lose different representations containing the same value', () => {
    const tsv = matcherPrivateTsv(
      [['1', BTC, 'Bitcoin', 'm/44']],
      [[secret('one', 'One', 'abc'), secret('two', 'Two', 'abc')]],
    );
    expect(tsv.split('\n')[1]!.split('\t').slice(4)).toEqual(['abc', 'abc']);
    expect(() => matcherPrivateTsv([], [[secret('one', 'One', 'abc')]])).toThrow(/aligned/u);
  });
  it('searches every Bitcoin address profile while excluding other coins without the override', () => {
    const targets = matcherSearchTargets(BTC, 'mainnet', detectMultiChainMatcherTargets, registry, 'bitcoin', false);
    expect(targets[0]!.adapterIds).toEqual([
      'bitcoin-legacy',
      'bitcoin-nested-segwit',
      'bitcoin-native-segwit',
      'bitcoin-taproot',
    ]);
  });
  it('includes Core, legacy, CoinJoin, Platform and Orchard for Dash only', () => {
    const targets = matcherSearchTargets(DASH, 'mainnet', detectMultiChainMatcherTargets, registry, 'dash', false);
    expect(targets[0]!.adapterIds).toEqual([
      'dash-core',
      'dash-legacy-mobile',
      'dash-core-coinjoin',
      'dash-platform',
      'dash-shielded',
    ]);
    expect(() =>
      matcherSearchTargets(DASH, 'mainnet', detectMultiChainMatcherTargets, registry, 'bitcoin', false),
    ).toThrow(/does not belong/u);
  });
  it('keeps Identity HASH160 matching on the dedicated DIP13 adapter', () => {
    const [target] = matcherSearchTargets(
      DASH_IDENTITY_MASTER_HASH,
      'mainnet',
      detectMultiChainMatcherTargets,
      registry,
      'dash',
      false,
    );
    expect(target).toMatchObject({
      adapterIds: ['dash-identity'],
      fieldKeys: ['key0PublicKeyHash'],
    });
  });

  it('requires the override for mixed coins and never schedules profiles excluded from the registry', () => {
    expect(() =>
      matcherSearchTargets(`${BTC}\n${DASH}`, 'mainnet', detectMultiChainMatcherTargets, registry, 'bitcoin', false),
    ).toThrow(/Target 2/u);
    const targets = matcherSearchTargets(
      `${BTC}\n${DASH}`,
      'mainnet',
      detectMultiChainMatcherTargets,
      registry,
      'bitcoin',
      true,
    );
    expect(targets[0]!.adapterIds).toContain('ethereum');
    expect(targets[0]!.adapterIds).toContain('dash-core');
    const bitcoinOnly = createCoinRegistry(
      registry.COIN_ADAPTERS.filter((adapter) => registry.getAdapterFamilyId(adapter) === 'bitcoin'),
    );
    const restricted = matcherSearchTargets(
      BTC,
      'mainnet',
      detectMultiChainMatcherTargets,
      bitcoinOnly,
      'bitcoin',
      true,
    );
    expect(restricted[0]!.adapterIds.every((id) => id.startsWith('bitcoin-'))).toBe(true);
  });
});

describe('matcher receive and change branch scope', () => {
  it('includes change only when requested or forced across coins', () => {
    for (const id of ['bitcoin-legacy', 'bitcoin-taproot', 'dash-core', 'dash-platform', 'dash-legacy-mobile']) {
      const adapter = registry.getCoinAdapter(id);
      expect(matcherSearchBranches(adapter, false)).toEqual([adapter.addressBranches!.receive]);
      expect(matcherSearchBranches(adapter, true)).toEqual([
        adapter.addressBranches!.receive,
        adapter.addressBranches!.change,
      ]);
      expect(matcherSearchBranches(adapter, false, true)).toEqual(matcherSearchBranches(adapter, true));
    }
  });
  it('applies the same scope to CoinJoin external/internal branches', () => {
    const adapter = { ...registry.getCoinAdapter('dash-core'), id: 'dash-core-coinjoin' };
    expect(matcherSearchBranches(adapter, false)).toEqual([0]);
    expect(matcherSearchBranches(adapter, true)).toEqual([0, 1]);
    expect(matcherSearchBranches(adapter, false, true)).toEqual([0, 1]);
  });
  it('preserves non-change alternate paths and single-branch protocols', () => {
    expect(matcherSearchBranches(registry.getCoinAdapter('ethereum'), false)).toEqual([0, 1]);
    for (const id of ['dash-identity', 'dash-shielded']) {
      const adapter = registry.getCoinAdapter(id);
      expect(matcherSearchBranches(adapter, true)).toEqual([adapter.defaults.branch]);
    }
  });
});

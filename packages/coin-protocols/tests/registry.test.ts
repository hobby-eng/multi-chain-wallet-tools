import { describe, expect, it } from 'vitest';
import {
  COIN_ADAPTERS,
  COIN_FAMILIES,
  getAdapterFamilyId,
  getCoinAdapter,
  getDefaultCoinAdapter,
} from '../src/coins/registry.js';

describe('coin adapter extension contract', () => {
  it('registers unique, complete adapters without UI-specific branching', () => {
    const ids = COIN_ADAPTERS.map((adapter) => adapter.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'bitcoin-legacy',
      'bitcoin-nested-segwit',
      'bitcoin-native-segwit',
      'bitcoin-taproot',
      'ethereum',
      'dash-core',
      'dash-platform',
      'dash-shielded',
    ]);
    for (const adapter of COIN_ADAPTERS) {
      expect(adapter.label.length).toBeGreaterThan(0);
      expect(adapter.variantLabel.length).toBeGreaterThan(0);
      expect(adapter.group.length).toBeGreaterThan(0);
      expect(adapter.fieldRoles.addresses).toContain('address');
      expect(adapter.defaults.count).toBe(20);
      expect(adapter.pathPreview({ ...adapter.defaults })).toContain('m/');
      expect(getCoinAdapter(adapter.id)).toBe(adapter);
    }
  });

  it('derives coin dropdown families and horizontal variants from the adapter registry', () => {
    expect(COIN_FAMILIES.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'dash', label: 'Dash' },
      { id: 'bitcoin', label: 'Bitcoin' },
      { id: 'ethereum', label: 'Ethereum' },
    ]);
    expect(COIN_FAMILIES.find(({ id }) => id === 'bitcoin')?.adapters.map(({ variantLabel }) => variantLabel)).toEqual([
      'Legacy · BIP44',
      'Nested SegWit · BIP49',
      'Native SegWit · BIP84',
      'Taproot · BIP86',
    ]);
    expect(COIN_FAMILIES.find(({ id }) => id === 'dash')?.adapters.map(({ variantLabel }) => variantLabel)).toEqual([
      'Core · BIP44',
      'Platform · DIP17 / DIP18',
      'Shielded · Orchard / ZIP-32',
    ]);
    expect(getDefaultCoinAdapter('bitcoin').id).toBe('bitcoin-taproot');
    expect(getDefaultCoinAdapter('dash').id).toBe('dash-core');
    for (const family of COIN_FAMILIES) {
      expect(family.adapters.every((adapter) => getAdapterFamilyId(adapter) === family.id)).toBe(true);
      expect(family.adapters.filter(({ defaultVariant }) => defaultVariant === true).length).toBeLessThanOrEqual(1);
    }
  });

  it('declares receive/change capability independently from protocol-specific branch controls', () => {
    for (const id of ['bitcoin-legacy', 'bitcoin-nested-segwit', 'bitcoin-native-segwit', 'bitcoin-taproot', 'dash-core']) {
      expect(getCoinAdapter(id).addressBranches).toEqual({ receive: 0, change: 1 });
      expect(getCoinAdapter(id).branchControl).toBeUndefined();
    }
    expect(getCoinAdapter('ethereum').addressBranches).toBeUndefined();
    expect(getCoinAdapter('ethereum').branchControl?.label).toBe('Address branch');
    expect(getCoinAdapter('dash-platform').addressBranches).toBeUndefined();
    expect(getCoinAdapter('dash-platform').branchControl?.label).toBe('Key class');
    expect(getCoinAdapter('dash-shielded').addressBranches).toBeUndefined();
  });
});

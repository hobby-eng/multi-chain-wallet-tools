import { encodePlatformP2pkh } from '@ckd/coins/dash/platform.js';
import { describe, expect, it, vi } from 'vitest';
import { HDKey } from '@scure/bip32';
import { createBase58check } from '@scure/base';
import { bytesToHex, hash160, hexToBytes, sha256 } from '@ckd/core/crypto.js';
import { descriptorChecksum } from '@ckd/export/descriptor.js';
import { BITCOIN_RECOVERY_ADAPTER } from '../src/coins/bitcoin/index.js';
import { ETHEREUM_RECOVERY_ADAPTER } from '../src/coins/ethereum/index.js';
import { DASH_RECOVERY_ADAPTER } from '../src/coins/dash/index.js';
import { assertWatchOnlyBatchInput, parseWatchOnlyLines, resolveWatchOnlyTargets } from '../src/watch-only.js';
import { SecretEgressGuard } from '../src/secret-guard.js';
import { createRecoveryExport } from '../src/export.js';
import type { RecoveryNetworkApi } from '../src/network-protocol.js';
import type { RecoveryCoinAdapter, RecoveryScanContext } from '../src/types.js';

vi.mock('@ckd/dash-wasm/dash_shielded_wasm_bg.wasm', async () => {
  const { readFileSync } = await import('node:fs');
  return { default: readFileSync(new URL('../../../packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm', import.meta.url)) };
});

const publicKey = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const hash = bytesToHex(hash160(hexToBytes(publicKey)));
const adapters = [BITCOIN_RECOVERY_ADAPTER, ETHEREUM_RECOVERY_ADAPTER, DASH_RECOVERY_ADAPTER];
const account = HDKey.fromMasterSeed(new Uint8Array(32).fill(7)).derive("m/44'/0'/0'");
const config = { network: 'mainnet' as const, minimumCount: 1, includeUsedZeroBalance: false };
const base58check = createBase58check(sha256);
function slip132(xpub: string, version: number): string {
  const payload = base58check.decode(xpub).slice();
  new DataView(payload.buffer, payload.byteOffset, payload.byteLength).setUint32(0, version, false);
  return base58check.encode(payload);
}
function context(overrides: Partial<RecoveryNetworkApi> = {}): RecoveryScanContext {
  const unavailable = async (): Promise<never> => { throw new Error('Unexpected network operation.'); };
  return {
    signal: new AbortController().signal,
    sessionSecretGuard: new SecretEgressGuard(),
    onFinding: vi.fn(), onProgress: vi.fn(),
    networkApi: {
      ping: async () => 'isolated-network-worker-v1', coreStatus: unavailable, coreTip: unavailable,
      coreAddressInfo: unavailable, coreAddressHistory: unavailable, coreTransaction: unavailable,
      platformAddresses: unavailable, platformAddressHistory: unavailable,
      platformIdentityByPublicKeyHash: unavailable, platformIdentityHistory: unavailable,
      shieldedPage: unavailable, addressHistory: unavailable, utxoAddresses: unavailable, evmAccounts: unavailable, ...overrides,
    },
  };
}
async function scan(adapter: RecoveryCoinAdapter, raw: string, ctx: RecoveryScanContext) {
  const target = resolveWatchOnlyTargets(raw, [adapter])[0]!;
  return adapter.scanWatchOnly!({ ...target.material, id: 'public-1', label: adapter.label }, config, ctx);
}

describe('automatic public-key discovery', () => {
  it('treats a plain curve key as compatible with every installed coin, not as a coin identifier', () => {
    for (const raw of [publicKey, `public-key:${publicKey}`, `0x${publicKey.toUpperCase()}`]) {
      expect(resolveWatchOnlyTargets(raw, adapters).map(({ adapterId }) => adapterId)).toEqual(['bitcoin', 'ethereum', 'dash']);
    }
    expect(resolveWatchOnlyTargets(publicKey, [DASH_RECOVERY_ADAPTER]).map(({ adapterId }) => adapterId)).toEqual(['dash']);
  });
  it('uses explicit formats and prefixes to narrow the coin without a selector', () => {
    expect(resolveWatchOnlyTargets(`ethereum-xpub:${account.publicExtendedKey}`, adapters).map(({ adapterId }) => adapterId)).toEqual(['ethereum']);
    expect(resolveWatchOnlyTargets(`ethereum-xpub:${account.publicExtendedKey}`, adapters)[0]?.network).toBeUndefined();
    expect(resolveWatchOnlyTargets(`dash-core-xpub:${account.publicExtendedKey}`, adapters).map(({ adapterId }) => adapterId)).toEqual(['dash']);
    const body = `wpkh([12345678/84h/0h/0h]${account.publicExtendedKey}/0/*)`;
    expect(resolveWatchOnlyTargets(`${body}#${descriptorChecksum(body)}`, adapters).map(({ adapterId }) => adapterId)).toEqual(['bitcoin']);
    expect(resolveWatchOnlyTargets(`identity:${hash}`, adapters)[0]?.material.kind).toBe('identity');
    expect(() => resolveWatchOnlyTargets(`bitcoin-xpub:${account.publicExtendedKey}`, [DASH_RECOVERY_ADAPTER])).toThrow(/edition/u);
  });
  it('preserves encoded networks and limits ambiguous xpubs to compatible derivation depths', () => {
    const ambiguous = resolveWatchOnlyTargets(account.publicExtendedKey, adapters);
    expect(ambiguous.map(({ adapterId }) => adapterId)).toEqual(['bitcoin', 'ethereum', 'dash']);
    expect(ambiguous.every(({ ambiguity }) => ambiguity?.kind === 'bip32' && ambiguity.depth === 3)).toBe(true);
    expect(resolveWatchOnlyTargets(account.deriveChild(0).publicExtendedKey, adapters).map(({ adapterId }) => adapterId)).toEqual(['bitcoin', 'ethereum']);
    const testAccount = HDKey.fromMasterSeed(new Uint8Array(32).fill(8), { private: 0x04358394, public: 0x043587cf }).derive("m/44'/1'/0'");
    const targets = resolveWatchOnlyTargets(testAccount.publicExtendedKey, adapters);
    expect(targets.map(({ adapterId }) => adapterId)).toEqual(['bitcoin', 'dash']);
    expect(targets.every(({ network }) => network === 'testnet')).toBe(true);
  });
  it('uses SLIP-132 single-signature versions to select an exact Bitcoin script family', async () => {
    const ypub = slip132(account.publicExtendedKey, 0x049d7cb2);
    const zpub = slip132(account.publicExtendedKey, 0x04b24746);
    for (const [encoded, label] of [[ypub, 'Nested SegWit'], [zpub, 'Native SegWit']] as const) {
      const targets = resolveWatchOnlyTargets(encoded, adapters);
      expect(targets).toHaveLength(1);
      expect(targets[0]).toMatchObject({ adapterId: 'bitcoin', network: 'mainnet' });
      expect(targets[0]?.material.detectionLabel).toContain(label);
      const queries: string[] = [];
      await scan(BITCOIN_RECOVERY_ADAPTER, encoded, context({
        utxoAddresses: async (_network, addresses) => {
          queries.push(...addresses);
          return addresses.map((address) => ({ address, balance: '0', transactionCount: 0 }));
        },
      }));
      expect(queries).toHaveLength(2); // receive + change, one exact script family
    }
  });
  it('rejects invalid curve points, broken checksums and master xpubs locally', () => {
    expect(() => resolveWatchOnlyTargets(`02${'f'.repeat(64)}`, adapters)).toThrow(/curve/u);
    const broken = account.publicExtendedKey.slice(0, -1) + (account.publicExtendedKey.endsWith('1') ? '2' : '1');
    expect(() => resolveWatchOnlyTargets(broken, adapters)).toThrow(/checksum/u);
    expect(() => resolveWatchOnlyTargets(HDKey.fromMasterSeed(new Uint8Array(32).fill(9)).publicExtendedKey, adapters)).toThrow(/master/u);
  });
  it('rejects secret material anywhere in a batch, including prefixed private payloads', () => {
    for (const secret of [account.privateExtendedKey, '11'.repeat(32), `public-key:${'11'.repeat(32)}`, 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about']) {
      expect(() => assertWatchOnlyBatchInput(`${publicKey}\n${secret}`)).toThrow(/Private/u);
    }
  });
  it('checks known Bitcoin addresses and exports a funded public key without blocking the report', async () => {
    const queries: string[] = [];
    const ctx = context({ utxoAddresses: async (_network, addresses) => {
      queries.push(...addresses);
      return addresses.map((address) => ({ address, balance: address === '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH' ? '100' : '0', transactionCount: 1 }));
    } });
    const result = await scan(BITCOIN_RECOVERY_ADAPTER, publicKey, ctx);
    expect(queries).toContain('1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH');
    expect(queries).toContain('1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm');
    expect(queries).toHaveLength(5);
    expect(queries.join()).not.toContain(publicKey);
    expect(result.sections[0]?.findings).toHaveLength(1);
    for (const format of ['csv', 'json'] as const) expect(() => ctx.sessionSecretGuard!.assertPublic(createRecoveryExport([result], format).text, 'export')).not.toThrow();
  });
  it('derives the known Ethereum address locally and sends only the address', async () => {
    const evmAccounts = vi.fn(async (_network, addresses: string[]) => ({ blockNumber: '100', entries: addresses.map((address) => ({ address, balance: '0', nonce: '0' })) }));
    const result = await scan(ETHEREUM_RECOVERY_ADAPTER, publicKey, context({ evmAccounts }));
    expect(evmAccounts.mock.calls[0]?.[1]).toEqual(['0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf']);
    expect(result.sections[0]?.scanned).toBe(1);
  });
  it('keeps xpubs out of queries and exports, while deriving address batches', async () => {
    const queries: string[] = [];
    const ctx = context({ utxoAddresses: async (_network, addresses) => { queries.push(...addresses); return addresses.map((address) => ({ address, balance: '0', transactionCount: 0 })); } });
    const result = await scan(BITCOIN_RECOVERY_ADAPTER, account.publicExtendedKey, ctx);
    expect(queries.length).toBe(8);
    expect(queries.join()).not.toContain(account.publicExtendedKey);
    expect(createRecoveryExport([result], 'json').text).not.toContain(account.publicExtendedKey);
    expect(() => ctx.sessionSecretGuard!.assertPublic(account.publicExtendedKey, 'export')).toThrow(/Blocked/u);
  });
  it('allows an explicit Identity hash lookup and converts Core duffs and Platform credits correctly', async () => {
    const identity = { identities: [{ identifier: '123456789ABCDEFGHJKLMNPQRSTUV', balance: '100000000000', revision: '0' }], metadata: { height: '1', protocolVersion: 1, coreChainLockedHeight: 1, timeMs: '1' }, proofQueries: 1, dapiDurationsMs: [1] };
    const query = vi.fn(async () => identity);
    const ctx = context({
      coreAddressInfo: async (_network, addresses) => addresses.map((address, i) => ({ address, balance: i === 0 ? '100000000' : '0', txCount: 1 })),
      platformAddresses: async () => ({ entries: [[`00${hash}`, { balance: '100000000000', nonce: '1' }]], metadata: { height: '1', protocolVersion: 1, coreChainLockedHeight: 1, timeMs: '1' } }),
      platformIdentityByPublicKeyHash: query,
    });
    const result = await scan(DASH_RECOVERY_ADAPTER, publicKey, ctx);
    expect(result.overview.find(({ label }) => label === 'Total located value')?.value).toBe('3 DASH');
    const exact = await scan(DASH_RECOVERY_ADAPTER, `identity:${hash}`, ctx);
    expect(exact.sections[0]?.findings).toHaveLength(1);
    expect(() => ctx.sessionSecretGuard!.assertPublic(createRecoveryExport([exact], 'json').text, 'export')).not.toThrow();
  });
  it('preserves Core findings when Platform services are unavailable', async () => {
    const result = await scan(DASH_RECOVERY_ADAPTER, publicKey, context({
      coreAddressInfo: async (_network, addresses) => addresses.map((address) => ({ address, balance: '100', txCount: 1 })),
    }));
    expect(result.sections.find(({ id }) => id === 'core')?.findings).toHaveLength(2);
    expect(result.sections.find(({ id }) => id === 'platform')?.state).toBe('failed');
    expect(result.sections.find(({ id }) => id === 'identity')?.state).toBe('failed');
    expect(result.warnings.some((warning) => warning.includes('was not checked'))).toBe(true);
    expect(createRecoveryExport([result], 'csv').text).toContain('was not checked');
  });
  it('recognizes a multiline Dash viewing bundle and its embedded network', () => {
    const raw = JSON.stringify({ format: 'dash-shielded-viewing-bundle', version: 1, network: 'testnet', fullViewingKey: '12'.repeat(96) }, null, 2);
    expect(parseWatchOnlyLines(raw)).toEqual([raw]);
    const targets = resolveWatchOnlyTargets(raw, adapters);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.adapterId).toBe('dash');
    expect(targets[0]?.network).toBe('testnet');
  });

});


it('derives Dash L2 payment addresses from a DIP17 key-class xpub and keeps credits intact', async () => {
  const keyClass = HDKey.fromMasterSeed(new Uint8Array(32).fill(7)).derive("m/9'/5'/17'/0'/0'");
  const childHash = hash160(keyClass.deriveChild(0).publicKey!);
  const address = encodePlatformP2pkh(childHash, 'dash');
  const publicXpub = keyClass.publicExtendedKey;
  expect(resolveWatchOnlyTargets(publicXpub, adapters).find(({ adapterId }) => adapterId === 'dash')?.material.kind).toBe('dash-platform-xpub');
  const queries: string[] = [];
  const ctx = context({ platformAddresses: async (_network, addresses) => {
    queries.push(...addresses);
    return { entries: addresses.includes(address) ? [[`00${bytesToHex(childHash)}`, { balance: '100000000001', nonce: '1' }]] : [],
      metadata: { height: '1', protocolVersion: 1, coreChainLockedHeight: 1, timeMs: '1' } };
  } });
  const result = await scan(DASH_RECOVERY_ADAPTER, `dash-platform-xpub:${publicXpub}`, ctx);
  expect(result.sections[0]?.findings[0]).toMatchObject({ title: address, balanceAtomic: 100000000001n, balanceLabel: '1.00000000001 DASH' });
  expect(queries).toHaveLength(21);
  expect(queries.join()).not.toContain(publicXpub);
  expect(createRecoveryExport([result], 'json').text).not.toContain(publicXpub);
});

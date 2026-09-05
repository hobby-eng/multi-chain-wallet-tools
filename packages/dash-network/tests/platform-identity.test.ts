import { base58 } from '@scure/base';
import type { EvoSDK } from '@dashevo/evo-sdk';
import { describe, expect, it, vi } from 'vitest';
import { bytesToHex, encodeWif, hash160, secp256k1 } from '@ckd/core/crypto.js';
import {
  DashPlatformIdentitySource,
  normalizeIdentityLookupInput,
} from '../src/platform-identity-source.js';
import {
  assertPublicLookupInput,
  PrivateMaterialError,
} from '../src/private-material.js';

describe('Platform Identity public input boundary', () => {
  it.each([
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    'xprv9s21ZrQH143K3example',
    '11'.repeat(32),
    JSON.stringify({ privateKey: 'secret' }),
    encodeWif(Uint8Array.from({ length: 32 }, (_, index) => index + 1), 0xcc),
  ])('rejects private-key-like input before lookup', (value) => {
    expect(() => assertPublicLookupInput(value)).toThrow(PrivateMaterialError);
  });

  it('normalizes public identity identifiers and key material', () => {
    const identifierBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const identifier = base58.encode(identifierBytes);
    const identifierHex = bytesToHex(identifierBytes);
    const privateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const publicKey = secp256k1.getPublicKey(privateKey, true);
    const publicKeyHex = bytesToHex(publicKey);

    expect(normalizeIdentityLookupInput(identifier)).toMatchObject({
      kind: 'identity-id',
      identityId: identifier,
    });
    expect(normalizeIdentityLookupInput(`idhex:${identifierHex}`)).toMatchObject({
      kind: 'identity-id-hex',
      identityId: identifier,
    });
    expect(normalizeIdentityLookupInput(`tx:${'cd'.repeat(32)}`)).toMatchObject({
      kind: 'registration-transaction',
      registrationTransactionHash: 'CD'.repeat(32),
    });
    expect(normalizeIdentityLookupInput('ab'.repeat(20))).toMatchObject({
      kind: 'public-key-hash',
      publicKeyHashHex: 'ab'.repeat(20),
    });
    expect(normalizeIdentityLookupInput(publicKeyHex)).toMatchObject({
      kind: 'ecdsa-public-key',
      publicKeyHashHex: bytesToHex(hash160(publicKey)),
      publicKeyHex,
    });
    expect(normalizeIdentityLookupInput('alice.dash')).toMatchObject({
      kind: 'dpns-name',
      dpnsName: 'alice.dash',
    });
    expect(normalizeIdentityLookupInput('Alice')).toMatchObject({
      kind: 'dpns-name',
      dpnsName: 'alice.dash',
    });
  });

  it('rejects ambiguous bare 64-hex input with safe explicit-prefix guidance', () => {
    expect(() => normalizeIdentityLookupInput('11'.repeat(32)))
      .toThrow('idhex:<hex>');
    expect(() => normalizeIdentityLookupInput('11'.repeat(32)))
      .toThrow(PrivateMaterialError);
  });

  it('does not reinterpret a malformed public key as another input type', () => {
    expect(() => normalizeIdentityLookupInput(`02${'00'.repeat(32)}`))
      .toThrow('compressed secp256k1 public key is invalid');
  });

  it('resolves a DPNS name and reverse-confirms it with proof-verified usernames', async () => {
    const identifier = base58.encode(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
    const metadata = () => ({
      height: 8n,
      coreChainLockedHeight: 50,
      protocolVersion: 13,
      timeMs: 2n,
      free: vi.fn(),
    });
    const proof = <T>(data: T) => ({
      data,
      metadata: metadata(),
      free: vi.fn(),
    });
    const fakeIdentity = {
      get id() {
        return {
          toBase58: () => identifier,
          toHex: () => '01'.repeat(32),
          free: vi.fn(),
        };
      },
      balance: 1n,
      revision: 0n,
      publicKeys: [],
      free: vi.fn(),
    };
    const fakeSdk = {
      connect: vi.fn(async () => undefined),
      identities: {
        fetchWithProof: vi.fn(async () => proof(fakeIdentity)),
        nonceWithProof: vi.fn(async () => proof((1n << 40n) + 4n)),
      },
      dpns: {
        resolveName: vi.fn(async () => identifier),
        usernamesWithProof: vi.fn(async () => proof(['alice.dash'])),
      },
    } as unknown as EvoSDK;
    const source = new DashPlatformIdentitySource('mainnet', () => fakeSdk);

    await source.connect();
    const result = await source.query(normalizeIdentityLookupInput('Alice'));

    expect(result).toMatchObject({
      resolvedDpnsName: 'alice.dash',
      resolvedDpnsDocumentId: null,
      requests: 4,
      identities: [{ identifier, nonce: 4n, dpnsNames: ['alice.dash'] }],
    });
    expect(fakeSdk.dpns.resolveName).toHaveBeenCalledWith('alice.dash');
    expect(result.proofs).toHaveLength(3);
  });

  it('resolves a verified registration transition owner before loading Identity proofs', async () => {
    const identifier = base58.encode(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
    const transactionHash = 'AB'.repeat(32);
    const metadata = () => ({
      height: 8n,
      coreChainLockedHeight: 50,
      protocolVersion: 13,
      timeMs: 2n,
      free: vi.fn(),
    });
    const proof = <T>(data: T) => ({
      data,
      metadata: metadata(),
      free: vi.fn(),
    });
    const fakeIdentity = {
      get id() {
        return {
          toBase58: () => identifier,
          toHex: () => '01'.repeat(32),
          free: vi.fn(),
        };
      },
      balance: 1n,
      revision: 0n,
      publicKeys: [],
      free: vi.fn(),
    };
    const fakeSdk = {
      connect: vi.fn(async () => undefined),
      identities: {
        fetchWithProof: vi.fn(async () => proof(fakeIdentity)),
        nonceWithProof: vi.fn(async () => proof(4n)),
      },
      dpns: {
        usernamesWithProof: vi.fn(async () => proof(['alice.dash'])),
      },
    } as unknown as EvoSDK;
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      hash: transactionHash,
      type: 'IDENTITY_CREATE',
      data: 'encoded-registration-transition',
      owner: { identifier },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const decoder = vi.fn(() => identifier);
    const source = new DashPlatformIdentitySource('mainnet', () => fakeSdk, fetcher, decoder);

    await source.connect();
    const result = await source.query(normalizeIdentityLookupInput(`tx:${transactionHash}`));

    expect(result).toMatchObject({
      inputKind: 'registration-transaction',
      resolvedRegistrationTransactionHash: transactionHash,
      requests: 4,
      identities: [{ identifier, nonce: 4n, dpnsNames: ['alice.dash'] }],
    });
    expect(fetcher).toHaveBeenCalledWith(
      `https://platform-explorer.pshenmic.dev/transaction/${transactionHash}`,
      undefined,
    );
    expect(decoder).toHaveBeenCalledWith('encoded-registration-transition', transactionHash);
  });

  it('paginates non-unique HASH160 matches and enriches every Identity with proof data', async () => {
    const hash = 'ab'.repeat(20);
    const ids = [
      base58.encode(Uint8Array.from({ length: 32 }, (_, index) => index + 1)),
      base58.encode(Uint8Array.from({ length: 32 }, (_, index) => index + 2)),
    ];
    const metadata = (height: bigint) => ({
      height,
      coreChainLockedHeight: 50,
      protocolVersion: 13,
      timeMs: 2n,
      free: vi.fn(),
    });
    const proof = <T>(data: T, height: bigint) => ({
      data,
      metadata: metadata(height),
      free: vi.fn(),
    });
    const identity = (identifier: string, balance: bigint) => ({
      get id() {
        return {
          toBase58: () => identifier,
          toHex: () => '01'.repeat(32),
          free: vi.fn(),
        };
      },
      balance,
      revision: 3n,
      get publicKeys() {
        return [{
          keyId: 7,
          purpose: 'AUTHENTICATION',
          purposeNumber: 0,
          securityLevel: 'MASTER',
          securityLevelNumber: 0,
          keyType: 'ECDSA_HASH160',
          keyTypeNumber: 2,
          data: hash,
          isReadOnly: false,
          isMaster: true,
          disabledAt: undefined,
          contractBounds: undefined,
          getPublicKeyHash: () => hash,
          free: vi.fn(),
        }];
      },
      free: vi.fn(),
    });
    let nonUniquePage = 0;
    const byNonUnique = vi.fn(async (_publicKeyHash: Uint8Array, _startAfter?: string) => {
      const page = nonUniquePage;
      nonUniquePage += 1;
      return proof(page < ids.length ? [identity(ids[page]!, BigInt(page + 1))] : [], BigInt(page + 2));
    });
    const fakeSdk = {
      connect: vi.fn(async () => undefined),
      identities: {
        byPublicKeyHashWithProof: vi.fn(async () => proof(undefined, 1n)),
        byNonUniquePublicKeyHashWithProof: byNonUnique,
        nonceWithProof: vi.fn(async (identifier: string) => proof(BigInt(ids.indexOf(identifier) + 10), 8n)),
      },
      dpns: {
        usernamesWithProof: vi.fn(async ({ identityId }: { identityId: string }) => proof(
          [`name-${ids.indexOf(identityId)}.dash`],
          8n,
        )),
      },
    } as unknown as EvoSDK;
    const source = new DashPlatformIdentitySource('mainnet', () => fakeSdk);

    await source.connect();
    const result = await source.query(normalizeIdentityLookupInput(hash));

    expect(result.identities.map(({ identifier }) => identifier)).toEqual(ids);
    expect(result.identities[0]).toMatchObject({
      balanceCredits: 1n,
      nonce: 10n,
      dpnsNames: ['name-0.dash'],
      publicKeys: [{ keyId: 7, matchesLookup: true }],
    });
    expect(result.requests).toBe(8);
    expect(byNonUnique).toHaveBeenCalledTimes(3);
    expect(byNonUnique.mock.calls.map((call) => call[1])).toEqual([undefined, ids[0], ids[1]]);
  });
});

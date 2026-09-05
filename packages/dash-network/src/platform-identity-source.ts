import { base58 } from '@scure/base';
import {
  EvoSDK,
  StateTransition,
  type Identity,
  type IdentityPublicKey,
} from '@dashevo/evo-sdk';
import { bytesToHex, hash160, hexToBytes, secp256k1, wipe } from '@ckd/core/crypto.js';
import { assertPublicLookupInput, PrivateMaterialError } from './private-material.js';
import {
  createProviderHttp,
  ProviderHttpError,
  type FetchLike,
} from './provider-http.js';
import type { ViewerNetwork } from './types.js';

const HASH160_PATTERN = /^[0-9a-f]{40}$/u;
const HEX_IDENTIFIER_PATTERN = /^[0-9a-f]{64}$/u;
const ECDSA_PUBLIC_KEY_PATTERN = /^(?:02|03)[0-9a-f]{64}$/u;
const BLS_PUBLIC_KEY_PATTERN = /^[0-9a-f]{96}$/u;
const EXPLICIT_BLS_PUBLIC_KEY_PATTERN = /^bls:\s*(?:0x)?([0-9a-f]{96})$/iu;
const DPNS_NAME_PATTERN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.dash)?$/u;
const EXPLICIT_HEX_ID_PATTERN = /^idhex:\s*(?:0x)?([0-9a-f]{64})$/iu;
const EXPLICIT_REGISTRATION_TRANSACTION_PATTERN = /^(?:tx|transition):\s*(?:0x)?([0-9a-f]{64})$/iu;
const IDENTITY_CREATION_ACTIONS = new Set([
  'IdentityCreate',
  'IdentityCreateFromAddresses',
  'IdentityCreateFromShieldedPool',
]);
const IDENTITY_CREATION_TYPES = new Set([
  'IDENTITY_CREATE',
  'IDENTITY_CREATE_FROM_ADDRESSES',
  'IDENTITY_CREATE_FROM_SHIELDED_POOL',
]);
const MAX_NON_UNIQUE_IDENTITIES = 100;
const MAX_DPNS_NAMES = 100;
const IDENTITY_NONCE_VALUE_FILTER = 0xffffffffffn;

export type IdentityLookupKind =
  | 'identity-id'
  | 'identity-id-hex'
  | 'registration-transaction'
  | 'public-key-hash'
  | 'ecdsa-public-key'
  | 'bls-public-key'
  | 'dpns-name';

export interface NormalizedIdentityLookup {
  kind: IdentityLookupKind;
  label: string;
  identityId?: string;
  publicKeyHashHex?: string;
  publicKeyHex?: string;
  dpnsName?: string;
  registrationTransactionHash?: string;
}

export interface IdentityProofMetadata {
  height: bigint;
  coreChainLockedHeight: number;
  protocolVersion: number;
  responseTimeMs: bigint;
}

export interface IdentityContractBoundsSnapshot {
  type: string;
  identifier: string;
  documentTypeName: string | null;
}

export interface IdentityPublicKeySnapshot {
  keyId: number;
  purpose: string;
  purposeNumber: number;
  securityLevel: string;
  securityLevelNumber: number;
  keyType: string;
  keyTypeNumber: number;
  dataHex: string;
  publicKeyHashHex: string;
  readOnly: boolean;
  isMaster: boolean;
  disabledAtMs: bigint | null;
  contractBounds: IdentityContractBoundsSnapshot | null;
  matchesLookup: boolean;
}

export interface PlatformIdentitySnapshot {
  identifier: string;
  identifierHex: string;
  balanceCredits: bigint;
  revision: bigint;
  nonce: bigint | null;
  dpnsNames: string[];
  publicKeys: IdentityPublicKeySnapshot[];
}

export interface PlatformIdentityLookupSnapshot {
  kind: 'identity';
  network: ViewerNetwork;
  inputKind: IdentityLookupKind;
  inputLabel: string;
  publicKeyHashHex: string | null;
  resolvedDpnsName: string | null;
  resolvedDpnsDocumentId: string | null;
  resolvedRegistrationTransactionHash: string | null;
  identities: PlatformIdentitySnapshot[];
  proofs: IdentityProofMetadata[];
  requests: number;
}

interface MetadataLike {
  height: bigint;
  coreChainLockedHeight: number;
  protocolVersion: number;
  timeMs: bigint;
  free(): void;
}

export type RegistrationTransactionDecoder = (
  encodedTransition: string,
  expectedHash: string,
) => string;

const PLATFORM_EXPLORER_ENDPOINTS: Record<ViewerNetwork, string> = {
  mainnet: 'https://platform-explorer.pshenmic.dev',
  testnet: 'https://testnet.platform-explorer.pshenmic.dev',
};

const {
  object: explorerObject,
  fetchJson: fetchExplorerJson,
} = createProviderHttp('Platform Explorer');

function normalizedHex(input: string): string {
  return input.trim().replace(/^0x/iu, '').replace(/\s+/gu, '').toLowerCase();
}

function canonicalIdentifier(value: string): string | null {
  try {
    const bytes = base58.decode(value);
    return bytes.length === 32 && base58.encode(bytes) === value ? value : null;
  } catch {
    return null;
  }
}

export function normalizeIdentityLookupInput(value: string): NormalizedIdentityLookup {
  const trimmed = value.trim();
  const hex = normalizedHex(trimmed);
  if (HEX_IDENTIFIER_PATTERN.test(hex)) {
    throw new PrivateMaterialError(
      'A bare 64-character hex value could be a private key and was erased without a network request. '
      + 'For a public hex Identity ID use idhex:<hex>; for a registration transition use tx:<hash>.',
    );
  }
  assertPublicLookupInput(value);
  const explicitHexIdentifier = trimmed.match(EXPLICIT_HEX_ID_PATTERN)?.[1]?.toLowerCase();
  if (explicitHexIdentifier !== undefined) {
    const bytes = hexToBytes(explicitHexIdentifier);
    try {
      return {
        kind: 'identity-id-hex',
        label: 'Hex Identity ID',
        identityId: base58.encode(bytes),
      };
    } finally {
      wipe(bytes);
    }
  }
  const registrationTransactionHash = trimmed
    .match(EXPLICIT_REGISTRATION_TRANSACTION_PATTERN)?.[1]?.toUpperCase();
  if (registrationTransactionHash !== undefined) {
    return {
      kind: 'registration-transaction',
      label: 'Identity registration transition hash',
      registrationTransactionHash,
    };
  }
  const explicitBlsPublicKey = trimmed.match(EXPLICIT_BLS_PUBLIC_KEY_PATTERN)?.[1]?.toLowerCase();
  if (explicitBlsPublicKey !== undefined) {
    const bytes = hexToBytes(explicitBlsPublicKey);
    try {
      return {
        kind: 'bls-public-key',
        label: 'BLS12_381 public key',
        publicKeyHashHex: bytesToHex(hash160(bytes)),
        publicKeyHex: explicitBlsPublicKey,
      };
    } finally {
      wipe(bytes);
    }
  }
  if (HASH160_PATTERN.test(hex)) {
    return {
      kind: 'public-key-hash',
      label: 'Public-key HASH160',
      publicKeyHashHex: hex,
    };
  }
  if (ECDSA_PUBLIC_KEY_PATTERN.test(hex)) {
    try {
      secp256k1.Point.fromHex(hex);
    } catch {
      throw new Error('The compressed secp256k1 public key is invalid.');
    }
    const bytes = hexToBytes(hex);
    try {
      return {
        kind: 'ecdsa-public-key',
        label: 'ECDSA_SECP256K1 public key',
        publicKeyHashHex: bytesToHex(hash160(bytes)),
        publicKeyHex: hex,
      };
    } finally {
      wipe(bytes);
    }
  }
  if (BLS_PUBLIC_KEY_PATTERN.test(hex)) {
    throw new PrivateMaterialError(
      'A bare 96-character hex value is ambiguous with truncated viewing-key material and was erased '
      + 'without a network request. For a BLS12_381 public key use bls:<hex>.',
    );
  }
  const identifier = canonicalIdentifier(trimmed);
  if (identifier !== null) {
    return {
      kind: 'identity-id',
      label: 'Base58 Identity ID',
      identityId: identifier,
    };
  }
  const name = trimmed.toLowerCase();
  if (DPNS_NAME_PATTERN.test(name)) {
    return {
      kind: 'dpns-name',
      label: 'DPNS name',
      dpnsName: name.endsWith('.dash') ? name : `${name}.dash`,
    };
  }
  throw new Error('Enter a Base58 Identity ID, idhex:<hex ID>, tx:<registration hash>, 40-character HASH160, compressed ECDSA key, BLS key, or DPNS name.');
}

function decodeRegistrationTransaction(
  encodedTransition: string,
  expectedHash: string,
): string {
  let transition: StateTransition | null = null;
  let ownerId: { toBase58(): string; free(): void } | undefined;
  try {
    transition = StateTransition.fromBase64(encodedTransition);
    if (!IDENTITY_CREATION_ACTIONS.has(transition.actionType)) {
      throw new Error('The transition is not an Identity creation transition.');
    }
    if (transition.hash(false).toUpperCase() !== expectedHash) {
      throw new Error('The indexed transition bytes do not match the requested transition hash.');
    }
    const transitionOwner = transition.ownerId;
    if (transitionOwner === undefined) {
      throw new Error('The Identity creation transition omitted its owner identifier.');
    }
    ownerId = transitionOwner;
    const identityId = ownerId.toBase58();
    if (canonicalIdentifier(identityId) === null) {
      throw new Error('The Identity creation transition contains an invalid owner identifier.');
    }
    return identityId;
  } finally {
    ownerId?.free();
    transition?.free();
  }
}

function copyMetadata(metadata: MetadataLike): IdentityProofMetadata {
  return {
    height: metadata.height,
    coreChainLockedHeight: metadata.coreChainLockedHeight,
    protocolVersion: metadata.protocolVersion,
    responseTimeMs: metadata.timeMs,
  };
}

function copyContractBounds(key: IdentityPublicKey): IdentityContractBoundsSnapshot | null {
  const bounds = key.contractBounds;
  if (bounds === undefined) return null;
  const identifier = bounds.identifier;
  try {
    return {
      type: bounds.contractBoundsType,
      identifier: identifier.toBase58(),
      documentTypeName: bounds.documentTypeName ?? null,
    };
  } finally {
    identifier.free();
    bounds.free();
  }
}

function copyPublicKey(key: IdentityPublicKey, lookupHash: string | undefined): IdentityPublicKeySnapshot {
  const publicKeyHashHex = key.getPublicKeyHash().toLowerCase();
  return {
    keyId: key.keyId,
    purpose: key.purpose,
    purposeNumber: key.purposeNumber,
    securityLevel: key.securityLevel,
    securityLevelNumber: key.securityLevelNumber,
    keyType: key.keyType,
    keyTypeNumber: key.keyTypeNumber,
    dataHex: key.data.toLowerCase(),
    publicKeyHashHex,
    readOnly: key.isReadOnly,
    isMaster: key.isMaster,
    disabledAtMs: key.disabledAt ?? null,
    contractBounds: copyContractBounds(key),
    matchesLookup: lookupHash !== undefined && publicKeyHashHex === lookupHash,
  };
}

function copyIdentity(identity: Identity, lookupHash: string | undefined): PlatformIdentitySnapshot {
  const identifier = identity.id;
  const keys = identity.publicKeys;
  try {
    return {
      identifier: identifier.toBase58(),
      identifierHex: identifier.toHex(),
      balanceCredits: identity.balance,
      revision: identity.revision,
      nonce: null,
      dpnsNames: [],
      publicKeys: keys.map((key) => {
        try {
          return copyPublicKey(key, lookupHash);
        } finally {
          key.free();
        }
      }),
    };
  } finally {
    identifier.free();
  }
}

function recordProof(
  proofs: IdentityProofMetadata[],
  metadata: MetadataLike,
): void {
  proofs.push(copyMetadata(metadata));
}

export class DashPlatformIdentitySource {
  readonly #network: ViewerNetwork;
  readonly #createSdk: (network: ViewerNetwork) => EvoSDK;
  readonly #fetcher: FetchLike;
  readonly #decodeRegistrationTransaction: RegistrationTransactionDecoder;
  #sdk: EvoSDK | undefined;

  constructor(
    network: ViewerNetwork,
    createSdk: (network: ViewerNetwork) => EvoSDK = (selectedNetwork) => {
      const settings = { connectTimeoutMs: 10_000, timeoutMs: 30_000, retries: 3, banFailedAddress: true };
      return selectedNetwork === 'mainnet'
        ? EvoSDK.mainnetTrusted({ settings })
        : EvoSDK.testnetTrusted({ settings });
    },
    fetcher: FetchLike = fetch,
    registrationTransactionDecoder: RegistrationTransactionDecoder = decodeRegistrationTransaction,
  ) {
    this.#network = network;
    this.#createSdk = createSdk;
    this.#fetcher = fetcher;
    this.#decodeRegistrationTransaction = registrationTransactionDecoder;
  }

  async connect(): Promise<void> {
    if (this.#sdk !== undefined) return;
    const sdk = this.#createSdk(this.#network);
    await sdk.connect();
    this.#sdk = sdk;
  }

  async #identityById(
    identityId: string,
    lookupHash: string | undefined,
    proofs: IdentityProofMetadata[],
  ): Promise<PlatformIdentitySnapshot | null> {
    if (this.#sdk === undefined) throw new Error('Dash Evo SDK is not connected.');
    const response = await this.#sdk.identities.fetchWithProof(identityId);
    const metadata = response.metadata;
    const identity = response.data;
    try {
      recordProof(proofs, metadata);
      if (identity === undefined) return null;
      return copyIdentity(identity, lookupHash);
    } finally {
      identity?.free();
      metadata.free();
      response.free();
    }
  }

  async #lookupByHash(
    publicKeyHashHex: string,
    proofs: IdentityProofMetadata[],
  ): Promise<PlatformIdentitySnapshot[]> {
    if (this.#sdk === undefined) throw new Error('Dash Evo SDK is not connected.');
    const publicKeyHash = hexToBytes(publicKeyHashHex);
    try {
      const uniqueResponse = await this.#sdk.identities.byPublicKeyHashWithProof(publicKeyHash);
      const uniqueMetadata = uniqueResponse.metadata;
      const uniqueIdentity = uniqueResponse.data;
      try {
        recordProof(proofs, uniqueMetadata);
        if (uniqueIdentity !== undefined) return [copyIdentity(uniqueIdentity, publicKeyHashHex)];
      } finally {
        uniqueIdentity?.free();
        uniqueMetadata.free();
        uniqueResponse.free();
      }

      const identities: PlatformIdentitySnapshot[] = [];
      const seen = new Set<string>();
      let startAfter: string | undefined;
      while (identities.length <= MAX_NON_UNIQUE_IDENTITIES) {
        const response = await this.#sdk.identities.byNonUniquePublicKeyHashWithProof(publicKeyHash, startAfter);
        const metadata = response.metadata;
        const page = response.data;
        try {
          recordProof(proofs, metadata);
          if (page.length === 0) return identities;
          for (const identity of page) {
            const copied = copyIdentity(identity, publicKeyHashHex);
            if (seen.has(copied.identifier)) {
              throw new Error('DAPI repeated an Identity while paginating a non-unique public-key hash.');
            }
            seen.add(copied.identifier);
            identities.push(copied);
            startAfter = copied.identifier;
          }
        } finally {
          for (const identity of page) identity.free();
          metadata.free();
          response.free();
        }
      }
      throw new Error(`More than ${MAX_NON_UNIQUE_IDENTITIES} identities share this HASH160. Query a specific Base58 Identity ID.`);
    } finally {
      wipe(publicKeyHash);
    }
  }

  async #resolveDpns(
    name: string,
  ): Promise<string | null> {
    if (this.#sdk === undefined) throw new Error('Dash Evo SDK is not connected.');
    const identityId = await this.#sdk.dpns.resolveName(name);
    if (identityId === undefined) return null;
    if (canonicalIdentifier(identityId) === null) {
      throw new Error('DAPI returned a malformed Identity ID while resolving the DPNS name.');
    }
    return identityId;
  }

  async #resolveRegistrationTransaction(transactionHash: string): Promise<string> {
    const endpoint = PLATFORM_EXPLORER_ENDPOINTS[this.#network];
    let value: unknown;
    try {
      value = await fetchExplorerJson(
        this.#fetcher,
        `${endpoint}/transaction/${encodeURIComponent(transactionHash)}`,
      );
    } catch (cause) {
      if (cause instanceof ProviderHttpError && cause.status === 404) {
        throw new Error('The registration transition was not found in the synchronized Platform Explorer index.');
      }
      throw cause;
    }
    const transaction = explorerObject(value, 'registration transaction');
    const indexedHash = typeof transaction.hash === 'string' ? transaction.hash.toUpperCase() : null;
    const indexedType = typeof transaction.type === 'string' ? transaction.type : null;
    const encodedTransition = typeof transaction.data === 'string' && transaction.data.length > 0
      ? transaction.data
      : null;
    if (indexedHash !== transactionHash) {
      throw new Error('Platform Explorer returned a different transaction than requested.');
    }
    if (indexedType === null || !IDENTITY_CREATION_TYPES.has(indexedType)) {
      throw new Error('The supplied transaction is not an Identity registration transition.');
    }
    if (encodedTransition === null) {
      throw new Error('Platform Explorer omitted the raw Identity registration transition.');
    }
    const identityId = this.#decodeRegistrationTransaction(encodedTransition, transactionHash);
    const indexedOwner = transaction.owner;
    if (typeof indexedOwner === 'object' && indexedOwner !== null && !Array.isArray(indexedOwner)) {
      const ownerIdentifier = (indexedOwner as Record<string, unknown>).identifier;
      if (typeof ownerIdentifier === 'string' && ownerIdentifier !== identityId) {
        throw new Error('The decoded registration owner disagrees with the Platform Explorer index.');
      }
    }
    return identityId;
  }

  async #enrichIdentity(
    identity: PlatformIdentitySnapshot,
    proofs: IdentityProofMetadata[],
  ): Promise<void> {
    if (this.#sdk === undefined) throw new Error('Dash Evo SDK is not connected.');
    const [nonceResponse, namesResponse] = await Promise.all([
      this.#sdk.identities.nonceWithProof(identity.identifier),
      this.#sdk.dpns.usernamesWithProof({ identityId: identity.identifier, limit: MAX_DPNS_NAMES }),
    ]);
    const nonceMetadata = nonceResponse.metadata;
    const namesMetadata = namesResponse.metadata;
    try {
      recordProof(proofs, nonceMetadata);
      recordProof(proofs, namesMetadata);
      identity.nonce = nonceResponse.data === undefined
        ? null
        : nonceResponse.data & IDENTITY_NONCE_VALUE_FILTER;
      const names: unknown = namesResponse.data;
      if (!Array.isArray(names) || !names.every((name): name is string => typeof name === 'string')) {
        throw new Error('DAPI returned malformed DPNS names for the Identity.');
      }
      identity.dpnsNames = [...new Set(names.map((name) => name.toLowerCase()))].sort();
    } finally {
      nonceMetadata.free();
      namesMetadata.free();
      nonceResponse.free();
      namesResponse.free();
    }
  }

  async query(input: NormalizedIdentityLookup): Promise<PlatformIdentityLookupSnapshot> {
    if (this.#sdk === undefined) throw new Error('Dash Evo SDK is not connected.');
    const proofs: IdentityProofMetadata[] = [];
    let identities: PlatformIdentitySnapshot[] = [];
    let resolvedDpnsDocumentId: string | null = null;
    let resolvedDpnsName: string | null = null;
    let resolvedRegistrationTransactionHash: string | null = null;

    if (input.kind === 'identity-id' || input.kind === 'identity-id-hex') {
      const identity = await this.#identityById(input.identityId!, undefined, proofs);
      if (identity !== null) identities = [identity];
    } else if (input.kind === 'registration-transaction') {
      const resolved = await this.#resolveRegistrationTransaction(input.registrationTransactionHash!);
      resolvedRegistrationTransactionHash = input.registrationTransactionHash!;
      const identity = await this.#identityById(resolved, undefined, proofs);
      if (identity !== null) identities = [identity];
    } else if (input.kind === 'dpns-name') {
      const resolved = await this.#resolveDpns(input.dpnsName!);
      resolvedDpnsName = input.dpnsName!;
      if (resolved !== null) {
        const identity = await this.#identityById(resolved, undefined, proofs);
        if (identity !== null) identities = [identity];
      }
    } else {
      identities = await this.#lookupByHash(input.publicKeyHashHex!, proofs);
    }

    for (const identity of identities) await this.#enrichIdentity(identity, proofs);
    if (
      input.kind === 'dpns-name'
      && identities.some(({ dpnsNames }) => !dpnsNames.includes(input.dpnsName!))
    ) {
      throw new Error('The proof-verified DPNS records did not confirm the resolved Identity.');
    }

    return {
      kind: 'identity',
      network: this.#network,
      inputKind: input.kind,
      inputLabel: input.label,
      publicKeyHashHex: input.publicKeyHashHex ?? null,
      resolvedDpnsName,
      resolvedDpnsDocumentId,
      resolvedRegistrationTransactionHash,
      identities,
      proofs,
      requests: proofs.length + (
        input.kind === 'dpns-name' || input.kind === 'registration-transaction' ? 1 : 0
      ),
    };
  }
}

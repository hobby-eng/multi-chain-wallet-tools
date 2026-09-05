import type { HDKey } from '@scure/bip32';
import { assertBatch, assertIndex, requirePrivate, requirePublic, rootFromSeed } from '@ckd/core/bip32.js';
import { bytesToHex, encodeWif, hash160, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import {
  field,
  type Bip32BatchOptions,
  type DerivationResult,
  type NetworkName,
  type ResultFieldGroup,
} from '@ckd/core/types.js';

export interface DashIdentityKey {
  path: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeyHash: Uint8Array;
}

export type DashIdentityAuthenticationKey = DashIdentityKey;

export interface DashIdentityStandardKey {
  keyId: 0 | 1 | 2 | 3;
  purpose: 'AUTHENTICATION' | 'TRANSFER';
  purposeValue: 0 | 3;
  securityLevel: 'MASTER' | 'CRITICAL' | 'HIGH';
  securityLevelValue: 0 | 1 | 2;
  use: string;
}

export const DASH_IDENTITY_STANDARD_PROFILE_NAME = 'Official Platform Wallet v4.1.1 · 4 ECDSA keys';

/**
 * The default registration profile is wallet policy, not a DIP13 path rule.
 * An IdentityCreate transition explicitly assigns each public key its purpose
 * and security level; a custom registration can assign different metadata.
 */
export const DASH_IDENTITY_STANDARD_KEYS: readonly DashIdentityStandardKey[] = [
  {
    keyId: 0,
    purpose: 'AUTHENTICATION',
    purposeValue: 0,
    securityLevel: 'MASTER',
    securityLevelValue: 0,
    use: 'Master-level identity authentication and later identity-key management.',
  },
  {
    keyId: 1,
    purpose: 'AUTHENTICATION',
    purposeValue: 0,
    securityLevel: 'CRITICAL',
    securityLevelValue: 1,
    use: 'Critical authentication operations, including sensitive token operations.',
  },
  {
    keyId: 2,
    purpose: 'AUTHENTICATION',
    purposeValue: 0,
    securityLevel: 'HIGH',
    securityLevelValue: 2,
    use: 'Routine document and application state transitions.',
  },
  {
    keyId: 3,
    purpose: 'TRANSFER',
    purposeValue: 3,
    securityLevel: 'CRITICAL',
    securityLevelValue: 1,
    use: 'Identity credit transfers and withdrawals.',
  },
] as const;

/**
 * Derives an ECDSA/secp256k1 key from the current Dash Identity DIP13 branch.
 *
 * The path deliberately has no wallet-account component. DIP13 assigns the
 * final two hardened levels to the identity index and identity key index:
 * m/9'/coin_type'/5'/0'/0'/identity_index'/key_index'.
 */
export function deriveDashIdentityKey(
  root: HDKey,
  networkName: NetworkName,
  identityIndex: number,
  keyIndex = 0,
): DashIdentityKey {
  assertIndex(identityIndex, 'Identity index');
  assertIndex(keyIndex, 'Identity key index');
  const network = getDashNetwork(networkName);
  const path = `m/9'/${network.coinType}'/5'/0'/0'/${identityIndex}'/${keyIndex}'`;
  const node = root.derive(path);
  const privateSource = requirePrivate(node, path);
  const publicSource = requirePublic(node, path);
  const privateKey = Uint8Array.from(privateSource);
  const publicKey = Uint8Array.from(publicSource);
  const publicKeyHash = hash160(publicKey);
  wipe(privateSource, publicSource);
  node.wipePrivateData();
  return { path, privateKey, publicKey, publicKeyHash };
}

/** Backwards-compatible name used by Identity discovery, which derives key ID 0. */
export function deriveDashIdentityAuthenticationKey(
  root: HDKey,
  networkName: NetworkName,
  identityIndex: number,
  keyIndex = 0,
): DashIdentityAuthenticationKey {
  return deriveDashIdentityKey(root, networkName, identityIndex, keyIndex);
}

function keyFieldKey(keyId: number, name: string): string {
  return `key${keyId}${name}`;
}

function standardKeyGroup(
  root: HDKey,
  networkName: Bip32BatchOptions['network'],
  key: DashIdentityStandardKey,
  identityIndex: number,
  wifPrefix: number,
): ResultFieldGroup {
  const derived = deriveDashIdentityKey(root, networkName, identityIndex, key.keyId);
  const prefix = `key${key.keyId}`;
  try {
    return {
      key: prefix,
      title: `Key ${key.keyId} · ${key.securityLevel} ${key.purpose}`,
      description: `${key.use} This role is assigned by the official wallet's registration profile; it is not encoded in the derived key or path.`,
      basic: [
        field(
          keyFieldKey(key.keyId, 'PublicKeyHash'),
          'Public-key HASH160',
          bytesToHex(derived.publicKeyHash),
          false,
          'Public lookup fingerprint used by proof-verified Identity discovery. It is not an address or an Identity ID.',
        ),
        field(
          keyFieldKey(key.keyId, 'PublicKey'),
          'Compressed public key',
          bytesToHex(derived.publicKey),
        ),
        field(
          keyFieldKey(key.keyId, 'PrivateKeyWif'),
          'Private key (Dash WIF)',
          encodeWif(derived.privateKey, wifPrefix),
          true,
          'Transport encoding of the 32-byte secp256k1 secret. WIF does not retain the DIP13 path or registration metadata.',
        ),
      ],
      advanced: [
        field(keyFieldKey(key.keyId, 'KeyId'), 'Key ID', String(key.keyId)),
        field(
          keyFieldKey(key.keyId, 'Purpose'),
          'Official default purpose',
          `${key.purpose} (${key.purposeValue})`,
          false,
          'Registration metadata selected by the wallet, not a property derived from key ID.',
        ),
        field(
          keyFieldKey(key.keyId, 'SecurityLevel'),
          'Official default security level',
          `${key.securityLevel} (${key.securityLevelValue})`,
          false,
          'Registration metadata selected by the wallet, not a property derived from key ID.',
        ),
        field(keyFieldKey(key.keyId, 'KeyType'), 'Key type', 'ECDSA_SECP256K1 (0)'),
        field(keyFieldKey(key.keyId, 'Path'), 'DIP13 derivation path', derived.path),
        field(
          keyFieldKey(key.keyId, 'PrivateKeyHex'),
          'Private key (raw 32-byte hex)',
          bytesToHex(derived.privateKey),
          true,
        ),
        field(keyFieldKey(key.keyId, 'PublicKeySize'), 'Public-key size', '33 bytes · compressed secp256k1'),
        field(keyFieldKey(key.keyId, 'DerivationMode'), 'Derivation mode', 'All seven path levels hardened'),
        field(keyFieldKey(key.keyId, 'ReadOnly'), 'Official default readOnly', 'false'),
        field(keyFieldKey(key.keyId, 'ContractBounds'), 'Official default contract bounds', 'None'),
      ],
    };
  } finally {
    wipe(derived.privateKey, derived.publicKey, derived.publicKeyHash);
  }
}

/** Derives candidate keys for the official four-key Dash Platform registration profile. */
export function deriveDashIdentity(options: Bip32BatchOptions): DerivationResult {
  const network = getDashNetwork(options.network);
  assertBatch(options.start, options.count);
  const root = rootFromSeed(options.seed, network.versions);
  const profilePath = `m/9'/${network.coinType}'/5'/0'/0'`;
  const rows = [];

  try {
    for (let offset = 0; offset < options.count; offset += 1) {
      const identityIndex = options.start + offset;
      const identityPath = `${profilePath}/${identityIndex}'`;
      rows.push({
        index: identityIndex,
        path: identityPath,
        title: `Identity candidate #${identityIndex}`,
        basic: [],
        advanced: [
          field('identityIndex', 'Identity index', String(identityIndex)),
          field('identityId', 'Identity ID', 'Not available until registration'),
          field('registrationProfile', 'Registration profile', DASH_IDENTITY_STANDARD_PROFILE_NAME),
          field('identityPathPrefix', 'Identity path prefix', identityPath),
          field('registrationState', 'Registration state', 'Candidate keys only · not registered'),
        ],
        groups: DASH_IDENTITY_STANDARD_KEYS.map((key) =>
          standardKeyGroup(root, options.network, key, identityIndex, network.wif)),
      });
    }

    return {
      id: 'dash-identity',
      title: 'Dash Platform Identity keys (DIP13)',
      networkLabel: `${network.label} Platform`,
      pathTemplate: `${profilePath}/identity_index'/key_id'`,
      basicSummary: [],
      summary: [],
      rows,
      notices: [
        `Each Identity candidate contains the ${DASH_IDENTITY_STANDARD_PROFILE_NAME} registration set. Key IDs do not cryptographically determine purpose or security level; those roles are assigned explicitly during registration.`,
        'These are candidate keys, not registered identities. An Identity ID depends on the registration funding input and cannot be derived from the recovery phrase alone.',
        'Public-key HASH160 values are discovery fingerprints, not payment addresses. The proof-verified Discovery Scanner can use the MASTER key hash to locate an already registered Identity.',
      ],
    };
  } finally {
    root.wipePrivateData();
  }
}

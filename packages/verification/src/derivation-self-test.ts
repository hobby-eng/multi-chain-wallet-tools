import { hexToBytes } from '@ckd/core/crypto.js';
import { deriveBitcoin } from '@ckd/coins/bitcoin/index.js';
import { deriveDashCore } from '@ckd/coins/dash/core.js';
import { deriveDashPlatform } from '@ckd/coins/dash/platform.js';
import { deriveDashIdentityAuthenticationKey } from '@ckd/coins/dash/identity.js';
import { deriveEthereum } from '@ckd/coins/ethereum/index.js';
import { rootFromSeed } from '@ckd/core/bip32.js';
import { bytesToHex, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import type { DerivationResult } from '@ckd/core/types.js';
import { clearDerivationResult } from '@ckd/core/secrets.js';
import { expectEqual, now, resultValue } from './helpers.js';
import type { CryptoSelfTestReport } from './types.js';

// Official BIP39 vector seed for "abandon ... about" with an empty passphrase.
// Keeping bytes here prevents the derivation worker from importing a second wordlist.
const FIXED_SEED_HEX =
  '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1' +
  '9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4';

/** Runs only inside the worker. It does not import BIP39 or user input. */
export async function runDerivationSelfTest(): Promise<CryptoSelfTestReport> {
  const started = now();
  const checks: string[] = [];
  const seed = hexToBytes(FIXED_SEED_HEX);
  try {
    const vectors: Array<readonly [string, DerivationResult, string]> = [
      ['Bitcoin Taproot / BIP86', deriveBitcoin('taproot', {
        seed: seed.slice(), network: 'mainnet', account: 0, branch: 0, start: 0, count: 1,
      }), 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'],
      ['Bitcoin testnet / BIP49', deriveBitcoin('nested-segwit', {
        seed: seed.slice(), network: 'testnet', account: 0, branch: 0, start: 0, count: 1,
      }), '2Mww8dCYPUpKHofjgcXcBCEGmniw9CoaiD2'],
      ['Bitcoin maximum child index', deriveBitcoin('legacy', {
        seed: seed.slice(), network: 'mainnet', account: 0, branch: 0, start: 2_147_483_647, count: 1,
      }), '12PyCxyiKLJc6WewJd173MRDVVdR6VpJ2j'],
      ['Ethereum / EIP55', deriveEthereum({
        seed: seed.slice(), network: 'mainnet', account: 0, branch: 0, start: 0, count: 1,
      }), '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'],
      ['Dash Core / BIP44', deriveDashCore({
        seed: seed.slice(), network: 'mainnet', account: 0, branch: 0, start: 0, count: 1,
      }), 'XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5'],
      ['Dash Core testnet / BIP44', deriveDashCore({
        seed: seed.slice(), network: 'testnet', account: 0, branch: 0, start: 0, count: 1,
      }), 'yRd4FhXfVGHXpsuZXPNkMrfD9GVj46pnjt'],
      ['Dash Platform / DIP17', deriveDashPlatform({
        seed: seed.slice(), network: 'mainnet', account: 0, branch: 0, start: 0, count: 1,
      }), 'dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs'],
      ['Dash Platform testnet / DIP17', deriveDashPlatform({
        seed: seed.slice(), network: 'testnet', account: 0, branch: 0, start: 0, count: 1,
      }), 'tdash1kzfj6fvrpza60u6m9u2nhzkthey68v7cqg2u9ymk'],
    ];
    for (const [name, result, expectedAddress] of vectors) {
      try {
        expectEqual(name, resultValue(result, 'address'), expectedAddress);
        checks.push(name);
      } finally {
        clearDerivationResult(result);
      }
    }

    const identityVectors = [
      {
        name: 'Dash Identity mainnet / DIP13',
        network: 'mainnet',
        path: "m/9'/5'/5'/0'/0'/0'/0'",
        privateKey: '5d6d4d9ef3092e2c63c5e7c436e3068efa58cbe4f32eb406ecbceecebf127f0f',
        publicKey: '03de6e4f0a455c1f089e51c53ed937b172d46e5cec4a98e2d9977ea4638129d252',
        publicKeyHash: 'd0559a724d640d22df8a04665308ffd0b7fe9b77',
      },
      {
        name: 'Dash Identity testnet / DIP13',
        network: 'testnet',
        path: "m/9'/1'/5'/0'/0'/0'/0'",
        privateKey: 'e560f452db267372375f218a22d57c0937070faffe66f0b7f908c21c8772ee3e',
        publicKey: '03a00f4853081aeb8c9debe37267303fa133bd7f6678bfb3299dfa001bfd0341db',
        publicKeyHash: '35891d57608f93cfe630e70bee9ae863f403f50f',
      },
    ] as const;
    for (const vector of identityVectors) {
      const network = getDashNetwork(vector.network);
      const root = rootFromSeed(seed, network.versions);
      const derived = deriveDashIdentityAuthenticationKey(root, vector.network, 0);
      try {
        expectEqual(`${vector.name} path`, derived.path, vector.path);
        expectEqual(`${vector.name} private key`, bytesToHex(derived.privateKey), vector.privateKey);
        expectEqual(`${vector.name} public key`, bytesToHex(derived.publicKey), vector.publicKey);
        expectEqual(`${vector.name} HASH160`, bytesToHex(derived.publicKeyHash), vector.publicKeyHash);
        checks.push(vector.name);
      } finally {
        wipe(derived.privateKey, derived.publicKey, derived.publicKeyHash);
        root.wipePrivateData();
      }
    }
  } finally {
    seed.fill(0);
  }

  // Address vectors alone cannot catch a regression in the extended-key path.
  // All adapters now share one root/account summary implementation; fixed
  // master, fingerprint, and account xpub values exercise that implementation
  // through Bitcoin, Dash Core, Dash Platform, and Ethereum before release.
  const extendedKeySeed = hexToBytes(FIXED_SEED_HEX);
  const extendedKeyResults = [
    {
      name: 'Bitcoin BIP86',
      result: deriveBitcoin('taproot', { seed: extendedKeySeed.slice(), network: 'mainnet', account: 0, branch: 0, start: 0, count: 1 }),
      accountXpub: 'xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ',
    },
    {
      name: 'Dash Core BIP44',
      result: deriveDashCore({ seed: extendedKeySeed.slice(), network: 'mainnet', account: 0, branch: 0, start: 0, count: 1 }),
      accountXpub: 'xpub6CYEjsU6zPM3sADS2ubu2aZeGxCm3C5KabkCpo4rkNbXGAH9M7rRUJ4E5CKiyUddmRzrSCopPzisTBrXkfCD4o577XKM9mzyZtP1Xdbizyk',
    },
    {
      name: 'Dash Platform DIP17',
      result: deriveDashPlatform({ seed: extendedKeySeed.slice(), network: 'mainnet', account: 0, branch: 0, start: 0, count: 1 }),
      accountXpub: 'xpub6FevKUTsHuMwZmumCETpZSSiK2bfW8gyb7kUAPs9Gep7SeskR2DPuaYoKo7vhLC99TMyfnUuyDjsWawjMvfbHvLLG6g9JLf1mjozFk9PUYz',
    },
    {
      name: 'Ethereum BIP44',
      result: deriveEthereum({ seed: extendedKeySeed.slice(), network: 'mainnet', account: 0, branch: 0, start: 0, count: 1 }),
      accountXpub: 'xpub6DCoCpSuQZB2jawqnGMEPS63ePKWkwWPH4TU45Q7LPXWuNd8TMtVxRrgjtEshuqpK3mdhaWHPFsBngh5GFZaM6si3yZdUsT8ddYM3PwnATt',
    },
  ];
  try {
    expectEqual(
      'BIP32 master extended key',
      resultValue(extendedKeyResults[0]!.result, 'masterXpub'),
      'xpub661MyMwAqRbcFkPHucMnrGNzDwb6teAX1RbKQmqtEF8kK3Z7LZ59qafCjB9eCRLiTVG3uxBxgKvRgbubRhqSKXnGGb1aoaqLrpMBDrVxga8',
    );
    expectEqual(
      'BIP32 master public key',
      resultValue(extendedKeyResults[0]!.result, 'masterPublicKey'),
      '03d902f35f560e0470c63313c7369168d9d7df2d49bf295fd9fb7cb109ccee0494',
    );
    expectEqual(
      'BIP32 master fingerprint',
      resultValue(extendedKeyResults[0]!.result, 'masterFingerprint'),
      '73c5da0a',
    );
    expectEqual(
      'BIP86 account extended key',
      resultValue(extendedKeyResults[0]!.result, 'accountXpub'),
      extendedKeyResults[0]!.accountXpub,
    );
    for (const vector of extendedKeyResults) {
      expectEqual(`${vector.name} master public key`, resultValue(vector.result, 'masterPublicKey'), '03d902f35f560e0470c63313c7369168d9d7df2d49bf295fd9fb7cb109ccee0494');
      expectEqual(`${vector.name} master fingerprint`, resultValue(vector.result, 'masterFingerprint'), '73c5da0a');
      expectEqual(`${vector.name} account extended key`, resultValue(vector.result, 'accountXpub'), vector.accountXpub);
    }
    checks.push('Master/account extended-key integrity');
  } finally {
    extendedKeySeed.fill(0);
    for (const vector of extendedKeyResults) clearDerivationResult(vector.result);
  }

  const shieldedSeed = new Uint8Array(64).fill(0x42);
  const { deriveDashShielded } = await import('@ckd/coins/dash/shielded.js');
  const shieldedVectors = [
    ['Dash Orchard testnet / ZIP32', 'testnet', 'tdash1zrhflqt5ly4r7q64wrktl6tf466x7h30vjkknaudxsckc3l28rp0qzzm27yta0683nnnd2qum8gyq'],
    ['Dash Orchard mainnet / ZIP32', 'mainnet', 'dash1zzx0rfu42k85qwywhx44023erxgcelv7xkqu3lr58t2t46arh392ch3ct0ke9qal6w57f2qlhxuxd'],
  ] as const;
  try {
    for (const [name, network, expectedAddress] of shieldedVectors) {
      const shielded = deriveDashShielded({
        seed: shieldedSeed.slice(), network, account: 0, start: 0, count: 1,
      });
      try {
        expectEqual(name, resultValue(shielded, 'address'), expectedAddress);
        checks.push(name);
      } finally {
        clearDerivationResult(shielded);
      }
    }
  } finally {
    shieldedSeed.fill(0);
  }

  return { passed: true, checks, durationMs: Math.round(now() - started) };
}

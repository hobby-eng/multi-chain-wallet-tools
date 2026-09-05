import { deriveDashCore } from '@ckd/coins/dash/core.js';
import {
  deriveDashIdentityAuthenticationKey,
} from '@ckd/coins/dash/identity.js';
import { deriveDashPlatform } from '@ckd/coins/dash/platform.js';
import { rootFromSeed } from '@ckd/core/bip32.js';
import { bytesToHex, hexToBytes, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { clearDerivationResult } from '@ckd/core/secrets.js';
import { expectEqual, now, resultValue } from './helpers.js';
import type { CryptoSelfTestReport } from './types.js';

const FIXED_SEED_HEX =
  '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1' +
  '9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4';

/** Dash-only worker vectors. This module has no non-Dash protocol imports. */
export async function runDashDerivationSelfTest(): Promise<CryptoSelfTestReport> {
  const started = now();
  const checks: string[] = [];
  const seed = hexToBytes(FIXED_SEED_HEX);
  const transparentResults = [
    {
      name: 'Dash Core / BIP44',
      result: deriveDashCore({
        seed: seed.slice(), network: 'mainnet', account: 0, branch: 0, start: 0, count: 1,
      }),
      address: 'XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5',
    },
    {
      name: 'Dash Core testnet / BIP44',
      result: deriveDashCore({
        seed: seed.slice(), network: 'testnet', account: 0, branch: 0, start: 0, count: 1,
      }),
      address: 'yRd4FhXfVGHXpsuZXPNkMrfD9GVj46pnjt',
    },
    {
      name: 'Dash Platform / DIP17',
      result: deriveDashPlatform({
        seed: seed.slice(), network: 'mainnet', account: 0, branch: 0, start: 0, count: 1,
      }),
      address: 'dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs',
    },
    {
      name: 'Dash Platform testnet / DIP17',
      result: deriveDashPlatform({
        seed: seed.slice(), network: 'testnet', account: 0, branch: 0, start: 0, count: 1,
      }),
      address: 'tdash1kzfj6fvrpza60u6m9u2nhzkthey68v7cqg2u9ymk',
    },
  ];
  try {
    for (const vector of transparentResults) {
      expectEqual(vector.name, resultValue(vector.result, 'address'), vector.address);
      checks.push(vector.name);
    }
    expectEqual(
      'Dash BIP32 master public key',
      resultValue(transparentResults[0]!.result, 'masterPublicKey'),
      '03d902f35f560e0470c63313c7369168d9d7df2d49bf295fd9fb7cb109ccee0494',
    );
    expectEqual(
      'Dash BIP32 master fingerprint',
      resultValue(transparentResults[0]!.result, 'masterFingerprint'),
      '73c5da0a',
    );
    expectEqual(
      'Dash Core account extended key',
      resultValue(transparentResults[0]!.result, 'accountXpub'),
      'xpub6CYEjsU6zPM3sADS2ubu2aZeGxCm3C5KabkCpo4rkNbXGAH9M7rRUJ4E5CKiyUddmRzrSCopPzisTBrXkfCD4o577XKM9mzyZtP1Xdbizyk',
    );
    checks.push('Dash master/account extended-key integrity');
  } finally {
    seed.fill(0);
    for (const vector of transparentResults) clearDerivationResult(vector.result);
  }

  const identitySeed = hexToBytes(FIXED_SEED_HEX);
  try {
    for (const vector of [
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
    ] as const) {
      const root = rootFromSeed(identitySeed, getDashNetwork(vector.network).versions);
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
    identitySeed.fill(0);
  }

  const shieldedSeed = new Uint8Array(64).fill(0x42);
  const { deriveDashShielded } = await import('@ckd/coins/dash/shielded.js');
  try {
    for (const [name, network, expectedAddress] of [
      ['Dash Orchard testnet / ZIP32', 'testnet', 'tdash1zrhflqt5ly4r7q64wrktl6tf466x7h30vjkknaudxsckc3l28rp0qzzm27yta0683nnnd2qum8gyq'],
      ['Dash Orchard mainnet / ZIP32', 'mainnet', 'dash1zzx0rfu42k85qwywhx44023erxgcelv7xkqu3lr58t2t46arh392ch3ct0ke9qal6w57f2qlhxuxd'],
    ] as const) {
      const result = deriveDashShielded({
        seed: shieldedSeed.slice(), network, account: 0, start: 0, count: 1,
      });
      try {
        expectEqual(name, resultValue(result, 'address'), expectedAddress);
        checks.push(name);
      } finally {
        clearDerivationResult(result);
      }
    }
  } finally {
    shieldedSeed.fill(0);
  }

  return { passed: true, checks, durationMs: Math.round(now() - started) };
}

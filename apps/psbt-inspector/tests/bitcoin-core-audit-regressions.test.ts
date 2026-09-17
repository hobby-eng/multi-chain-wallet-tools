import { describe, expect, it } from 'vitest';
import { bytesToHex, secp256k1 } from '@ckd/core/crypto.js';
import fixture from './upstream/bitcoin-core-audit-regressions.json';
import { decodeDescriptor } from '../src/descriptor.js';
import { buildConcreteMultisigWallet } from '../src/multisig-wallet.js';
import { parsePsbt } from '../src/psbt.js';
import { analyzeInputSigning, analyzeSighash } from '../src/signing-commitments.js';
import { HDKey } from '@scure/bip32';
import { materializeDescriptorKey } from '@ckd/core/descriptor-key.js';
import { buildPolicy } from '../src/policy.js';

describe('Bitcoin Core audit regressions', () => {
  it('preserves ranged Taproot recovery keys separately from the selected concrete output', () => {
    const expressions = [1, 2, 3].map(
      (value) => `${HDKey.fromMasterSeed(new Uint8Array(32).fill(value)).publicExtendedKey}/<0;1>/*`,
    );
    const descriptors = [0, 1].map((index) => {
      const keys = expressions.map((key) => materializeDescriptorKey(key, 'mainnet', 0, index));
      return buildPolicy({
        chain: 'bitcoin',
        network: 'mainnet',
        bitcoinWrapper: 'p2tr',
        mode: 'staged-recovery',
        required: 1,
        publicKeys: [keys[0]!],
        recoveryPublicKeys: [keys[1]!],
        emergencyPublicKeys: [keys[2]!],
        lockKind: 'relative-blocks',
        lockValue: 144,
        secondLockKind: 'relative-blocks',
        secondLockValue: 288,
        stagedDescriptorKeys: { primary: expressions[0]!, recovery: expressions[1]!, emergency: expressions[2]! },
      }).descriptor;
    });
    expect(descriptors[0]).toBe(descriptors[1]);
    expect(decodeDescriptor(descriptors[0]!).ranged).toBe(true);
    for (const key of expressions) expect(descriptors[0]).toContain(key);
  });
  for (const vector of fixture.taprootPkh) {
    it(`matches the official Taproot pkh leaf: ${vector.descriptor}`, () => {
      expect(decodeDescriptor(vector.descriptor).compiledOutput?.rows).toContainEqual({
        label: 'scriptPubKey',
        value: vector.script,
      });
    });
  }
  for (const descriptor of fixture.invalidDescriptors) {
    it(`rejects the official invalid descriptor ${descriptor}`, () => {
      expect(() => decodeDescriptor(descriptor)).toThrow();
    });
  }
  for (const vector of fixture.proprietary) {
    it(`checks the proprietary envelope ${vector.name}`, () => {
      if (vector.valid) expect(parsePsbt(vector.psbt, 'bitcoin')).toBeDefined();
      else expect(() => parsePsbt(vector.psbt, 'bitcoin')).toThrow();
    });
  }
  it('selects the signature protocol from the supplied UTXO rather than unrelated Taproot metadata', () => {
    const parsed = parsePsbt(fixture.legacyWithTaprootMetadata, 'bitcoin');
    expect(analyzeInputSigning(parsed, 0)).toMatchObject({ protocol: 'Legacy Script' });
  });
  it('treats height and time requirements on the same v2 input as alternatives, preferring height', () => {
    const parsed = parsePsbt(fixture.dualLocktime, 'bitcoin');
    expect(parsed.inputVerification[0]).toContainEqual(
      expect.objectContaining({
        relationship: 'PSBT v2 locktime requirements',
        status: 'verified',
      }),
    );
    expect(analyzeInputSigning(parsed, 0).locktime).toContain('800000');
  });
  it('does not claim transaction commitments for legacy SINGLE without a corresponding output', () => {
    expect(analyzeSighash(3, 'legacy', false)).toMatchObject({
      currentInput: 'Not committed · legacy bug returns the constant hash 1',
      otherInputs: 'Not committed · legacy bug returns the constant hash 1',
    });
  });
  for (const count of [17, 20]) {
    it(`supports ${count} compressed keys in P2WSH with a canonical script-number count`, () => {
      const keys = Array.from({ length: count }, (_, index) => {
        const secret = new Uint8Array(32);
        secret[31] = index + 1;
        return bytesToHex(secp256k1.getPublicKey(secret, true));
      });
      const wallet = buildConcreteMultisigWallet({
        chain: 'bitcoin',
        network: 'regtest',
        required: 2,
        publicKeys: keys,
        keyOrder: 'bip67',
        wrapper: 'p2wsh',
      });
      expect(wallet.redeemScript).toMatch(new RegExp(`01${count.toString(16)}ae$`, 'u'));
      expect(wallet.importText).toContain('bitcoin-cli -regtest');
    });
  }
});

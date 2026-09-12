import { describe, expect, it } from 'vitest';
import { NETWORK, p2sh, p2tr, p2wpkh } from '@scure/btc-signer';
import { secp256k1 } from '@ckd/core/crypto.js';
import { signBip322Message } from '../src/workers/bip322-signer.js';
import { verifyBip322Message } from '../../psbt-inspector/src/bip322-verifier.js';

const privateKey = Uint8Array.from([...new Uint8Array(31), 1]);
const publicKey = secp256k1.getPublicKey(privateKey, true);

describe('key derivation BIP-322 signer', () => {
  it('signs native SegWit simple messages', async () => {
    const payment = p2wpkh(publicKey, NETWORK);
    const signed = await signBip322Message(
      Buffer.from(privateKey).toString('hex'),
      payment.address,
      'native SegWit fixture',
      'mainnet',
      'native-segwit',
      Buffer.from(payment.script).toString('hex'),
    );
    expect(signed.format).toBe('BIP-322 simple');
    expect((await verifyBip322Message('native SegWit fixture', payment.address, signed.signature, 'mainnet')).valid).toBe(true);
  });

  it('signs nested SegWit full messages', async () => {
    const witness = p2wpkh(publicKey, NETWORK);
    const payment = p2sh(witness, NETWORK);
    const signed = await signBip322Message(
      Buffer.from(privateKey).toString('hex'),
      payment.address,
      'nested SegWit fixture',
      'mainnet',
      'nested-segwit',
      Buffer.from(payment.script).toString('hex'),
      Buffer.from(witness.script).toString('hex'),
    );
    expect(signed.format).toBe('BIP-322 full');
    expect((await verifyBip322Message('nested SegWit fixture', payment.address, signed.signature, 'mainnet')).valid).toBe(true);
  });

  it('signs Taproot key-path simple messages', async () => {
    const internalKey = publicKey.slice(1);
    const payment = p2tr(internalKey, undefined, NETWORK);
    const signed = await signBip322Message(
      Buffer.from(privateKey).toString('hex'),
      payment.address,
      'Taproot fixture',
      'mainnet',
      'taproot',
      Buffer.from(payment.script).toString('hex'),
      undefined,
      Buffer.from(internalKey).toString('hex'),
    );
    expect(signed.format).toBe('BIP-322 simple');
    expect((await verifyBip322Message('Taproot fixture', payment.address, signed.signature, 'mainnet')).valid).toBe(true);
  });
});

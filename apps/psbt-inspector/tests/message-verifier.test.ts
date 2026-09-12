import { describe, expect, it } from 'vitest';
import { encodeBase58Check, hash160, secp256k1, sha256 } from '@ckd/core/crypto.js';
import { signCompactP2pkhMessage } from '@ckd/core/compact-message.js';
import { verifySignedMessage } from '../src/message-verifier.js';

function concat(...values: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function dashFixture(message: string): { address: string; signature: string } {
  const secret = new Uint8Array(32);
  secret[31] = 1;
  const publicKey = secp256k1.getPublicKey(secret, true);
  const address = encodeBase58Check(concat(Uint8Array.of(0x4c), hash160(publicKey)));
  const encoder = new TextEncoder();
  const magic = encoder.encode('DarkCoin Signed Message:\n');
  const messageBytes = encoder.encode(message);
  const serialized = concat(Uint8Array.of(magic.length), magic, Uint8Array.of(messageBytes.length), messageBytes);
  const digest = sha256(sha256(serialized));
  const recovered = secp256k1.sign(digest, secret, { prehash: false, format: 'recovered' });
  const signature = concat(Uint8Array.of(31 + recovered[0]!), recovered.slice(1));
  return { address, signature: Buffer.from(signature).toString('base64') };
}

describe('signed message verifier', () => {
  it('uses Bitcoin testnet P2PKH prefixes for compact regtest proofs', async () => {
    const privateKey = new Uint8Array(32);
    privateKey[31] = 1;
    const address = encodeBase58Check(concat(Uint8Array.of(0x6f), hash160(secp256k1.getPublicKey(privateKey, true))));
    const message = 'Public regtest compact signature regression';
    const { signature } = signCompactP2pkhMessage(privateKey, address, message, 'bitcoin', 'testnet');
    expect((await verifySignedMessage(address, message, signature, 'bitcoin', 'regtest')).valid).toBe(true);
    expect((await verifySignedMessage(address, `${message}!`, signature, 'bitcoin', 'regtest')).valid).toBe(false);
    expect((await verifySignedMessage(address, message, signature, 'bitcoin', 'mainnet')).valid).toBe(false);
  });
  it('verifies official BIP-322 simple and full vectors', async () => {
    const simple = await verifySignedMessage(
      'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l',
      'Hello World',
      'smpAkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=',
      'bitcoin',
      'mainnet',
    );
    expect(simple).toMatchObject({ valid: true, format: 'BIP-322 simple' });

    const full = await verifySignedMessage(
      '13vU5PUSuArDXJdCWZvUFEbgJ2wcmtSJWn',
      'MOISC5NCQ42ADH2SUXLELUJOWH',
      'fulAgAAAAGn3Z6t/gsHNyHdgZTOVro0Hej+qbd/ilU1ACalKoHX3gAAAABqRzBEAiB+8t/tm8Jm6zYv9JGZZVlAUjmqg7ZglIA39U+bim8EKQIgDv3E5cHOagN+xYgN3ZQjTYlAJp/WyslwJWuFP1TmM3IBIQJcPK2h9SY+Ki1oussvHnMdFAhJgsYBFPl+rNcMv9P1ROAHAAABAAAAAAAAAAABauAHAAA=',
      'bitcoin',
      'mainnet',
    );
    expect(full).toMatchObject({ valid: true, format: 'BIP-322 full' });
  });

  it('verifies Dash Core compact P2PKH messages without exposing a signer', async () => {
    const message = 'Dash verifier fixture';
    const fixture = dashFixture(message);
    const result = await verifySignedMessage(fixture.address, message, fixture.signature, 'dash', 'mainnet');
    expect(result).toMatchObject({
      valid: true,
      format: 'Dash Core compact P2PKH · compressed key',
      recoveredAddress: fixture.address,
    });
  });
});

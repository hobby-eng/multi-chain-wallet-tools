import { createHmac } from 'node:crypto';
import { HDNodeWallet, SigningKey } from 'ethers';
import { describe, expect, it } from 'vitest';
import { rootFromSeed } from '../src/bip32.js';
import { mnemonicToSeed, entropyToEnglishMnemonic } from '../src/bip39.js';
import { deriveBip85Bip39, deriveBip85Hex } from '../src/bip85.js';
import { decryptBip38, encryptBip38 } from '../src/bip38.js';
import { signCompactP2pkhMessage } from '../src/compact-message.js';
import {
  AUDIT_MNEMONIC, digest, referenceBase58Check, referenceP2pkh, referenceSeed,
} from '@ckd/test-support/independent-audit-oracle.js';

const VERSIONS = { private: 0x0488ade4, public: 0x0488b21e };
const BIP85_ROOT = 'xprv9s21ZrQH143K2LBWUUQRFXhucrQqBpKdRRxNVq2zBqsx8HVqFk2uYo8kmbaLLHRdqtQpUm98uKfu3vca1LqdGhUtyoFnCNkfmXRyPXLjbKb';

describe('independent public-vector cryptographic audit', () => {
  // https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki#test-vector-3
  it.each([
    [
      '4b381541583be4423346c643850da4b320e46a87ae3d2a4e6da11eba819cd4acba45d239319ac14f863b8d5ab5a0d0c64d2e8a1e7d1457df2e5a3c51c73235be',
      "m/0'",
      'xprv9uPDJpEQgRQfDcW7BkF7eTya6RPxXeJCqCJGHuCJ4GiRVLzkTXBAJMu2qaMWPrS7AANYqdq6vcBcBUdJCVVFceUvJFjaPdGZ2y9WACViL4L',
      'xpub68NZiKmJWnxxS6aaHmn81bvJeTESw724CRDs6HbuccFQN9Ku14VQrADWgqbhhTHBaohPX4CjNLf9fq9MYo6oDaPPLPxSb7gwQN3ih19Zm4Y',
    ],
    [
      '3ddd5602285899a946114506157c7997e5444528f3003f6134712147db19b678',
      "m/0'/1'",
      'xprv9xJocDuwtYCMNAo3Zw76WENQeAS6WGXQ55RCy7tDJ8oALr4FWkuVoHJeHVAcAqiZLE7Je3vZJHxspZdFHfnBEjHqU5hG1Jaj32dVoS6XLT1',
      'xpub6BJA1jSqiukeaesWfxe6sNK9CCGaujFFSJLomWHprUL9DePQ4JDkM5d88n49sMGJxrhpjazuXYWdMf17C9T5XnxkopaeS7jGk1GyyVziaMt',
    ],
  ])('retains BIP32 leading zeros from seed %s', (seedHex, path, xprv, xpub) => {
    const root = rootFromSeed(Buffer.from(seedHex, 'hex'), VERSIONS);
    const child = root.derive(path);
    expect(child.privateExtendedKey).toBe(xprv);
    expect(child.publicExtendedKey).toBe(xpub);
    root.wipePrivateData();
    child.wipePrivateData();
  });

  it.each(['', 'TREZOR', 'é', 'e\u0301', ' public \u0000 🔑 '])('matches OpenSSL PBKDF2 for public passphrase %j', passphrase => {
    expect(Buffer.from(mnemonicToSeed(AUDIT_MNEMONIC, passphrase))).toEqual(referenceSeed(passphrase));
  });

  // https://github.com/bitcoin/bips/blob/master/bip-0085.mediawiki#18-english-words
  it.each([
    [18, '938033ed8b12698449d4bbca3c853c66b293ea1b1ce9d9dc',
      'near account window bike charge season chef number sketch tomorrow excuse sniff circle vital hockey outdoor supply token'],
    [24, 'ae131e2312cdc61331542efe0d1077bac5ea803adf24b313a4f0e48e9c51f37f',
      'puppy ocean match cereal symbol another shed magic wrap hammer bulb intact gadget divorce twin tonight reason outdoor destroy simple truth cigar social volcano'],
  ] as const)('matches official BIP85 %i-word vector', (words, entropy, mnemonic) => {
    const result = deriveBip85Bip39(BIP85_ROOT, words, 0);
    expect(result.entropyHex).toBe(entropy);
    expect(entropyToEnglishMnemonic(Buffer.from(entropy, 'hex'))).toBe(mnemonic);
  });

  it('separates parent passphrase, BIP85 index and child passphrase with independent HMAC/PBKDF2', () => {
    for (const parentPassphrase of ['', 'public parent']) {
      const seed = referenceSeed(parentPassphrase);
      for (const index of [0, 7, 2147483647]) {
        const path = `m/83696968'/39'/0'/12'/${index}'`;
        const key = HDNodeWallet.fromSeed(seed).derivePath(path).privateKey;
        const entropy = createHmac('sha512', 'bip-entropy-from-k').update(Buffer.from(key.slice(2), 'hex')).digest().subarray(0, 16);
        const actual = deriveBip85Bip39(seed, 12, index);
        expect(actual.entropyHex).toBe(entropy.toString('hex'));
        const child = entropyToEnglishMnemonic(entropy);
        expect(Buffer.from(mnemonicToSeed(child, 'public child'))).toEqual(referenceSeed('public child', child));
        expect(mnemonicToSeed(child, 'public child')).not.toEqual(mnemonicToSeed(child, parentPassphrase));
      }
    }
  });

  it.each([16, 32, 64])('matches independent BIP85 hex HMAC at %i bytes', bytes => {
    const seed = referenceSeed('public parent');
    const key = HDNodeWallet.fromSeed(seed).derivePath(`m/83696968'/128169'/${bytes}'/17'`).privateKey;
    const expected = createHmac('sha512', 'bip-entropy-from-k').update(Buffer.from(key.slice(2), 'hex')).digest().subarray(0, bytes).toString('hex');
    expect(deriveBip85Hex(seed, bytes, 17).entropyHex).toBe(expected);
  });

  // https://github.com/bitcoin/bips/blob/master/bip-0038.mediawiki#no-compression-no-ec-multiply
  it('matches official BIP38 uncompressed encryption without using decrypt as its oracle', async () => {
    const key = Buffer.from('cbf4b9f70470856bb4f40f80b87edb90865997ffee6df315ab166d713af433a5', 'hex');
    const result = await encryptBip38(key, false, 'TestingOneTwoThree', { p2pkh: 0 });
    expect(result.encryptedKey).toBe('6PRVWUbkzzsbcVac2qwfssoUJAN1Xhrg6bNk8J7Nzm5H7kxEbn2Nh2ZoGg');
    expect(result.address).toBe(referenceP2pkh(SigningKey.computePublicKey(key, false).slice(2)));
  }, 30_000);

  it('matches official BIP38 NFC, embedded NUL and astral-Unicode vector', async () => {
    const result = await decryptBip38('6PRW5o9FLp4gJDDVqJQKJFTpMvdsSGJxMYHtHaQBF3ooa8mwD69bapcDQn',
      '\u03d2\u0301\u0000\u{10400}\u{1f4a9}', { p2pkh: 0 });
    expect(result.compressed).toBe(false);
    expect(result.address).toBe('16ktGzmfrurhbhi6JGqsMWf7TyqK9HNAeF');
    expect(referenceBase58Check(Buffer.concat([Buffer.from([0x80]), result.privateKey])))
      .toBe('5Jajm8eQ22H3pGWLEVCXyvND8dQZhiQhoLJNKjYXk9roUFTMSZ4');
    result.privateKey.fill(0);
  }, 30_000);

  it.each(['bitcoin', 'dash'] as const)('matches external ECDSA signing and byte-length framing for %s', chain => {
    const key = Buffer.from('01'.padStart(64, '0'), 'hex');
    const signer = new SigningKey(key);
    const address = referenceP2pkh(signer.compressedPublicKey.slice(2), chain === 'bitcoin' ? 0 : 76);
    for (const message of ['é🔑', 'a'.repeat(252), 'a'.repeat(253), 'a'.repeat(65535), 'a'.repeat(65536)]) {
      const payload = Buffer.from(message);
      const size = payload.length < 253 ? Buffer.from([payload.length])
        : payload.length <= 65535 ? Buffer.from([253, payload.length & 255, payload.length >>> 8])
        : Buffer.from([254, payload.length & 255, (payload.length >>> 8) & 255, (payload.length >>> 16) & 255, payload.length >>> 24]);
      const magic = Buffer.from(chain === 'bitcoin' ? 'Bitcoin Signed Message:\n' : 'DarkCoin Signed Message:\n');
      const hash = digest('sha256', digest('sha256', Buffer.concat([Buffer.from([magic.length]), magic, size, payload])));
      const signature = signer.sign(hash);
      const expected = Buffer.concat([Buffer.from([31 + signature.yParity]), Buffer.from(signature.r.slice(2) + signature.s.slice(2), 'hex')]).toString('base64');
      expect(signCompactP2pkhMessage(key, address, message, chain, 'mainnet').signature).toBe(expected);
    }
  });
});

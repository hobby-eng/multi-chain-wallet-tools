import { HDKey } from '@scure/bip32';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { assertValidMnemonic, generateMnemonic, mnemonicToSeed } from '../src/bip39.js';

describe('BIP39', () => {
  it('matches the official first English vector including its passphrase', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    expect(assertValidMnemonic(`  ${mnemonic.toUpperCase()}  `)).toBe(mnemonic);
    expect(bytesToHex(mnemonicToSeed(mnemonic, 'TREZOR'))).toBe(
      'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e5349553' +
      '1f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04',
    );
  });

  it('rejects bad length and bad checksums', () => {
    expect(() => assertValidMnemonic('abandon abandon')).toThrow(/12, 15, 18, 21, or 24/u);
    expect(() => assertValidMnemonic('abandon '.repeat(12))).toThrow(/checksum/u);
  });

  it('generates checksum-valid 12- and 24-word phrases with the secure browser API', () => {
    expect(assertValidMnemonic(generateMnemonic(12)).split(' ')).toHaveLength(12);
    expect(assertValidMnemonic(generateMnemonic(24)).split(' ')).toHaveLength(24);
  });
});

describe('BIP32', () => {
  it('matches official vector 1 at the root and m/0\'', () => {
    const root = HDKey.fromMasterSeed(hexToBytes('000102030405060708090a0b0c0d0e0f'));
    expect(root.privateExtendedKey).toBe(
      'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi',
    );
    expect(root.publicExtendedKey).toBe(
      'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8',
    );
    const child = root.derive("m/0'");
    expect(child.privateExtendedKey).toBe(
      'xprv9uHRZZhk6KAJC1avXpDAp4MDc3sQKNxDiPvvkX8Br5ngLNv1TxvUxt4cV1rGL5hj6KCesnDYUhd7oWgT11eZG7XnxHrnYeSvkzY7d2bhkJ7',
    );
    expect(child.publicExtendedKey).toBe(
      'xpub68Gmy5EdvgibQVfPdqkBBCHxA5htiqg55crXYuXoQRKfDBFA1WEjWgP6LHhwBZeNK1VTsfTFUHCdrfp1bgwQ9xv5ski8PX9rL2dZXvgGDnw',
    );
    const nonHardened = child.deriveChild(1);
    expect(nonHardened.privateExtendedKey).toBe(
      'xprv9wTYmMFdV23N2TdNG573QoEsfRrWKQgWeibmLntzniatZvR9BmLnvSxqu53Kw1UmYPxLgboyZQaXwTCg8MSY3H2EU4pWcQDnRnrVA1xe8fs',
    );
    expect(nonHardened.publicExtendedKey).toBe(
      'xpub6ASuArnXKPbfEwhqN6e3mwBcDTgzisQN1wXN9BJcM47sSikHjJf3UFHKkNAWbWMiGj7Wf5uMash7SyYq527Hqck2AxYysAA7xmALppuCkwQ',
    );
  });
});

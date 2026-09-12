import { describe, expect, it } from 'vitest';
import {
  deriveBip85Bip39,
  deriveBip85Hex,
  deriveBip85Wif,
  deriveBip85Xprv,
} from '../src/bip85.js';
import { entropyToEnglishMnemonic } from '../src/bip39.js';
import { hexToBytes } from '../src/crypto.js';

const ROOT = 'xprv9s21ZrQH143K2LBWUUQRFXhucrQqBpKdRRxNVq2zBqsx8HVqFk2uYo8kmbaLLHRdqtQpUm98uKfu3vca1LqdGhUtyoFnCNkfmXRyPXLjbKb';

describe('BIP85 official application vectors', () => {
  it('derives the English 12-word application', () => {
    const result = deriveBip85Bip39(ROOT, 12, 0);
    expect(result).toEqual({
      path: "m/83696968'/39'/0'/12'/0'",
      entropyHex: '6250b68daf746d12a24d58b4787a714b',
    });
    expect(entropyToEnglishMnemonic(hexToBytes(result.entropyHex)))
      .toBe('girl mad pet galaxy egg matter matrix prison refuse sense ordinary nose');
  });

  it('derives the WIF application', () => {
    expect(deriveBip85Wif(ROOT, 0)).toEqual({
      path: "m/83696968'/2'/0'",
      wif: 'Kzyv4uF39d4Jrw2W7UryTHwZr1zQVNk4dAFyqE6BuMrMh1Za7uhp',
    });
  });

  it('derives the XPRV application', () => {
    expect(deriveBip85Xprv(ROOT, 0)).toEqual({
      path: "m/83696968'/32'/0'",
      xprv: 'xprv9s21ZrQH143K2srSbCSg4m4kLvPMzcWydgmKEnMmoZUurYuBuYG46c6P71UGXMzmriLzCCBvKQWBUv3vPB3m1SATMhp3uEjXHJ42jFg7myX',
    });
  });

  it('derives the 64-byte hexadecimal application', () => {
    expect(deriveBip85Hex(ROOT, 64, 0)).toEqual({
      path: "m/83696968'/128169'/64'/0'",
      entropyHex: '492db4698cf3b73a5a24998aa3e9d7fa96275d85724a91e71aa2d645442f878555d078fd1f1f67e368976f04137b1f7a0d19232136ca50c44614af72b5582a5c',
    });
  });
});

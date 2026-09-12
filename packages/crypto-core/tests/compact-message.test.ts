import { describe, expect, it } from 'vitest';
import { encodeP2pkh, hash160, secp256k1 } from '../src/crypto.js';
import { signCompactP2pkhMessage, verifyCompactP2pkhMessage } from '../src/compact-message.js';
import { signDashCompactP2pkhMessage } from '../src/compact-message-dash.js';

function fixture(chain: 'bitcoin' | 'dash', network: 'mainnet' | 'testnet') {
  const privateKey = new Uint8Array(32);
  privateKey[31] = 1;
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const prefix = chain === 'bitcoin'
    ? (network === 'mainnet' ? 0x00 : 0x6f)
    : (network === 'mainnet' ? 0x4c : 0x8c);
  return { privateKey, address: encodeP2pkh(hash160(publicKey), prefix) };
}

describe('compact signed messages', () => {
  for (const [chain, network] of [
    ['bitcoin', 'mainnet'],
    ['bitcoin', 'testnet'],
    ['dash', 'mainnet'],
    ['dash', 'testnet'],
  ] as const) {
    it(`signs and verifies ${chain} ${network} P2PKH`, () => {
      const { privateKey, address } = fixture(chain, network);
      const signed = signCompactP2pkhMessage(privateKey, address, 'offline message fixture', chain, network);
      expect(signed.verified).toBe(true);
      expect(verifyCompactP2pkhMessage(address, 'offline message fixture', signed.signature, chain, network)).toBe(true);
      expect(verifyCompactP2pkhMessage(address, 'different message', signed.signature, chain, network)).toBe(false);
    });
  }

  for (const network of ['mainnet', 'testnet'] as const) {
    it(`keeps the Dash-only signer compatible on ${network}`, () => {
      const { privateKey, address } = fixture('dash', network);
      const signed = signDashCompactP2pkhMessage(privateKey, address, 'offline message fixture', network);
      const shared = signCompactP2pkhMessage(privateKey, address, 'offline message fixture', 'dash', network);
      expect(signed).toEqual(shared);
    });
  }
});

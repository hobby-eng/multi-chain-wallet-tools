import { describe, expect, it } from 'vitest';
import { findDashArtifactViolations } from './verify-dash-community-artifacts.mjs';

describe('Dash Community artifact exclusion rules', () => {
  it('rejects non-Dash registrations, protocol copy, and branding', () => {
    expect(findDashArtifactViolations(
      'bitcoin-taproot Ethereum EOA · BIP44 Multi-Chain Wallet Tools BIP86',
    )).toEqual(expect.arrayContaining([
      'Bitcoin',
      'Bitcoin adapter registration',
      'Ethereum',
      'non-Dash protocol copy',
      'Multi-Chain branding',
    ]));
  });

  it('permits only the protocol-defined BIP32 HMAC domain string', () => {
    expect(findDashArtifactViolations(
      'Uint8Array.from("Bitcoin seed".split("")) Uint8Array.from(`Bitcoin seed`.split(""))',
    )).toEqual([]);
    expect(findDashArtifactViolations('Visible Bitcoin wallet option')).toContain('Bitcoin');
  });

  it('rejects unknown adapter registrations without a chain-specific denylist', () => {
    expect(findDashArtifactViolations(
      'var adapters=[{id:"solana",group:"Solana",label:"Wallet"}]',
    )).toContain('non-Dash derivation adapter registration: solana');
    expect(findDashArtifactViolations(
      String.raw`var worker="[{id:\"future-coin\",group:\"Future Coin\",label:\"Wallet\"}]"`,
    )).toContain('non-Dash derivation adapter registration: future-coin');
    expect(findDashArtifactViolations(
      'var recovery={id:"cardano",label:"Cardano",networks:["mainnet"]}',
    )).toContain('non-Dash recovery adapter registration: cardano');
  });

  it('accepts only the explicit Dash adapter registrations', () => {
    expect(findDashArtifactViolations(
      'var adapters=[{id:"dash-core",group:"Dash"},{id:"dash-platform",group:"Dash"},'
      + '{id:"dash-identity",group:"Dash"},{id:"dash-shielded",group:"Dash"}];'
      + 'var recovery={id:"dash",label:"Dash",networks:["mainnet","testnet"]}',
    )).toEqual([]);
  });
});

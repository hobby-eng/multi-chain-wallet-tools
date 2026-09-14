import { describe, expect, it } from 'vitest';
import { hexToBytes } from '@ckd/core/crypto.js';
import { describeOpReturn, describePreviousScriptSig } from '../src/transaction-display.js';

const P2PKH_SCRIPT_SIG = '47304402204fe4fc488c955f286c52c848ec7950b40ec476e1b434c6add686b474bdde09a902206222d291fd9da341408aa8a4720f5a6959997715a1ddf8187e75277b6bfcae7e012103c67d86944315838aea7ec80d390b5d09b91b62483370d4979da5ccf7a7df77a9';

describe.each(['bitcoin', 'dash'] as const)('%s transaction display details', (chain) => {
  it('labels a standard previous P2PKH signature without treating it as the current PSBT signature', () => {
    const result = describePreviousScriptSig(P2PKH_SCRIPT_SIG, chain, 'mainnet');
    expect(result.signature).toBe('304402204fe4fc488c955f286c52c848ec7950b40ec476e1b434c6add686b474bdde09a902206222d291fd9da341408aa8a4720f5a6959997715a1ddf8187e75277b6bfcae7e01');
    expect(result.signatureHash).toBe('SIGHASH_ALL');
    expect(result.publicKey).toBe('03c67d86944315838aea7ec80d390b5d09b91b62483370d4979da5ccf7a7df77a9');
    expect(result.raw).toBe(P2PKH_SCRIPT_SIG);
  });

  it('decodes a single-push OP_RETURN payload', () => {
    expect(describeOpReturn(hexToBytes('6a0400010203'), chain, 'mainnet')).toEqual({
      payloadHex: '00010203', payloadSize: 4, pushCount: 1,
    });
  });

  it('concatenates multiple OP_RETURN pushes while preserving the push count', () => {
    expect(describeOpReturn(hexToBytes('6a020001020203'), chain, 'mainnet')).toEqual({
      payloadHex: '00010203', payloadSize: 4, pushCount: 2,
    });
  });
});

it('does not enrich a non-OP_RETURN output', () => {
  expect(describeOpReturn(hexToBytes('76a914000000000000000000000000000000000000000088ac'), 'bitcoin', 'mainnet')).toBeNull();
});

it('keeps malformed previous scriptSig data visible instead of failing inspection', () => {
  const result = describePreviousScriptSig('4c05aa', 'bitcoin', 'mainnet');
  expect(result.signature).toBeNull();
  expect(result.raw).toBe('4c05aa');
  expect(result.asm).toMatch(/^Unable to decode scriptSig:/u);
});

import { describe, expect, it } from 'vitest';
import { parsePsbt } from '../src/psbt.js';
import { analyzeInputSigning, analyzeSighash } from '../src/signing-commitments.js';

const BITCOIN_WITNESS_PREVIOUS_TX_PSBT =
  'cHNidP8BAHUCAAAAAQZB8bKqHgj6j1e86DcczS5N9qCOeeHVqdHmTRgvmaSEAAAAAAD+////AtPf9QUAAAAAGXapFNDFmQPFusKGh2DpD9UhpGZap2UgiKwA4fUFAAAAABepFDVF5uM7gyxHBQ8k0+65PJwDlIvHh7MuEwAAAQB8AQAAAAABARERERERERERERERERERERERERERERERERERERERERERAQAAAAD/////AgDC6wsAAAAAGXapFNDFmQPFusKGh2DpD9UhpGZap2UgiKxy/vhOLAAAABepFDVF5uM7gyxHBQ8k0+65PJwDlIvHhwIBAQECAAAAAAAAAA==';
const DASH_PREVIOUS_TX_PSBT =
  'cHNidP8BAHUCAAAAAQZB8bKqHgj6j1e86DcczS5N9qCOeeHVqdHmTRgvmaSEAAAAAAD+////AtPf9QUAAAAAGXapFNDFmQPFusKGh2DpD9UhpGZap2UgiKwA4fUFAAAAABepFDVF5uM7gyxHBQ8k0+65PJwDlIvHh7MuEwAAAQB1AQAAAAEREREREREREREREREREREREREREREREREREREREREREQEAAAAA/////wIAwusLAAAAABl2qRTQxZkDxbrChodg6Q/VIaRmWqdlIIiscv74TiwAAAAXqRQ1RebjO4MsRwUPJNPuuTycA5SLx4cAAAAAAAAA';

describe('human-readable signing commitments', () => {
  it('explains standard SIGHASH_ALL commitments without overstating legacy amount coverage', () => {
    expect(analyzeSighash(0x01, 'legacy')).toMatchObject({
      label: 'SIGHASH_ALL',
      unusual: false,
      currentInput: 'Committed',
      otherInputs: 'Committed',
      otherInputSequences: 'Committed',
      outputs: 'All outputs and their amounts are committed',
      currentInputAmount: 'Not committed by legacy sighash',
    });
  });

  it('flags ANYONECANPAY|SINGLE and states exactly what remains mutable', () => {
    expect(analyzeSighash(0x83, 'segwit-v0')).toMatchObject({
      label: 'SIGHASH_SINGLE | ANYONECANPAY',
      unusual: true,
      otherInputs: 'Not committed · inputs may be added or removed',
      otherInputSequences: 'Not committed',
      outputs: 'Only the output with the same index is committed',
      currentInputAmount: 'Committed',
    });
  });

  it('maps Taproot SIGHASH_DEFAULT to all-output commitments and rejects DEFAULT|ANYONECANPAY', () => {
    expect(analyzeSighash(0x00, 'taproot')).toMatchObject({
      label: 'SIGHASH_DEFAULT',
      unusual: false,
      outputs: 'All outputs and their amounts are committed',
    });
    expect(analyzeSighash(0x80, 'taproot')).toMatchObject({ known: false, unusual: true });
  });

  it('makes the missing SIGHASH_SINGLE output edge case explicit', () => {
    expect(analyzeSighash(0x03, 'legacy', false)).toMatchObject({
      unusual: true,
      outputs: 'No corresponding output · legacy SIGHASH_SINGLE returns the constant hash 1',
    });
    expect(analyzeSighash(0x03, 'taproot', false)).toMatchObject({
      unusual: true,
      outputs: 'Invalid · SIGHASH_SINGLE has no corresponding output',
    });
  });

  it('does not invent SIGHASH_ALL when an unsigned PSBT omits the field', () => {
    const bitcoin = analyzeInputSigning(parsePsbt(BITCOIN_WITNESS_PREVIOUS_TX_PSBT, 'bitcoin'), 0);
    expect(bitcoin).toMatchObject({
      signature: 'No signature or final-script fields supplied',
      sighash: { label: 'Not specified · signer decides according to wallet policy', known: false },
      rbf: 'Not signaled',
      locktime: 'Block height 1257139',
      relativeLocktime: 'None',
    });
    const dash = analyzeInputSigning(parsePsbt(DASH_PREVIOUS_TX_PSBT, 'dash'), 0);
    expect(dash.rbf).toBe('Not supported by Dash Core');
    expect(dash.locktime).toBe('Block height 1257139');
  });
});

import { describe, expect, it } from 'vitest';
import { concatBytes } from '@ckd/core/crypto.js';
import { decodeText, MAX_PSBT_BYTES } from '../src/psbt-binary.js';
import { readTransaction, parsedTransactionId } from '../src/transaction.js';
import { transactionId } from '../src/psbt.js';

function compactSize(value: number): Uint8Array {
  if (value < 0xfd) return Uint8Array.of(value);
  return Uint8Array.of(0xfd, value & 0xff, value >>> 8);
}

function witnessTransaction(inputCount: number, flag = 1, populatedWitness = true) {
  const inputs = Array.from({ length: inputCount }, (_, index) => {
    const input = new Uint8Array(41);
    new DataView(input.buffer).setUint32(0, index, true);
    input.fill(0xff, 37);
    return input;
  });
  const version = Uint8Array.of(2, 0, 0, 0);
  const inputBytes = concatBytes(compactSize(inputCount), ...inputs);
  const outputs = Uint8Array.of(1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0x51);
  const lockTime = new Uint8Array(4);
  const witnesses = concatBytes(
    ...Array.from({ length: inputCount }, () => (populatedWitness ? Uint8Array.of(1, 1, 1) : Uint8Array.of(0))),
  );
  return {
    witness: concatBytes(version, Uint8Array.of(0, flag), inputBytes, outputs, witnesses, lockTime),
    legacy: concatBytes(version, inputBytes, outputs, lockTime),
  };
}

describe('transaction parser limits and witness framing', () => {
  it('calculates a txid for a large witness transaction without expanding bytes into function arguments', () => {
    const { witness, legacy } = witnessTransaction(4_000);
    expect(parsedTransactionId(readTransaction(witness, 'bitcoin'))).toBe(transactionId(legacy));
  });

  it('rejects unknown witness flags and superfluous empty witness records', () => {
    expect(() => readTransaction(witnessTransaction(1, 2).witness, 'bitcoin')).toThrow(/unsupported witness flags/u);
    expect(() => readTransaction(witnessTransaction(1, 1, false).witness, 'bitcoin')).toThrow(/superfluous/u);
  });

  it('enforces the decoded 16 MiB ceiling for Base64 input', () => {
    const oversized = Buffer.alloc(MAX_PSBT_BYTES + 1).toString('base64');
    expect(() => decodeText(oversized)).toThrow(/16 MiB/u);
  });
});

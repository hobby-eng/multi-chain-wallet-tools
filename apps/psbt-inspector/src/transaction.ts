import { bytesToHex, concatBytes, sha256 } from '@ckd/core/crypto.js';
import { Reader, reverseHex } from './psbt-binary.js';

type TransactionChain = 'bitcoin' | 'dash';

export interface TransactionInput {
  readonly txid: string;
  readonly vout: number;
  readonly scriptSig: string;
  readonly sequence: number;
}

export interface TransactionOutput {
  readonly value: bigint;
  readonly script: Uint8Array;
}

export interface ParsedTransaction {
  readonly raw: Uint8Array;
  readonly version: number;
  readonly dashType: number | null;
  readonly hasWitness: boolean;
  readonly inputs: readonly TransactionInput[];
  readonly outputs: readonly TransactionOutput[];
  readonly lockTime: number;
  readonly extraPayload: Uint8Array | null;
}

export function readTransaction(bytes: Uint8Array, chain: TransactionChain, allowWitness = true): ParsedTransaction {
  const reader = new Reader(bytes);
  let version: number;
  let dashType: number | null = null;
  if (chain === 'dash') {
    version = reader.u16();
    dashType = reader.u16();
  } else {
    version = reader.u32();
  }
  let hasWitness = false;
  if (
    allowWitness &&
    chain === 'bitcoin' &&
    reader.peek() === 0 &&
    reader.peek(1) !== undefined &&
    reader.peek(1) !== 0
  ) {
    reader.read(1);
    const flags = reader.u8();
    if ((flags & 1) === 0 || (flags & ~1) !== 0) {
      throw new Error('Bitcoin transaction contains unsupported witness flags.');
    }
    hasWitness = true;
  }
  const inputCount = reader.compactNumber('transaction input count');
  const inputs: TransactionInput[] = [];
  for (let index = 0; index < inputCount; index += 1) {
    inputs.push({
      txid: reverseHex(reader.read(32)),
      vout: reader.u32(),
      scriptSig: bytesToHex(reader.varBytes('scriptSig length', 100_000)),
      sequence: reader.u32(),
    });
  }
  const outputCount = reader.compactNumber('transaction output count');
  const outputs: TransactionOutput[] = [];
  for (let index = 0; index < outputCount; index += 1) {
    outputs.push({ value: reader.u64(), script: reader.varBytes('scriptPubKey length', 100_000) });
  }
  if (hasWitness) {
    let hasWitnessData = false;
    for (let inputIndex = 0; inputIndex < inputCount; inputIndex += 1) {
      const itemCount = reader.compactNumber('witness item count');
      if (itemCount > 0) hasWitnessData = true;
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) reader.varBytes('witness item length', 4_000_000);
    }
    if (!hasWitnessData) throw new Error('Bitcoin transaction contains a superfluous empty witness record.');
  }
  const lockTime = reader.u32();
  let extraPayload: Uint8Array | null = null;
  // Dash PSBT serializes the typed DIP-2 payload directly, while an on-wire
  // previous transaction prefixes it with a CompactSize length. The inspector
  // preserves and exposes the remaining payload bytes without pretending the
  // two encodings are interchangeable.
  if (chain === 'dash' && dashType !== 0) extraPayload = reader.read(reader.remaining);
  if (reader.remaining !== 0) throw new Error('Unsigned transaction contains unsupported or trailing data.');
  return { raw: bytes.slice(), version, dashType, hasWitness, inputs, outputs, lockTime, extraPayload };
}

export function readTxOut(value: Uint8Array): TransactionOutput {
  const reader = new Reader(value);
  const output = { value: reader.u64(), script: reader.varBytes('witness UTXO script length', 100_000) };
  if (reader.remaining !== 0) throw new Error('Witness UTXO contains trailing data.');
  return output;
}

export function parsedTransactionId(transaction: ParsedTransaction): string {
  let serialized = transaction.raw;
  if (transaction.hasWitness) {
    const reader = new Reader(serialized);
    reader.read(6);
    const start = reader.offset;
    for (let n = reader.compactNumber('input count'); n > 0; n -= 1) {
      reader.read(36);
      reader.varBytes('scriptSig');
      reader.read(4);
    }
    for (let n = reader.compactNumber('output count'); n > 0; n -= 1) {
      reader.read(8);
      reader.varBytes('scriptPubKey');
    }
    const end = reader.offset;
    for (const _input of transaction.inputs) {
      for (let n = reader.compactNumber('witness count'); n > 0; n -= 1) reader.varBytes('witness');
    }
    serialized = concatBytes(serialized.slice(0, 4), serialized.slice(start, end), reader.read(4));
  }
  return reverseHex(sha256(sha256(serialized)));
}

import { ripemd160 } from '@noble/hashes/legacy.js';
import { bech32, bech32m } from '@scure/base';
import { aggregateMusigParticipants } from './musig-psbt.js';
import { bytesToHex, encodeBase58Check, hash160, secp256k1, sha256 } from '@ckd/core/crypto.js';
import { CONSENSUS_LIMITS } from './consensus-limits.js';

export type PsbtChain = 'bitcoin' | 'dash';
export type PsbtNetwork = 'mainnet' | 'testnet' | 'regtest';

export interface PsbtPair {
  readonly type: bigint;
  readonly keyData: Uint8Array;
  readonly value: Uint8Array;
}

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

export type VerificationStatus = 'verified' | 'failed' | 'not-verified' | 'not-applicable';

export interface PsbtVerificationCheck {
  readonly relationship: string;
  readonly status: VerificationStatus;
  readonly detail: string;
}

export interface ParsedPsbt {
  readonly chain: PsbtChain;
  readonly version: number;
  readonly global: readonly PsbtPair[];
  readonly inputs: readonly (readonly PsbtPair[])[];
  readonly outputs: readonly (readonly PsbtPair[])[];
  readonly transaction: ParsedTransaction | null;
  readonly inputValues: readonly (bigint | null)[];
  readonly outputValues: readonly bigint[];
  readonly fee: bigint | null;
  readonly globalVerification: readonly PsbtVerificationCheck[];
  readonly inputVerification: readonly (readonly PsbtVerificationCheck[])[];
}

const MAX_COLLECTION_SIZE = 10_000;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

class Reader {
  offset = 0;

  constructor(readonly bytes: Uint8Array) {}

  get remaining(): number { return this.bytes.length - this.offset; }

  peek(relative = 0): number | undefined { return this.bytes[this.offset + relative]; }

  read(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining) {
      throw new Error('Unexpected end of PSBT data.');
    }
    const result = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  u8(): number { return this.read(1)[0] ?? 0; }

  u16(): number {
    const value = this.read(2);
    return (value[0] ?? 0) | ((value[1] ?? 0) << 8);
  }

  u32(): number {
    const value = this.read(4);
    return ((value[0] ?? 0) | ((value[1] ?? 0) << 8) | ((value[2] ?? 0) << 16) | ((value[3] ?? 0) << 24)) >>> 0;
  }

  u64(): bigint {
    const value = this.read(8);
    let result = 0n;
    for (let index = 7; index >= 0; index -= 1) result = (result << 8n) | BigInt(value[index] ?? 0);
    return result;
  }

  compact(): bigint {
    const prefix = this.u8();
    if (prefix < 0xfd) return BigInt(prefix);
    if (prefix === 0xfd) {
      const value = BigInt(this.u16());
      if (value < 0xfdn) throw new Error('Non-minimal CompactSize integer.');
      return value;
    }
    if (prefix === 0xfe) {
      const value = BigInt(this.u32());
      if (value <= 0xffffn) throw new Error('Non-minimal CompactSize integer.');
      return value;
    }
    const value = this.u64();
    if (value <= 0xffffffffn) throw new Error('Non-minimal CompactSize integer.');
    return value;
  }

  compactNumber(label: string, maximum = MAX_COLLECTION_SIZE): number {
    const value = this.compact();
    if (value > MAX_SAFE_BIGINT || value > BigInt(maximum)) throw new Error(`${label} is unreasonably large.`);
    return Number(value);
  }

  varBytes(label: string, maximum = this.remaining): Uint8Array {
    return this.read(this.compactNumber(label, maximum));
  }
}

function reverseHex(bytes: Uint8Array): string {
  return bytesToHex(bytes.slice().reverse());
}

function decodeText(value: string): Uint8Array {
  const normalized = value.trim().replaceAll(/\s+/gu, '');
  if (normalized.length > 32_000_000) throw new Error('PSBT input exceeds the 16 MiB decoded size ceiling.');
  if (normalized.length === 0) throw new Error('Paste a PSBT as Base64 or hexadecimal bytes.');
  if (/^[0-9a-f]+$/iu.test(normalized) && normalized.length % 2 === 0) {
    const bytes = new Uint8Array(normalized.length / 2);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
    return bytes;
  }
  try {
    const decoded = atob(normalized);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('The input is neither valid Base64 nor hexadecimal data.');
  }
}

function decodeType(key: Uint8Array): { type: bigint; keyData: Uint8Array } {
  const reader = new Reader(key);
  const type = reader.compact();
  return { type, keyData: reader.read(reader.remaining) };
}

function readMap(reader: Reader): PsbtPair[] {
  const pairs: PsbtPair[] = [];
  const keys = new Set<string>();
  while (true) {
    const keyLength = reader.compactNumber('PSBT key length', reader.remaining);
    if (keyLength === 0) return pairs;
    const rawKey = reader.read(keyLength);
    const keyHex = bytesToHex(rawKey);
    if (keys.has(keyHex)) throw new Error(`Duplicate PSBT key ${keyHex}.`);
    keys.add(keyHex);
    const { type, keyData } = decodeType(rawKey);
    const value = reader.varBytes('PSBT value length', reader.remaining);
    if (pairs.length >= MAX_COLLECTION_SIZE) throw new Error('Too many PSBT map entries.');
    pairs.push({ type, keyData, value });
  }
}

function pair(map: readonly PsbtPair[], type: number): PsbtPair | undefined {
  return map.find((item) => item.type === BigInt(type) && item.keyData.length === 0);
}

function littleU32(value: Uint8Array, label: string): number {
  if (value.length !== 4) throw new Error(`${label} must contain four bytes.`);
  return new Reader(value).u32();
}

function compactValue(value: Uint8Array, label: string): number {
  const reader = new Reader(value);
  const result = reader.compactNumber(label);
  if (reader.remaining !== 0) throw new Error(`${label} contains trailing data.`);
  return result;
}

function readTransaction(bytes: Uint8Array, chain: PsbtChain, allowWitness = true): ParsedTransaction {
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
  if (allowWitness && chain === 'bitcoin' && reader.peek() === 0 && reader.peek(1) !== undefined && reader.peek(1) !== 0) {
    reader.read(2);
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
    for (let inputIndex = 0; inputIndex < inputCount; inputIndex += 1) {
      const itemCount = reader.compactNumber('witness item count');
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) reader.varBytes('witness item length', 4_000_000);
    }
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

function readTxOut(value: Uint8Array): TransactionOutput {
  const reader = new Reader(value);
  const output = { value: reader.u64(), script: reader.varBytes('witness UTXO script length', 100_000) };
  if (reader.remaining !== 0) throw new Error('Witness UTXO contains trailing data.');
  return output;
}

function previousTxid(transaction: ParsedTransaction): string {
  let serialized = transaction.raw;
  if (transaction.hasWitness) {
    const reader = new Reader(serialized);
    reader.read(6);
    const start = reader.offset;
    for (let n = reader.compactNumber('input count'); n > 0; n -= 1) {
      reader.read(36); reader.varBytes('scriptSig'); reader.read(4);
    }
    for (let n = reader.compactNumber('output count'); n > 0; n -= 1) {
      reader.read(8); reader.varBytes('scriptPubKey');
    }
    const end = reader.offset;
    for (const _input of transaction.inputs) {
      for (let n = reader.compactNumber('witness count'); n > 0; n -= 1) reader.varBytes('witness');
    }
    serialized = Uint8Array.of(...serialized.slice(0, 4), ...serialized.slice(start, end), ...reader.read(4));
  }
  return reverseHex(sha256(sha256(serialized)));
}

interface SuppliedUtxo {
  readonly value: bigint;
  readonly script: Uint8Array;
  readonly binding: 'non-witness' | 'witness-only';
}

function inputUtxo(map: readonly PsbtPair[], txInput: TransactionInput | undefined, chain: PsbtChain): SuppliedUtxo | null {
  const witnessPair = pair(map, 0x01);
  const witness = chain === 'bitcoin' && witnessPair !== undefined ? readTxOut(witnessPair.value) : undefined;
  const previous = pair(map, 0x00);
  const outputIndexPair = pair(map, 0x0f);
  const outputIndex = txInput?.vout ?? (outputIndexPair === undefined ? undefined : littleU32(outputIndexPair.value, 'PSBT v2 previous output index'));
  if (previous === undefined) return witness === undefined ? null : { ...witness, binding: 'witness-only' };
  const transaction = readTransaction(previous.value, chain);
  const id = txInput?.txid ?? (pair(map, 0x0e) === undefined ? undefined : reverseHex(pair(map, 0x0e)!.value));
  if (id === undefined || previousTxid(transaction) !== id) throw new Error('Non-witness UTXO transaction ID does not match the referenced input.');
  const output = outputIndex === undefined ? undefined : transaction.outputs[outputIndex];
  if (output === undefined) throw new Error('Referenced output is absent from the non-witness UTXO.');
  if (witness !== undefined && (witness.value !== output.value || bytesToHex(witness.script) !== bytesToHex(output.script))) {
    throw new Error('Witness and non-witness UTXOs disagree.');
  }
  return { ...output, binding: 'non-witness' };
}

function maximumMoney(chain: PsbtChain): bigint {
  return chain === 'dash' ? CONSENSUS_LIMITS.maximumDashMoney : CONSENSUS_LIMITS.maximumBitcoinMoney;
}

function validateMoney(value: bigint, chain: PsbtChain, label: string): void {
  if (value > maximumMoney(chain)) throw new Error(`${label} exceeds ${chain === 'dash' ? 'Dash' : 'Bitcoin'} MAX_MONEY.`);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function p2shCommitment(script: Uint8Array): Uint8Array {
  return Uint8Array.of(0xa9, 0x14, ...hash160(script), 0x87);
}

function p2wshCommitment(script: Uint8Array): Uint8Array {
  return Uint8Array.of(0x00, 0x20, ...sha256(script));
}

function scriptCommitmentFailure(map: readonly PsbtPair[], utxo: SuppliedUtxo | null): string | null {
  const redeem = pair(map, 0x04)?.value;
  const witness = pair(map, 0x05)?.value;
  if (redeem !== undefined && utxo !== null && !equalBytes(utxo.script, p2shCommitment(redeem))) {
    return 'redeemScript HASH160 does not match the supplied UTXO scriptPubKey.';
  }
  if (witness !== undefined) {
    const commitment = p2wshCommitment(witness);
    if (redeem !== undefined && !equalBytes(redeem, commitment)) {
      return 'witnessScript SHA256 does not match the supplied P2SH redeem-script witness program.';
    }
    if (redeem === undefined && utxo !== null && !equalBytes(utxo.script, commitment)) {
      return 'witnessScript SHA256 does not match the supplied UTXO witness program.';
    }
  }
  return null;
}

function validatePoint(bytes: Uint8Array, xOnly = false): void {
  if (xOnly && bytes.length !== 32) throw new Error('Taproot public key must contain 32 bytes.');
  if (!xOnly && bytes.length !== 33 && bytes.length !== 65) throw new Error('Invalid PSBT public key length.');
  try { secp256k1.Point.fromBytes(xOnly ? Uint8Array.of(2, ...bytes) : bytes); }
  catch { throw new Error('Invalid PSBT public key point.'); }
}
function derivationValue(value: Uint8Array, taproot = false): void {
  const reader = new Reader(value);
  if (taproot) reader.read(reader.compactNumber('Tapleaf hashes') * 32);
  if (reader.remaining < 4 || reader.remaining % 4 !== 0) throw new Error('Invalid BIP32 fingerprint/path length.');
  if ((reader.remaining - 4) / 4 > CONSENSUS_LIMITS.maximumBip32Depth) throw new Error('BIP32 key-origin path exceeds the 255-level depth limit.');
}
function validateDerSignature(value: Uint8Array): void {
  // PSBT_IN_PARTIAL_SIG includes the one-byte sighash type after a strict-DER ECDSA signature.
  if (value.length < 9 || value.length > 73) throw new Error('PSBT partial signature must contain a strict-DER ECDSA signature and one sighash byte.');
  const der = value.subarray(0, -1);
  if (der[0] !== 0x30 || der[1] !== der.length - 2 || der[2] !== 0x02) throw new Error('PSBT partial signature is not strict DER.');
  const rLength = der[3] ?? 0;
  const sTag = 4 + rLength;
  const sLength = der[sTag + 1] ?? 0;
  if (rLength === 0 || sTag + 2 > der.length || der[sTag] !== 0x02 || sLength === 0 || sTag + 2 + sLength !== der.length) {
    throw new Error('PSBT partial signature is not strict DER.');
  }
  const rStart = 4;
  const sStart = sTag + 2;
  if ((der[rStart]! & 0x80) !== 0 || (rLength > 1 && der[rStart] === 0 && (der[rStart + 1]! & 0x80) === 0)) throw new Error('PSBT partial signature has a non-canonical R integer.');
  if ((der[sStart]! & 0x80) !== 0 || (sLength > 1 && der[sStart] === 0 && (der[sStart + 1]! & 0x80) === 0)) throw new Error('PSBT partial signature has a non-canonical S integer.');
}

function validateMap(map: readonly PsbtPair[], scope: 'global' | 'input' | 'output'): void {
  const singleton = scope === 'global' ? [0, 2, 3, 4, 5, 6, 251]
    : scope === 'input' ? [0, 1, 3, 4, 5, 7, 8, 9, 14, 15, 16, 17, 18, 19, 23, 24]
      : [0, 1, 3, 4, 5, 6];
  for (const field of map) {
    const { keyData: key, value } = field;
    const type = Number(field.type);
    const size = (n: number): void => { if (value.length !== n) throw new Error(`Invalid ${scope} field ${type} value length.`); };
    if (singleton.includes(type) && key.length !== 0) throw new Error(`Invalid ${scope} field ${type} key data.`);
    if (scope === 'global') {
      if ([2, 3, 251].includes(type)) size(4);
      if (type === 6) size(1);
      if (type === 4 || type === 5) compactValue(value, 'PSBT count');
      if (type === 1) {
        if (key.length !== 78) throw new Error('PSBT global xpub must contain 78 bytes.');
        validateCompressedPublicKey(key.slice(45), 'PSBT global xpub');
        derivationValue(value);
        if ((value.length - 4) / 4 !== key[4]) throw new Error('Global xpub depth disagrees with its origin.');
      }
      continue;
    }
    const input = scope === 'input';
    if (input && type >= 10 && type <= 13) {
      const digest = type === 10 ? ripemd160(value) : type === 11 ? sha256(value) : type === 12 ? hash160(value) : sha256(sha256(value));
      if (key.length !== digest.length) throw new Error('Invalid PSBT preimage hash key length.');
      if (bytesToHex(key) !== bytesToHex(digest)) throw new Error('PSBT preimage does not match its hash commitment.');
    }
    if ((input && [2, 6].includes(type)) || (!input && type === 2)) {
      validatePoint(key);
      if (input && type === 2) validateDerSignature(value);
      if (type === 6 || !input) derivationValue(value);
    }
    if (input && [3, 15, 16, 17, 18].includes(type)) size(4);
    if (input && [14, 24].includes(type)) size(32);
    if (input && type === 1) readTxOut(value);
    if (input && type === 8) {
      const reader = new Reader(value);
      for (let n = reader.compactNumber('final witness count'); n > 0; n -= 1) reader.varBytes('final witness element');
      if (reader.remaining !== 0) throw new Error('Final witness contains trailing bytes.');
    }
    if (!input && type === 3) size(8);
    if ((input && type === 23) || (!input && type === 5)) { size(32); validatePoint(value, true); }
    if ((input && type === 22) || (!input && type === 7)) { validatePoint(key, true); derivationValue(value, true); }
    if (input && (type === 19 || type === 20)) {
      if (type === 20) { if (key.length !== 64) throw new Error('Taproot script signature key must contain 64 bytes.'); validatePoint(key.slice(0, 32), true); }
      if (value.length !== 64 && value.length !== 65) throw new Error('Taproot signature must contain 64 or 65 bytes.');
      if (value.length === 65 && ![1, 2, 3, 129, 130, 131].includes(value[64]!)) throw new Error('Invalid explicit Taproot sighash byte.');
    }
    if (input && type === 21) {
      if (key.length < 33 || key.length > 33 + CONSENSUS_LIMITS.maximumTaprootTreeDepth * 32 || (key.length - 33) % 32 !== 0) throw new Error('Invalid Taproot control block length.');
      validatePoint(key.slice(1, 33), true);
      if (value.length === 0 || value[value.length - 1] !== (key[0]! & 0xfe)) throw new Error('Tapleaf version disagrees with the control block.');
    }
    if (!input && type === 6) {
      const reader = new Reader(value); const depths: number[] = [];
      while (reader.remaining > 0) {
        const depth = reader.read(1)[0]!; const version = reader.read(1)[0]!;
        if (depth > CONSENSUS_LIMITS.maximumTaprootTreeDepth || (version & 1) !== 0) throw new Error('Invalid Taproot tree depth or leaf version.');
        reader.varBytes('Taproot leaf script'); depths.push(depth);
        while (depths.length > 1 && depths.at(-1) === depths.at(-2)) {
          const current = depths.pop()!; depths.pop();
          if (current === 0) throw new Error('Taproot tree contains extra roots.');
          depths.push(current - 1);
        }
      }
      if (depths.length !== 1 || depths[0] !== 0) throw new Error('Incomplete Taproot tree.');
    }
  }
}
function validateVersionFields(global: readonly PsbtPair[], inputs: readonly (readonly PsbtPair[])[], outputs: readonly (readonly PsbtPair[])[], version: number): boolean {
  if (version === 0) {
    for (const [maps, types] of [[[global], [2n, 3n, 4n, 5n, 6n]], [inputs, [14n, 15n, 16n, 17n, 18n]], [outputs, [3n, 4n]]] as const) {
      if (maps.some(map => map.some(field => types.some(type => field.type === type)))) throw new Error('PSBT v0 contains a PSBT v2-only field.');
    }
    return false;
  }
  if (pair(global, 2) === undefined) throw new Error('PSBT v2 is missing its transaction version.');
  let requiresTime = false;
  let requiresHeight = false;
  for (const map of inputs) {
    if (pair(map, 14) === undefined || pair(map, 15) === undefined) throw new Error('PSBT v2 input is missing its previous transaction ID or output index.');
    const time = pair(map, 17); const height = pair(map, 18);
    if (time !== undefined) {
      if (littleU32(time.value, 'time lock') < CONSENSUS_LIMITS.absoluteLockTimeThreshold) throw new Error('Required time lock is below 500000000.');
      requiresTime = true;
    }
    if (height !== undefined) {
      const value = littleU32(height.value, 'height lock');
      if (value === 0 || value >= CONSENSUS_LIMITS.absoluteLockTimeThreshold) throw new Error('Required height lock is outside 1..499999999.');
      requiresHeight = true;
    }
  }
  const mixedLockKinds = requiresTime && requiresHeight;
  if (outputs.some(map => pair(map, 3) === undefined || pair(map, 4) === undefined)) throw new Error('PSBT v2 output is missing its amount or script.');
  return mixedLockKinds;
}

function validateCompressedPublicKey(value: Uint8Array, label: string): void {
  if (value.length !== 33 || (value[0] !== 0x02 && value[0] !== 0x03)) throw new Error(`${label} must be a 33-byte compressed public key.`);
  try { secp256k1.Point.fromBytes(value); } catch { throw new Error(`${label} is not a valid secp256k1 point.`); }
}

function validateMusigReferenceKey(keyData: Uint8Array, label: string): void {
  if (keyData.length !== 66 && keyData.length !== 98) {
    throw new Error(`${label} key data must contain participant and aggregate public keys, plus an optional 32-byte Tapleaf hash.`);
  }
  validateCompressedPublicKey(keyData.slice(0, 33), `${label} participant`);
  validateCompressedPublicKey(keyData.slice(33, 66), `${label} aggregate`);
}

export function validateMusigPsbtFields(map: readonly PsbtPair[], scope: 'input' | 'output'): void {
  const participantsByAggregate = new Map<string, Set<string>>();
  for (const item of map) {
    if ((scope === 'input' && item.type === 0x1an) || (scope === 'output' && item.type === 0x08n)) {
      validateCompressedPublicKey(item.keyData, `PSBT ${scope} MuSig2 aggregate key`);
      if (item.value.length === 0 || item.value.length % 33 !== 0) {
        throw new Error(`PSBT ${scope} MuSig2 participant list must contain one or more 33-byte compressed public keys.`);
      }
      const participants: Uint8Array[] = [];
      for (let offset = 0; offset < item.value.length; offset += 33) {
        const participant = item.value.slice(offset, offset + 33);
        validateCompressedPublicKey(participant, `PSBT ${scope} MuSig2 participant ${offset / 33 + 1}`);
        participants.push(participant);
      }
      const computed = aggregateMusigParticipants(participants);
      if (!equalBytes(computed, item.keyData)) throw new Error(`PSBT ${scope} MuSig2 aggregate key does not match KeyAgg(participants).`);
      participantsByAggregate.set(bytesToHex(item.keyData), new Set(participants.map(bytesToHex)));
    } else if (scope === 'input' && item.type === 0x1bn) {
      validateMusigReferenceKey(item.keyData, 'PSBT input MuSig2 public nonce');
      if (item.value.length !== 66) throw new Error('PSBT input MuSig2 public nonce value must contain exactly 66 bytes.');
      validateCompressedPublicKey(item.value.slice(0, 33), 'MuSig2 nonce R1');
      validateCompressedPublicKey(item.value.slice(33), 'MuSig2 nonce R2');
    } else if (scope === 'input' && item.type === 0x1cn) {
      validateMusigReferenceKey(item.keyData, 'PSBT input MuSig2 partial signature');
      if (item.value.length !== 32) throw new Error('PSBT input MuSig2 partial signature value must contain exactly 32 bytes.');
      if (BigInt(`0x${bytesToHex(item.value)}`) >= secp256k1.Point.Fn.ORDER) throw new Error('MuSig2 partial signature scalar is out of range.');
    }
  }
  if (scope === 'input') {
    for (const item of map) {
      if (item.type !== 0x1bn && item.type !== 0x1cn) continue;
      const participant = bytesToHex(item.keyData.slice(0, 33));
      const aggregate = bytesToHex(item.keyData.slice(33, 66));
      const known = participantsByAggregate.get(aggregate);
      if (known !== undefined && !known.has(participant)) {
        throw new Error(`PSBT input MuSig2 ${item.type === 0x1bn ? 'public nonce' : 'partial signature'} participant is absent from the aggregate participant list.`);
      }
    }
  }
}

function inputVerification(map: readonly PsbtPair[], utxo: SuppliedUtxo | null, chain: PsbtChain, commitmentFailure: string | null, mixedLockKinds: boolean): readonly PsbtVerificationCheck[] {
  const checks: PsbtVerificationCheck[] = [{ relationship: 'PSBT framing and field schema', status: 'verified', detail: 'Canonical lengths, unique keys, known field encodings and amount ranges passed.' }];
  checks.push(utxo === null
    ? { relationship: 'UTXO binding', status: 'not-verified', detail: 'No UTXO record was supplied for this input.' }
    : utxo.binding === 'non-witness'
      ? { relationship: 'UTXO binding', status: 'verified', detail: 'The previous transaction ID and selected output were checked.' }
      : { relationship: 'UTXO binding', status: 'not-verified', detail: 'A witness UTXO was supplied, but this offline file cannot prove it matches the referenced blockchain output.' });
  const hasScripts = pair(map, 0x04) !== undefined || pair(map, 0x05) !== undefined;
  checks.push(commitmentFailure !== null
    ? { relationship: 'Redeem/witness script commitments', status: 'failed', detail: commitmentFailure }
    : !hasScripts
      ? { relationship: 'Redeem/witness script commitments', status: 'not-applicable', detail: 'No redeemScript or witnessScript metadata was supplied.' }
      : utxo === null
        ? { relationship: 'Redeem/witness script commitments', status: 'not-verified', detail: 'Script metadata is present, but no supplied UTXO scriptPubKey anchors it.' }
        : { relationship: 'Redeem/witness script commitments', status: 'verified', detail: 'HASH160/SHA256 commitments were matched to the supplied UTXO and nested witness program.' });
  const preimages = map.filter(({ type }) => type >= 10n && type <= 13n).length;
  checks.push(preimages === 0
    ? { relationship: 'Hash preimages', status: 'not-applicable', detail: 'No hash-preimage fields were supplied.' }
    : { relationship: 'Hash preimages', status: 'verified', detail: `${preimages} supplied preimage commitment(s) matched.` });
  if (chain === 'bitcoin') {
    const participantFields = map.filter(({ type }) => type === 0x1an).length;
    const referenceFields = map.filter(({ type }) => type === 0x1bn || type === 0x1cn).length;
    checks.push(participantFields > 0
      ? { relationship: 'MuSig2 participant aggregation', status: 'verified', detail: `${participantFields} participant list(s) matched BIP327 KeyAgg; linked nonce/signature participants were checked where lists were supplied.` }
      : referenceFields > 0
        ? { relationship: 'MuSig2 participant aggregation', status: 'not-verified', detail: 'Nonce or partial-signature metadata is present without a participant list for independent KeyAgg membership checks.' }
        : { relationship: 'MuSig2 participant aggregation', status: 'not-applicable', detail: 'No MuSig2 fields were supplied.' });
  }
  const taprootInternal = pair(map, 0x17)?.value;
  const taprootLeaves = map.filter(({ type }) => type === 0x15n);
  const mismatchedControl = taprootInternal !== undefined && taprootLeaves.some(({ keyData }) => !equalBytes(taprootInternal, keyData.slice(1, 33)));
  checks.push(mismatchedControl
    ? { relationship: 'Taproot control-block internal key', status: 'failed', detail: 'A tapleaf control block contains a different internal key than PSBT_IN_TAP_INTERNAL_KEY.' }
    : taprootLeaves.length === 0
      ? { relationship: 'Taproot control-block internal key', status: 'not-applicable', detail: 'No Taproot leaf/control-block metadata was supplied.' }
      : taprootInternal === undefined
        ? { relationship: 'Taproot control-block internal key', status: 'not-verified', detail: 'Taproot leaves are present without PSBT_IN_TAP_INTERNAL_KEY for comparison.' }
        : { relationship: 'Taproot control-block internal key', status: 'verified', detail: `${taprootLeaves.length} control block(s) match PSBT_IN_TAP_INTERNAL_KEY.` });
  const signatures = map.filter(({ type }) => [2n, 19n, 20n, 28n].includes(type)).length;
  checks.push(signatures === 0
    ? { relationship: 'Cryptographic signatures', status: 'not-applicable', detail: 'No signature fields were supplied.' }
    : { relationship: 'Cryptographic signatures', status: 'not-verified', detail: `${signatures} signature field(s) are structurally valid; this inspector does not calculate sighashes or verify signatures.` });
  if (mixedLockKinds) checks.push({ relationship: 'PSBT v2 locktime requirements', status: 'failed', detail: 'The PSBT contains both height-based and time-based requirements; one transaction nLockTime cannot satisfy both kinds.' });
  else if (pair(map, 17) !== undefined || pair(map, 18) !== undefined) checks.push({ relationship: 'PSBT v2 locktime requirements', status: 'verified', detail: 'Required locktime values use one compatible unit.' });
  else checks.push({ relationship: 'PSBT v2 locktime requirements', status: 'not-applicable', detail: 'No required locktime field was supplied.' });
  return checks;
}

export function parsePsbt(text: string, chain: PsbtChain): ParsedPsbt {
  const reader = new Reader(decodeText(text));
  const magic = reader.read(5);
  if (bytesToHex(magic) !== '70736274ff') throw new Error('Missing PSBT magic bytes 70736274ff.');
  const global = readMap(reader);
  validateMap(global, 'global');
  const versionPair = pair(global, 0xfb);
  const version = versionPair === undefined ? 0 : littleU32(versionPair.value, 'PSBT version');
  if (version !== 0 && version !== 2) throw new Error(`Unsupported PSBT version ${version}.`);
  if (chain === 'dash' && version !== 0) throw new Error('Dash Core interoperability is currently limited to PSBT version 0.');

  const unsignedPair = pair(global, 0x00);
  let transaction: ParsedTransaction | null = null;
  let inputCount: number;
  let outputCount: number;
  if (version === 0) {
    if (unsignedPair === undefined) throw new Error('PSBT v0 is missing its global unsigned transaction.');
    transaction = readTransaction(unsignedPair.value, chain, false);
    if (transaction.hasWitness) throw new Error('A PSBT v0 global unsigned transaction must use legacy serialization without witness data.');
    if (transaction.inputs.some(({ scriptSig }) => scriptSig.length !== 0)) {
      throw new Error('A PSBT v0 global unsigned transaction must have an empty scriptSig for every input.');
    }
    inputCount = transaction.inputs.length;
    outputCount = transaction.outputs.length;
  } else {
    if (unsignedPair !== undefined) throw new Error('PSBT v2 must not contain a global unsigned transaction.');
    const inputCountPair = pair(global, 0x04);
    const outputCountPair = pair(global, 0x05);
    if (inputCountPair === undefined || outputCountPair === undefined) throw new Error('PSBT v2 is missing its input or output count.');
    inputCount = compactValue(inputCountPair.value, 'PSBT input count');
    outputCount = compactValue(outputCountPair.value, 'PSBT output count');
  }
  const inputs = Array.from({ length: inputCount }, () => readMap(reader));
  const outputs = Array.from({ length: outputCount }, () => readMap(reader));
  if (reader.remaining !== 0) throw new Error('PSBT contains trailing data after its maps.');
  if (chain === 'bitcoin') {
    inputs.forEach((map) => validateMusigPsbtFields(map, 'input'));
    outputs.forEach((map) => validateMusigPsbtFields(map, 'output'));
  }

  for (const map of inputs) validateMap(map, 'input');
  for (const map of outputs) validateMap(map, 'output');
  const mixedLockKinds = validateVersionFields(global, inputs, outputs, version);
  const suppliedUtxos = inputs.map((map, index) => inputUtxo(map, transaction?.inputs[index], chain));
  const commitmentFailures = suppliedUtxos.map((utxo, index) => {
    if (utxo !== null) validateMoney(utxo.value, chain, `Input ${index} value`);
    return scriptCommitmentFailure(inputs[index]!, utxo);
  });
  const inputValues = suppliedUtxos.map((utxo) => utxo?.value ?? null);
  const outputValues = transaction === null
    ? outputs.map((map) => {
        const amount = pair(map, 0x03);
        if (amount === undefined || amount.value.length !== 8) throw new Error('PSBT v2 output is missing a valid amount.');
        return new Reader(amount.value).u64();
      })
    : transaction.outputs.map((output) => output.value);
  outputValues.forEach((value, index) => validateMoney(value, chain, `Output ${index} value`));
  const outputTotal = outputValues.reduce((total, value) => total + value, 0n);
  validateMoney(outputTotal, chain, 'Transaction output total');
  const knownInputs = inputs.length > 0 && inputValues.every((value): value is bigint => value !== null);
  const fee = knownInputs
    ? inputValues.reduce((total, value) => total + value, 0n) - outputValues.reduce((total, value) => total + value, 0n)
    : null;
  if (fee !== null && fee < 0n) throw new Error('PSBT outputs exceed the supplied input values.');
  const modifiable = pair(global, 0x06)?.value[0];
  const globalVerification: PsbtVerificationCheck[] = [modifiable !== undefined && (modifiable & 0xf8) !== 0
    ? { relationship: 'PSBT transaction-modifiable flags', status: 'not-verified', detail: `Undefined flag bits 0x${(modifiable & 0xf8).toString(16).padStart(2, '0')} are preserved but have no defined BIP370 meaning.` }
    : { relationship: 'PSBT transaction-modifiable flags', status: 'verified', detail: 'All supplied transaction-modifiable bits have defined BIP370 meanings.' }];
  const inputVerificationRows = inputs.map((map, index) => inputVerification(map, suppliedUtxos[index] ?? null, chain, commitmentFailures[index] ?? null, mixedLockKinds));
  return { chain, version, global, inputs, outputs, transaction, inputValues, outputValues, fee, globalVerification, inputVerification: inputVerificationRows };
}

export function pairName(scope: 'global' | 'input' | 'output', type: bigint, chain: PsbtChain = 'bitcoin'): string {
  const names: Record<string, Record<string, string>> = {
    global: { '0': 'Unsigned transaction', '1': 'Extended public key', '2': 'Transaction version (v2)', '3': 'Fallback locktime (v2)', '4': 'Input count (v2)', '5': 'Output count (v2)', '6': 'Transaction modifiable flags (v2)', '251': 'PSBT version', '252': 'Proprietary' },
    input: { '0': 'Non-witness UTXO', '1': 'Witness UTXO', '2': 'Partial signature', '3': 'Sighash type', '4': 'Redeem script', '5': 'Witness script', '6': 'BIP32 derivation', '7': 'Final scriptSig', '8': 'Final script witness', '10': 'RIPEMD160 preimage', '11': 'SHA256 preimage', '12': 'HASH160 preimage', '13': 'HASH256 preimage', '14': 'Previous txid (v2)', '15': 'Output index (v2)', '16': 'Sequence (v2)', '19': 'Taproot key signature', '20': 'Taproot script signature', '21': 'Taproot leaf script', '22': 'Taproot BIP32 derivation', '23': 'Taproot internal key', '24': 'Taproot Merkle root', '26': 'MuSig2 participant public keys', '27': 'MuSig2 public nonce', '28': 'MuSig2 partial signature', '252': 'Proprietary' },
    output: { '0': 'Redeem script', '1': 'Witness script', '2': 'BIP32 derivation', '3': 'Amount (v2)', '4': 'Script (v2)', '5': 'Taproot internal key', '6': 'Taproot tree', '7': 'Taproot BIP32 derivation', '8': 'MuSig2 participant public keys', '252': 'Proprietary' },
  };
  if (chain === 'dash' && (
    (scope === 'global' && [2n, 3n, 4n, 5n, 6n].includes(type))
    || (scope === 'input' && [1n, 5n, 8n, 14n, 15n, 16n, 19n, 20n, 21n, 22n, 23n, 24n, 26n, 27n, 28n].includes(type))
    || (scope === 'output' && [1n, 3n, 4n, 5n, 6n, 7n, 8n].includes(type))
  )) {
    return `Unknown/unsupported Dash field ${type}`;
  }
  return names[scope]?.[type.toString()] ?? `Unknown type ${type}`;
}

export function pairSummary(scope: 'global' | 'input' | 'output', pair: PsbtPair, chain: PsbtChain = 'bitcoin'): string | null {
  const classicDerivation = (scope === 'global' && pair.type === 0x01n)
    || (scope === 'input' && pair.type === 0x06n)
    || (scope === 'output' && pair.type === 0x02n);
  if (classicDerivation) return derivationSummary(pair.value, 0);
  const taprootDerivation = (scope === 'input' && pair.type === 0x16n)
    || (scope === 'output' && pair.type === 0x07n);
  if (taprootDerivation && pair.value.length > 0) {
    const leafHashCount = pair.value[0]!;
    if (leafHashCount >= 0xfd) return 'Taproot key origin uses an extended CompactSize leaf-hash count; inspect the raw value.';
    return derivationSummary(pair.value, 1 + leafHashCount * 32);
  }
  if (chain === 'dash') return null;
  if ((scope === 'input' && pair.type === 0x1an) || (scope === 'output' && pair.type === 0x08n)) {
    return `${pair.value.length / 33} compressed participant public key(s) for aggregate key ${bytesToHex(pair.keyData)}`;
  }
  if (scope === 'input' && (pair.type === 0x1bn || pair.type === 0x1cn)) {
    return `${pair.keyData.length === 98 ? 'Tapleaf-scoped' : 'key-path'} MuSig2 ${pair.type === 0x1bn ? 'public nonce' : 'partial signature'} for participant ${bytesToHex(pair.keyData.slice(0, 33))}`;
  }
  return null;
}

function derivationSummary(value: Uint8Array, offset: number): string {
  const remaining = value.length - offset;
  if (remaining < 4 || remaining % 4 !== 0) return 'Malformed BIP32 key origin; expected a 4-byte fingerprint followed by zero or more child indexes.';
  const fingerprint = bytesToHex(value.slice(offset, offset + 4));
  const path: string[] = [];
  for (let position = offset + 4; position < value.length; position += 4) {
    const child = (
      (value[position] ?? 0)
      | ((value[position + 1] ?? 0) << 8)
      | ((value[position + 2] ?? 0) << 16)
      | ((value[position + 3] ?? 0) << 24)
    ) >>> 0;
    const hardened = child >= 0x80000000;
    path.push(`${hardened ? child - 0x80000000 : child}${hardened ? "'" : ''}`);
  }
  return `Master fingerprint ${fingerprint} · path m${path.length === 0 ? '' : `/${path.join('/')}`}`;
}

function payloadAddress(prefix: number, payload: Uint8Array): string {
  const prefixed = new Uint8Array(payload.length + 1);
  prefixed[0] = prefix;
  prefixed.set(payload, 1);
  return encodeBase58Check(prefixed);
}

export function describeScript(script: Uint8Array, chain: PsbtChain, network: PsbtNetwork): { type: string; address: string | null } {
  const hex = bytesToHex(script);
  if (/^76a914[0-9a-f]{40}88ac$/u.test(hex)) {
    const prefix = chain === 'dash' ? (network === 'mainnet' ? 0x4c : 0x8c) : (network === 'mainnet' ? 0x00 : 0x6f);
    return { type: 'P2PKH', address: payloadAddress(prefix, script.slice(3, 23)) };
  }
  if (/^a914[0-9a-f]{40}87$/u.test(hex)) {
    const prefix = chain === 'dash' ? (network === 'mainnet' ? 0x10 : 0x13) : (network === 'mainnet' ? 0x05 : 0xc4);
    return { type: 'P2SH', address: payloadAddress(prefix, script.slice(2, 22)) };
  }
  if (chain === 'bitcoin' && (/^0014[0-9a-f]{40}$/u.test(hex) || /^0020[0-9a-f]{64}$/u.test(hex))) {
    const hrp = network === 'mainnet' ? 'bc' : network === 'regtest' ? 'bcrt' : 'tb';
    return { type: script.length === 22 ? 'P2WPKH' : 'P2WSH', address: bech32.encode(hrp, [0, ...bech32.toWords(script.slice(2))]) };
  }
  if (chain === 'bitcoin' && /^5120[0-9a-f]{64}$/u.test(hex)) {
    const hrp = network === 'mainnet' ? 'bc' : network === 'regtest' ? 'bcrt' : 'tb';
    return { type: 'P2TR', address: bech32m.encode(hrp, [1, ...bech32m.toWords(script.slice(2))]) };
  }
  if (script[0] === 0x6a) return { type: 'OP_RETURN', address: null };
  return { type: 'Non-standard / unrecognized', address: null };
}

export function transactionId(bytes: Uint8Array): string {
  return reverseHex(sha256(sha256(bytes)));
}

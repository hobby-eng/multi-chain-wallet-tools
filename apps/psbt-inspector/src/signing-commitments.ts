import { bytesToHex } from '@ckd/core/crypto.js';
import type { ParsedPsbt, PsbtPair } from './psbt.js';

export type SighashProtocol = 'legacy' | 'segwit-v0' | 'taproot';

export interface SighashCommitments {
  readonly label: string;
  readonly known: boolean;
  readonly unusual: boolean;
  readonly currentInput: string;
  readonly otherInputs: string;
  readonly otherInputSequences: string;
  readonly outputs: string;
  readonly currentInputAmount: string;
}

export interface InputSigningAnalysis {
  readonly signature: string;
  readonly protocol: string;
  readonly sighash: SighashCommitments;
  readonly rbf: string;
  readonly locktime: string;
  readonly relativeLocktime: string;
}

function field(map: readonly PsbtPair[], type: bigint): PsbtPair | undefined {
  return map.find((item) => item.type === type && item.keyData.length === 0);
}

function u32(bytes: Uint8Array): number {
  if (bytes.length !== 4) throw new Error('Expected a four-byte integer.');
  return ((bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8) | ((bytes[2] ?? 0) << 16) | ((bytes[3] ?? 0) << 24)) >>> 0;
}

function inputProtocol(parsed: ParsedPsbt, index: number): SighashProtocol {
  const map = parsed.inputs[index] ?? [];
  if (map.some(({ type }) => type >= 0x13n && type <= 0x1cn)) return 'taproot';
  const script = parsed.inputUtxos[index]?.script;
  const scriptHex = script === undefined ? '' : bytesToHex(script);
  if (/^5120[0-9a-f]{64}$/u.test(scriptHex)) return 'taproot';
  if (/^00(?:14[0-9a-f]{40}|20[0-9a-f]{64})$/u.test(scriptHex)) return 'segwit-v0';
  const redeem = field(map, 0x04n)?.value;
  if (redeem !== undefined && /^00(?:14[0-9a-f]{40}|20[0-9a-f]{64})$/u.test(bytesToHex(redeem))) return 'segwit-v0';
  return 'legacy';
}

export function analyzeSighash(value: number | null, protocol: SighashProtocol, correspondingOutput = true): SighashCommitments {
  if (value === null) return {
    label: 'Not specified · signer decides according to wallet policy', known: false, unusual: false,
    currentInput: 'Unknown until a sighash type is selected', otherInputs: 'Unknown until a sighash type is selected',
    otherInputSequences: 'Unknown until a sighash type is selected', outputs: 'Unknown until a sighash type is selected',
    currentInputAmount: protocol === 'legacy' ? 'Not committed by legacy sighash' : 'Unknown until a sighash type is selected',
  };
  if (value > 0xff) return {
    label: `Unknown sighash value 0x${value.toString(16)}`, known: false, unusual: true,
    currentInput: 'Unknown', otherInputs: 'Unknown', otherInputSequences: 'Unknown', outputs: 'Unknown', currentInputAmount: 'Unknown',
  };
  const anyoneCanPay = (value & 0x80) !== 0;
  const base = value & 0x7f;
  const effectiveBase = protocol === 'taproot' && base === 0 ? 1 : base;
  if (![1, 2, 3].includes(effectiveBase) || (base === 0 && (protocol !== 'taproot' || anyoneCanPay))) return {
    label: `Unknown sighash value 0x${value.toString(16).padStart(2, '0')}`, known: false, unusual: true,
    currentInput: 'Unknown', otherInputs: 'Unknown', otherInputSequences: 'Unknown', outputs: 'Unknown', currentInputAmount: 'Unknown',
  };
  const baseName = protocol === 'taproot' && base === 0 ? 'SIGHASH_DEFAULT' : effectiveBase === 1 ? 'SIGHASH_ALL' : effectiveBase === 2 ? 'SIGHASH_NONE' : 'SIGHASH_SINGLE';
  const missingSingleOutput = effectiveBase === 3 && !correspondingOutput;
  const outputs = effectiveBase === 1
    ? 'All outputs and their amounts are committed'
    : effectiveBase === 2
      ? 'No outputs are committed'
      : missingSingleOutput
        ? protocol === 'taproot' ? 'Invalid · SIGHASH_SINGLE has no corresponding output' : 'No corresponding output · legacy SIGHASH_SINGLE edge case'
        : 'Only the output with the same index is committed';
  return {
    label: `${baseName}${anyoneCanPay ? ' | ANYONECANPAY' : ''}`,
    known: true,
    unusual: effectiveBase !== 1 || anyoneCanPay || missingSingleOutput,
    currentInput: 'Committed',
    otherInputs: anyoneCanPay ? 'Not committed · inputs may be added or removed' : 'Committed',
    otherInputSequences: anyoneCanPay || (protocol !== 'taproot' && effectiveBase !== 1) ? 'Not committed' : 'Committed',
    outputs,
    currentInputAmount: protocol === 'legacy' ? 'Not committed by legacy sighash' : 'Committed',
  };
}

function signatureState(map: readonly PsbtPair[]): string {
  if (field(map, 0x07n) !== undefined || field(map, 0x08n) !== undefined) return 'Final script supplied · signatures are not cryptographically verified here';
  const count = map.filter(({ type }) => [0x02n, 0x13n, 0x14n, 0x1cn].includes(type)).length;
  return count === 0 ? 'Not signed' : `${count} signature field(s) supplied · not cryptographically verified here`;
}

function signatureSighashes(map: readonly PsbtPair[]): number[] {
  const values: number[] = [];
  for (const item of map) {
    if (item.type === 0x02n && item.value.length > 0) values.push(item.value.at(-1)!);
    if ((item.type === 0x13n || item.type === 0x14n) && item.value.length === 64) values.push(0);
    if ((item.type === 0x13n || item.type === 0x14n) && item.value.length === 65) values.push(item.value[64]!);
  }
  return values;
}

function sequence(parsed: ParsedPsbt, index: number): number {
  if (parsed.transaction !== null) return parsed.transaction.inputs[index]?.sequence ?? 0xffffffff;
  const encoded = field(parsed.inputs[index] ?? [], 0x10n)?.value;
  return encoded === undefined ? 0xffffffff : u32(encoded);
}

function transactionVersion(parsed: ParsedPsbt): number {
  if (parsed.transaction !== null) return parsed.transaction.version;
  const encoded = field(parsed.global, 0x02n)?.value;
  return encoded === undefined ? 2 : u32(encoded);
}

function describeAbsoluteLocktime(parsed: ParsedPsbt, index: number): string {
  const map = parsed.inputs[index] ?? [];
  const requiredTime = field(map, 0x11n)?.value;
  const requiredHeight = field(map, 0x12n)?.value;
  if (requiredTime !== undefined) return `Requires Unix time ${u32(requiredTime)}`;
  if (requiredHeight !== undefined) return `Requires block height ${u32(requiredHeight)}`;
  const raw = parsed.transaction?.lockTime ?? (field(parsed.global, 0x03n) === undefined ? 0 : u32(field(parsed.global, 0x03n)!.value));
  if (raw === 0) return 'None';
  const allFinal = parsed.inputs.every((_map, inputIndex) => sequence(parsed, inputIndex) === 0xffffffff);
  if (allFinal) return `${raw} is set but inactive because every input has a final sequence`;
  return raw < 500_000_000 ? `Block height ${raw}` : `Unix time ${raw}`;
}

function describeRelativeLocktime(parsed: ParsedPsbt, inputSequence: number): string {
  if (transactionVersion(parsed) < 2 || (inputSequence & 0x80000000) !== 0) return 'None';
  const value = inputSequence & 0xffff;
  return (inputSequence & 0x00400000) !== 0 ? `${value * 512} seconds (BIP68)` : `${value} blocks (BIP68)`;
}

export function analyzeInputSigning(parsed: ParsedPsbt, index: number): InputSigningAnalysis {
  const map = parsed.inputs[index] ?? [];
  const protocol = inputProtocol(parsed, index);
  const requested = field(map, 0x03n)?.value;
  const explicit = requested === undefined ? null : u32(requested);
  const signatureValues = signatureSighashes(map);
  const inferred = signatureValues.length > 0 && signatureValues.every((value) => value === signatureValues[0]) ? signatureValues[0]! : null;
  const correspondingOutput = index < parsed.outputValues.length;
  let sighash = analyzeSighash(explicit ?? inferred, protocol, correspondingOutput);
  if (signatureValues.length > 1 && inferred === null) {
    sighash = { ...sighash, label: explicit === null ? 'Mixed sighash types in supplied signatures' : `${sighash.label} requested, but supplied signatures use mixed sighash types`, unusual: true };
  } else if (explicit !== null && inferred !== null && explicit !== inferred) {
    const signatureLabel = analyzeSighash(inferred, protocol, correspondingOutput).label;
    sighash = { ...sighash, label: `${sighash.label} requested, but supplied signature uses ${signatureLabel}`, unusual: true };
  } else if (inferred !== null && explicit === null) {
    sighash = { ...sighash, label: `${sighash.label} · inferred from supplied signature` };
  }
  const inputSequence = sequence(parsed, index);
  const rbfSignal = inputSequence < 0xfffffffe;
  return {
    signature: signatureState(map),
    protocol: protocol === 'taproot' ? 'Taproot / BIP341' : protocol === 'segwit-v0' ? 'SegWit v0 / BIP143' : 'Legacy Script',
    sighash,
    rbf: parsed.chain === 'dash'
      ? `Not supported by Dash Core${rbfSignal ? ' · this input has a non-final sequence' : ''}`
      : rbfSignal ? `Opt-in RBF signaled · sequence 0x${inputSequence.toString(16).padStart(8, '0')}` : 'Not signaled',
    locktime: describeAbsoluteLocktime(parsed, index),
    relativeLocktime: describeRelativeLocktime(parsed, inputSequence),
  };
}

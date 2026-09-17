import { bytesToHex } from '@ckd/core/crypto.js';
import { Reader, compactValue, decodeText, littleU32, pair, readMap } from './psbt-binary.js';
import { readTransaction, type ParsedTransaction } from './transaction.js';
import { inputUtxo, scriptCommitmentFailure, validateMoney } from './psbt-utxo.js';
import { validateMap, validateMusigPsbtFields, validateVersionFields } from './psbt-validation.js';
import { inputVerification } from './psbt-verification.js';
import type { ParsedPsbt, PsbtChain, PsbtVerificationCheck } from './psbt-types.js';

export type { PsbtPair } from './psbt-binary.js';
export { parsedTransactionId } from './transaction.js';
export type { ParsedTransaction, TransactionInput, TransactionOutput } from './transaction.js';
export type {
  ParsedPsbt,
  PsbtChain,
  PsbtNetwork,
  PsbtVerificationCheck,
  SuppliedUtxo,
  VerificationStatus,
} from './psbt-types.js';
export { validateMusigPsbtFields } from './psbt-validation.js';
export { describeScript, pairName, pairSummary, transactionId } from './psbt-presentation.js';

export function parsePsbt(text: string, chain: PsbtChain): ParsedPsbt {
  const reader = new Reader(decodeText(text));
  const magic = reader.read(5);
  if (bytesToHex(magic) !== '70736274ff') throw new Error('Missing PSBT magic bytes 70736274ff.');
  const global = readMap(reader);
  validateMap(global, 'global');
  const versionPair = pair(global, 0xfb);
  const version = versionPair === undefined ? 0 : littleU32(versionPair.value, 'PSBT version');
  if (version !== 0 && version !== 2) throw new Error(`Unsupported PSBT version ${version}.`);
  if (chain === 'dash' && version !== 0)
    throw new Error('Dash Core interoperability is currently limited to PSBT version 0.');

  const unsignedPair = pair(global, 0x00);
  let transaction: ParsedTransaction | null = null;
  let inputCount: number;
  let outputCount: number;
  if (version === 0) {
    if (unsignedPair === undefined) throw new Error('PSBT v0 is missing its global unsigned transaction.');
    try {
      transaction = readTransaction(unsignedPair.value, chain, false);
    } catch (legacyError) {
      if (chain === 'bitcoin') {
        const witnessSerializationError = new Error(
          'A PSBT v0 global unsigned transaction must use legacy serialization without witness data.',
        );
        try {
          const witnessCandidate = readTransaction(unsignedPair.value, chain, true);
          if (witnessCandidate.hasWitness) throw witnessSerializationError;
        } catch (witnessError) {
          if (witnessError === witnessSerializationError) throw witnessError;
          if (
            legacyError instanceof Error &&
            legacyError.message === 'Unexpected end of PSBT data.' &&
            witnessError instanceof Error &&
            /superfluous empty witness record/u.test(witnessError.message)
          ) {
            throw witnessSerializationError;
          }
        }
      }
      throw legacyError;
    }
    if (transaction.inputs.some(({ scriptSig }) => scriptSig.length !== 0)) {
      throw new Error('A PSBT v0 global unsigned transaction must have an empty scriptSig for every input.');
    }
    inputCount = transaction.inputs.length;
    outputCount = transaction.outputs.length;
  } else {
    if (unsignedPair !== undefined) throw new Error('PSBT v2 must not contain a global unsigned transaction.');
    const inputCountPair = pair(global, 0x04);
    const outputCountPair = pair(global, 0x05);
    if (inputCountPair === undefined || outputCountPair === undefined)
      throw new Error('PSBT v2 is missing its input or output count.');
    inputCount = compactValue(inputCountPair.value, 'PSBT input count');
    outputCount = compactValue(outputCountPair.value, 'PSBT output count');
  }
  const inputs = Array.from({ length: inputCount }, () => {
    const map = readMap(reader);
    validateMap(map, 'input');
    if (chain === 'bitcoin') validateMusigPsbtFields(map, 'input');
    return map;
  });
  const outputs = Array.from({ length: outputCount }, () => {
    const map = readMap(reader);
    validateMap(map, 'output');
    if (chain === 'bitcoin') validateMusigPsbtFields(map, 'output');
    return map;
  });
  if (reader.remaining !== 0) throw new Error('PSBT contains trailing data after its maps.');
  const mixedLockKinds = validateVersionFields(global, inputs, outputs, version);
  const suppliedUtxos = inputs.map((map, index) => inputUtxo(map, transaction?.inputs[index], chain));
  const commitmentFailures = suppliedUtxos.map((utxo, index) => {
    if (utxo !== null) validateMoney(utxo.value, chain, `Input ${index} value`);
    return scriptCommitmentFailure(inputs[index]!, utxo);
  });
  const inputValues = suppliedUtxos.map((utxo) => utxo?.value ?? null);
  const outputValues =
    transaction === null
      ? outputs.map((map) => {
          const amount = pair(map, 0x03);
          if (amount === undefined || amount.value.length !== 8)
            throw new Error('PSBT v2 output is missing a valid amount.');
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
  const globalVerification: PsbtVerificationCheck[] = [
    modifiable !== undefined && (modifiable & 0xf8) !== 0
      ? {
          relationship: 'PSBT transaction-modifiable flags',
          status: 'not-verified',
          detail: `Undefined flag bits 0x${(modifiable & 0xf8).toString(16).padStart(2, '0')} are preserved but have no defined BIP370 meaning.`,
        }
      : {
          relationship: 'PSBT transaction-modifiable flags',
          status: 'verified',
          detail: 'All supplied transaction-modifiable bits have defined BIP370 meanings.',
        },
  ];
  const inputVerificationRows = inputs.map((map, index) =>
    inputVerification(map, suppliedUtxos[index] ?? null, chain, commitmentFailures[index] ?? null, mixedLockKinds),
  );
  return {
    chain,
    version,
    global,
    inputs,
    outputs,
    transaction,
    inputUtxos: suppliedUtxos,
    inputValues,
    outputValues,
    fee,
    globalVerification,
    inputVerification: inputVerificationRows,
  };
}

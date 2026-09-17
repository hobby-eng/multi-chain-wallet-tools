import { equalBytes } from '@ckd/core/bytes.js';
import { hash160, sha256 } from '@ckd/core/crypto.js';
import { CONSENSUS_LIMITS } from './consensus-limits.js';
import { littleU32, pair, reverseHex, type PsbtPair } from './psbt-binary.js';
import { parsedTransactionId, readTransaction, readTxOut, type TransactionInput } from './transaction.js';
import type { PsbtChain, SuppliedUtxo } from './psbt-types.js';

export function inputUtxo(
  map: readonly PsbtPair[],
  txInput: TransactionInput | undefined,
  chain: PsbtChain,
): SuppliedUtxo | null {
  const witnessPair = pair(map, 0x01);
  const witness = chain === 'bitcoin' && witnessPair !== undefined ? readTxOut(witnessPair.value) : undefined;
  const previous = pair(map, 0x00);
  const outputIndexPair = pair(map, 0x0f);
  const outputIndex =
    txInput?.vout ??
    (outputIndexPair === undefined ? undefined : littleU32(outputIndexPair.value, 'PSBT v2 previous output index'));
  if (previous === undefined)
    return witness === undefined ? null : { ...witness, binding: 'witness-only', previousTransaction: null };
  const transaction = readTransaction(previous.value, chain);
  const id = txInput?.txid ?? (pair(map, 0x0e) === undefined ? undefined : reverseHex(pair(map, 0x0e)!.value));
  if (id === undefined || parsedTransactionId(transaction) !== id)
    throw new Error('Non-witness UTXO transaction ID does not match the referenced input.');
  const output = outputIndex === undefined ? undefined : transaction.outputs[outputIndex];
  if (output === undefined) throw new Error('Referenced output is absent from the non-witness UTXO.');
  if (witness !== undefined && (witness.value !== output.value || !equalBytes(witness.script, output.script))) {
    throw new Error('Witness and non-witness UTXOs disagree.');
  }
  return { ...output, binding: 'non-witness', previousTransaction: transaction };
}

function maximumMoney(chain: PsbtChain): bigint {
  return chain === 'dash' ? CONSENSUS_LIMITS.maximumDashMoney : CONSENSUS_LIMITS.maximumBitcoinMoney;
}

export function validateMoney(value: bigint, chain: PsbtChain, label: string): void {
  if (value > maximumMoney(chain))
    throw new Error(`${label} exceeds ${chain === 'dash' ? 'Dash' : 'Bitcoin'} MAX_MONEY.`);
}

function p2shCommitment(script: Uint8Array): Uint8Array {
  return Uint8Array.of(0xa9, 0x14, ...hash160(script), 0x87);
}

function p2wshCommitment(script: Uint8Array): Uint8Array {
  return Uint8Array.of(0x00, 0x20, ...sha256(script));
}

export function scriptCommitmentFailure(map: readonly PsbtPair[], utxo: SuppliedUtxo | null): string | null {
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

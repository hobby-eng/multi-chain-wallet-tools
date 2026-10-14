import { bytesToHex } from "@ckd/core/crypto.js";
import { CONSENSUS_LIMITS, RelativeSequence } from "./consensus-limits.js";
import type { ParsedPsbt, PsbtPair } from "./psbt.js";
import { redeemScriptMatches } from "./psbt-utxo.js";
import { PsbtV2Locktime, type TransactionLocktime } from "./psbt-locktime.js";
import { PsbtFieldRegistry } from "./psbt-field-registry.js";

type SighashProtocol = "legacy" | "segwit-v0" | "taproot";

const TAPROOT_OUTPUT = /^5120[0-9a-f]{64}$/u;
const WITNESS_V0_PROGRAM = /^00(?:14[0-9a-f]{40}|20[0-9a-f]{64})$/u;
const P2SH_OUTPUT = /^a914[0-9a-f]{40}87$/u;

const PROTOCOL_LABELS: Readonly<Record<SighashProtocol, string>> = {
  legacy: "Legacy Script",
  "segwit-v0": "SegWit v0 / BIP143",
  taproot: "Taproot / BIP341",
};
const NO_UTXO_PROTOCOL =
  "Unknown · no UTXO was supplied, so the spending protocol is not established";
const UNBOUND_P2SH_PROTOCOL =
  "Unknown · the P2SH redeemScript is missing or does not match the UTXO";
const PROTOCOL_DEPENDENT =
  "Unknown · depends on the spending protocol, which the supplied data does not establish";

// BIP370 treats an omitted PSBT_IN_SEQUENCE as final, and consensus ignores nLockTime when every
// input of the transaction is final.
const FINAL_SEQUENCE = 0xffffffff;

interface SighashCommitments {
  readonly label: string;
  readonly known: boolean;
  readonly unusual: boolean;
  readonly currentInput: string;
  readonly otherInputs: string;
  readonly otherInputSequences: string;
  readonly outputs: string;
  readonly currentInputAmount: string;
}

type CommitmentText = Exclude<keyof SighashCommitments, "label" | "known" | "unusual">;

interface SpendingContext {
  /** Every protocol the supplied data leaves possible: exactly one when it is established. */
  readonly candidates: readonly SighashProtocol[];
  readonly label: string;
}

interface InputSigningAnalysis {
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
  if (bytes.length !== 4) throw new Error("Expected a four-byte integer.");
  return (
    ((bytes[0] ?? 0) |
      ((bytes[1] ?? 0) << 8) |
      ((bytes[2] ?? 0) << 16) |
      ((bytes[3] ?? 0) << 24)) >>>
    0
  );
}

function established(protocol: SighashProtocol): SpendingContext {
  return { candidates: [protocol], label: PROTOCOL_LABELS[protocol] };
}

// Only the supplied UTXO, and a redeemScript whose HASH160 that UTXO commits to, can establish the
// protocol. Optional metadata (Taproot fields, an unbound redeemScript) never promotes an input.
function spendingContext(parsed: ParsedPsbt, index: number): SpendingContext {
  // Dash Core has neither SegWit nor Taproot; their metadata is preserved as unknown fields.
  if (parsed.chain === "dash") return established("legacy");
  const utxo = parsed.inputUtxos[index] ?? null;
  if (utxo === null)
    return { candidates: ["legacy", "segwit-v0", "taproot"], label: NO_UTXO_PROTOCOL };
  const script = bytesToHex(utxo.script);
  if (TAPROOT_OUTPUT.test(script)) return established("taproot");
  if (WITNESS_V0_PROGRAM.test(script)) return established("segwit-v0");
  if (!P2SH_OUTPUT.test(script)) return established("legacy");
  const redeem = field(parsed.inputs[index] ?? [], 0x04n)?.value;
  if (redeem === undefined || !redeemScriptMatches(utxo, redeem))
    return { candidates: ["legacy", "segwit-v0"], label: UNBOUND_P2SH_PROTOCOL };
  return established(WITNESS_V0_PROGRAM.test(bytesToHex(redeem)) ? "segwit-v0" : "legacy");
}

export function analyzeSighash(
  value: number | null,
  protocol: SighashProtocol,
  correspondingOutput = true,
): SighashCommitments {
  if (value === null)
    return {
      label: "Not specified · signer decides according to wallet policy",
      known: false,
      unusual: false,
      currentInput: "Unknown until a sighash type is selected",
      otherInputs: "Unknown until a sighash type is selected",
      otherInputSequences: "Unknown until a sighash type is selected",
      outputs: "Unknown until a sighash type is selected",
      currentInputAmount:
        protocol === "legacy"
          ? "Not committed by legacy sighash"
          : "Unknown until a sighash type is selected",
    };
  if (value > 0xff)
    return {
      label: `Unknown sighash value 0x${value.toString(16)}`,
      known: false,
      unusual: true,
      currentInput: "Unknown",
      otherInputs: "Unknown",
      otherInputSequences: "Unknown",
      outputs: "Unknown",
      currentInputAmount: "Unknown",
    };
  const anyoneCanPay = (value & 0x80) !== 0;
  const base = value & 0x7f;
  const effectiveBase = protocol === "taproot" && base === 0 ? 1 : base;
  if (
    ![1, 2, 3].includes(effectiveBase) ||
    (base === 0 && (protocol !== "taproot" || anyoneCanPay))
  )
    return {
      label: `Unknown sighash value 0x${value.toString(16).padStart(2, "0")}`,
      known: false,
      unusual: true,
      currentInput: "Unknown",
      otherInputs: "Unknown",
      otherInputSequences: "Unknown",
      outputs: "Unknown",
      currentInputAmount: "Unknown",
    };
  const baseName =
    protocol === "taproot" && base === 0
      ? "SIGHASH_DEFAULT"
      : effectiveBase === 1
        ? "SIGHASH_ALL"
        : effectiveBase === 2
          ? "SIGHASH_NONE"
          : "SIGHASH_SINGLE";
  const missingSingleOutput = effectiveBase === 3 && !correspondingOutput;
  if (missingSingleOutput && protocol === "legacy") {
    return {
      label: `${baseName}${anyoneCanPay ? " | ANYONECANPAY" : ""}`,
      known: true,
      unusual: true,
      currentInput: "Not committed · legacy bug returns the constant hash 1",
      otherInputs: "Not committed · legacy bug returns the constant hash 1",
      otherInputSequences: "Not committed · legacy bug returns the constant hash 1",
      outputs: "No corresponding output · legacy SIGHASH_SINGLE returns the constant hash 1",
      currentInputAmount: "Not committed by legacy sighash",
    };
  }
  if (missingSingleOutput && protocol === "taproot") {
    return {
      label: `${baseName}${anyoneCanPay ? " | ANYONECANPAY" : ""}`,
      known: false,
      unusual: true,
      currentInput: "Invalid · no corresponding output",
      otherInputs: "Invalid · no corresponding output",
      otherInputSequences: "Invalid · no corresponding output",
      outputs: "Invalid · SIGHASH_SINGLE has no corresponding output",
      currentInputAmount: "Invalid · no corresponding output",
    };
  }
  const outputs =
    effectiveBase === 1
      ? "All outputs and their amounts are committed"
      : effectiveBase === 2
        ? "No outputs are committed"
        : missingSingleOutput
          ? "No corresponding output is committed"
          : "Only the output with the same index is committed";
  return {
    label: `${baseName}${anyoneCanPay ? " | ANYONECANPAY" : ""}`,
    known: true,
    unusual: effectiveBase !== 1 || anyoneCanPay || missingSingleOutput,
    currentInput: "Committed",
    otherInputs: anyoneCanPay ? "Not committed · inputs may be added or removed" : "Committed",
    otherInputSequences:
      anyoneCanPay || (protocol !== "taproot" && effectiveBase !== 1)
        ? "Not committed"
        : "Committed",
    outputs,
    currentInputAmount: protocol === "legacy" ? "Not committed by legacy sighash" : "Committed",
  };
}

function agreedText(analyses: readonly SighashCommitments[], key: CommitmentText): string {
  const first = analyses[0]![key];
  return analyses.every((analysis) => analysis[key] === first) ? first : PROTOCOL_DEPENDENT;
}

// Merges the analyses of every candidate protocol: a statement survives only where all agree, so
// an unestablished protocol never yields a "Committed" claim that one candidate contradicts.
function commonCommitments(analyses: readonly SighashCommitments[]): SighashCommitments {
  return {
    label: [...new Set(analyses.map(({ label }) => label))].join(" or "),
    known: analyses.every(({ known }) => known),
    unusual: analyses.some(({ unusual }) => unusual),
    currentInput: agreedText(analyses, "currentInput"),
    otherInputs: agreedText(analyses, "otherInputs"),
    otherInputSequences: agreedText(analyses, "otherInputSequences"),
    outputs: agreedText(analyses, "outputs"),
    currentInputAmount: agreedText(analyses, "currentInputAmount"),
  };
}

function signatureState(map: readonly PsbtPair[]): string {
  if (field(map, 0x07n) !== undefined || field(map, 0x08n) !== undefined)
    return "Final script supplied · signatures are not cryptographically verified here";
  const count = map.filter(({ type }) => [0x02n, 0x13n, 0x14n, 0x1cn].includes(type)).length;
  return count === 0
    ? "No signature or final-script fields supplied"
    : `${count} signature field(s) supplied · not cryptographically verified here`;
}

function signatureSighashes(map: readonly PsbtPair[]): number[] {
  const values: number[] = [];
  for (const item of map) {
    if (item.type === 0x02n && item.value.length > 0) values.push(item.value.at(-1)!);
    if ((item.type === 0x13n || item.type === 0x14n) && item.value.length === 64) values.push(0);
    if ((item.type === 0x13n || item.type === 0x14n) && item.value.length === 65)
      values.push(item.value[64]!);
  }
  return values;
}

function sequence(parsed: ParsedPsbt, index: number): number {
  if (parsed.transaction !== null)
    return parsed.transaction.inputs[index]?.sequence ?? FINAL_SEQUENCE;
  const encoded = field(parsed.inputs[index] ?? [], 0x10n)?.value;
  return encoded === undefined ? FINAL_SEQUENCE : u32(encoded);
}

function everySequenceFinal(parsed: ParsedPsbt): boolean {
  return parsed.inputs.every((_map, index) => sequence(parsed, index) === FINAL_SEQUENCE);
}

function transactionVersion(parsed: ParsedPsbt): number {
  if (parsed.transaction !== null) return parsed.transaction.version;
  const encoded = field(parsed.global, 0x02n)?.value;
  return encoded === undefined ? 2 : u32(encoded);
}

function serializedLockTime(parsed: ParsedPsbt): number {
  if (parsed.transaction !== null) return parsed.transaction.lockTime;
  const fallback = field(parsed.global, 0x03n)?.value;
  return fallback === undefined ? 0 : u32(fallback);
}

function transactionLock(parsed: ParsedPsbt): TransactionLocktime | null {
  const fallback = serializedLockTime(parsed);
  return parsed.version === 2
    ? new PsbtV2Locktime(parsed.inputs).resolve(fallback)
    : { value: fallback, fromRequirements: false };
}

function lockText(lock: TransactionLocktime): string {
  const isHeight = lock.value < CONSENSUS_LIMITS.absoluteLockTimeThreshold;
  if (lock.fromRequirements)
    return `Effective transaction lock: ${isHeight ? "block height" : "Unix time"} ${lock.value}`;
  return `${isHeight ? "Block height" : "Unix time"} ${lock.value}`;
}

// The sequence check comes last and covers every lock source, because final sequences disable
// nLockTime for the whole transaction however its value was determined.
function describeAbsoluteLocktime(parsed: ParsedPsbt): string {
  const lock = transactionLock(parsed);
  if (lock === null) return "Unsatisfiable · inputs require both a block height and a Unix time";
  if (lock.value === 0) return "None";
  const text = lockText(lock);
  return everySequenceFinal(parsed)
    ? `${text} · inactive because every input has a final sequence`
    : text;
}

/** BIP68: a sequence is a relative lock only from transaction version 2 on, without its disable flag. */
function describeRelativeLocktime(parsed: ParsedPsbt, inputSequence: number): string {
  const sequence = new RelativeSequence(inputSequence);
  if (transactionVersion(parsed) < 2 || sequence.disabled) return "None";
  return `${sequence.delay} (BIP68)`;
}

export function analyzeInputSigning(rawParsed: ParsedPsbt, index: number): InputSigningAnalysis {
  const registry = new PsbtFieldRegistry(rawParsed.chain);
  // All signing and transaction-wide locktime lookups share the interpreted
  // view. The caller's parsed maps still retain every unknown byte.
  const parsed: ParsedPsbt = {
    ...rawParsed,
    global: registry.interpreted(rawParsed.global, "global"),
    inputs: rawParsed.inputs.map((map) => registry.interpreted(map, "input")),
  };
  const map = parsed.inputs[index] ?? [];
  const context = spendingContext(parsed, index);
  const requested = field(map, 0x03n)?.value;
  const explicit = requested === undefined ? null : u32(requested);
  const signatureValues = signatureSighashes(map);
  const inferred =
    signatureValues.length > 0 && signatureValues.every((value) => value === signatureValues[0])
      ? signatureValues[0]!
      : null;
  const correspondingOutput = index < parsed.outputValues.length;
  const analyze = (value: number | null): SighashCommitments =>
    commonCommitments(
      context.candidates.map((protocol) => analyzeSighash(value, protocol, correspondingOutput)),
    );
  let sighash = analyze(explicit ?? inferred);
  if (signatureValues.length > 1 && inferred === null) {
    sighash = {
      ...sighash,
      label:
        explicit === null
          ? "Mixed sighash types in supplied signatures"
          : `${sighash.label} requested, but supplied signatures use mixed sighash types`,
      unusual: true,
    };
  } else if (explicit !== null && inferred !== null && explicit !== inferred) {
    const signatureLabel = analyze(inferred).label;
    sighash = {
      ...sighash,
      label: `${sighash.label} requested, but supplied signature uses ${signatureLabel}`,
      unusual: true,
    };
  } else if (inferred !== null && explicit === null) {
    sighash = { ...sighash, label: `${sighash.label} · inferred from supplied signature` };
  }
  const inputSequence = sequence(parsed, index);
  const rbfSignal = inputSequence < 0xfffffffe;
  return {
    signature: signatureState(map),
    protocol: context.label,
    sighash,
    rbf:
      parsed.chain === "dash"
        ? `Not supported by Dash Core${rbfSignal ? " · this input has a non-final sequence" : ""}`
        : rbfSignal
          ? `Opt-in RBF signaled · sequence 0x${inputSequence.toString(16).padStart(8, "0")}`
          : "Not signaled",
    locktime: describeAbsoluteLocktime(parsed),
    relativeLocktime: describeRelativeLocktime(parsed, inputSequence),
  };
}

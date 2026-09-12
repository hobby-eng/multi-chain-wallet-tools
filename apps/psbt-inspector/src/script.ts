import { bytesToHex, hash160, hexToBytes, sha256 } from '@ckd/core/crypto.js';
import { describeScript, type PsbtChain, type PsbtNetwork } from './psbt.js';
import { CONSENSUS_LIMITS } from './consensus-limits.js';

export interface ScriptOperation {
  readonly offset: number;
  readonly opcode: number;
  readonly name: string;
  readonly data: string | null;
  readonly meaning: string;
}
export interface ScriptWrapper { readonly label: string; readonly address: string; readonly scriptPubKey: string }
export interface DecodedScript {
  readonly hex: string;
  readonly byteLength: number;
  readonly asm: string;
  readonly operations: readonly ScriptOperation[];
  readonly classification: string;
  readonly directAddress: string | null;
  readonly inferredPolicy: string;
  readonly wrappers: readonly ScriptWrapper[];
}

const NAMES: Record<number, string> = {
  0x00: 'OP_0', 0x4c: 'OP_PUSHDATA1', 0x4d: 'OP_PUSHDATA2', 0x4e: 'OP_PUSHDATA4', 0x4f: 'OP_1NEGATE',
  0x61: 'OP_NOP', 0x63: 'OP_IF', 0x64: 'OP_NOTIF', 0x67: 'OP_ELSE', 0x68: 'OP_ENDIF', 0x69: 'OP_VERIFY',
  0x6a: 'OP_RETURN', 0x6b: 'OP_TOALTSTACK', 0x6c: 'OP_FROMALTSTACK', 0x73: 'OP_IFDUP',
  0x75: 'OP_DROP', 0x76: 'OP_DUP', 0x7c: 'OP_SWAP', 0x82: 'OP_SIZE',
  0x87: 'OP_EQUAL', 0x88: 'OP_EQUALVERIFY', 0x92: 'OP_0NOTEQUAL', 0x93: 'OP_ADD',
  0x9a: 'OP_BOOLAND', 0x9b: 'OP_BOOLOR', 0x9c: 'OP_NUMEQUAL', 0x9d: 'OP_NUMEQUALVERIFY',
  0xa1: 'OP_LESSTHANOREQUAL', 0xa6: 'OP_RIPEMD160', 0xa8: 'OP_SHA256', 0xa9: 'OP_HASH160', 0xaa: 'OP_HASH256',
  0xac: 'OP_CHECKSIG', 0xad: 'OP_CHECKSIGVERIFY', 0xae: 'OP_CHECKMULTISIG',
  0xaf: 'OP_CHECKMULTISIGVERIFY', 0xb1: 'OP_CHECKLOCKTIMEVERIFY', 0xb2: 'OP_CHECKSEQUENCEVERIFY',
  0xba: 'OP_CHECKSIGADD',
};
for (let value = 1; value <= 16; value += 1) NAMES[0x50 + value] = `OP_${value}`;

const OPERATION_MEANINGS: Readonly<Record<number, string>> = {
  0x00: 'push false / an empty byte vector',
  0x63: 'execute the following branch when the top stack value is true',
  0x64: 'execute the following branch when the top stack value is false',
  0x67: 'begin the alternative conditional branch',
  0x68: 'end the conditional branch',
  0x69: 'fail unless the top stack value is true, then remove it',
  0x6a: 'mark this output as provably unspendable',
  0x6b: 'move the top value to the alternate stack',
  0x6c: 'restore the top alternate-stack value',
  0x73: 'duplicate the top value only when it is true',
  0x75: 'remove the top stack value',
  0x76: 'duplicate the top stack value',
  0x7c: 'swap the top two stack values',
  0x82: 'push the byte length of the top value',
  0x87: 'compare the top two values for byte equality',
  0x88: 'require byte equality or fail',
  0x92: 'convert the top value to canonical boolean',
  0x93: 'add the top two script numbers',
  0x9a: 'boolean AND',
  0x9b: 'boolean OR',
  0x9c: 'compare two script numbers for equality',
  0x9d: 'require numeric equality or fail',
  0xa1: 'numeric less-than-or-equal comparison',
  0xa6: 'RIPEMD-160 hash',
  0xa8: 'SHA-256 hash',
  0xa9: 'HASH160: RIPEMD-160(SHA-256(value))',
  0xaa: 'HASH256: SHA-256(SHA-256(value))',
  0xac: 'verify one signature and leave true/false',
  0xad: 'verify one signature or fail',
  0xae: 'verify an M-of-N signature set and leave true/false',
  0xaf: 'verify an M-of-N signature set or fail',
  0xb1: 'enforce the transaction absolute locktime',
  0xb2: 'enforce the input relative sequence lock',
  0xba: 'Tapscript-only signature check added to the running count',
};

function operationMeaning(opcode: number, data: string | null): string {
  if (data !== null) return `push ${data.length / 2} data byte${data.length === 2 ? '' : 's'} onto the stack`;
  const number = numberOpcode(opcode);
  if (number !== null) return `push script number ${number}`;
  return OPERATION_MEANINGS[opcode] ?? 'opcode is not interpreted by this inspector';
}

function pushedValueAsm(data: string): string {
  if (data.length === 0 || data.length > 8) return data;
  const bytes = hexToBytes(data);
  const negative = (bytes[bytes.length - 1]! & 0x80) !== 0;
  let value = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = index === bytes.length - 1 ? bytes[index]! & 0x7f : bytes[index]!;
    value += byte * (2 ** (8 * index));
  }
  return String(negative ? -value : value);
}

function numberOpcode(opcode: number): number | null {
  if (opcode === 0) return 0;
  return opcode >= 0x51 && opcode <= 0x60 ? opcode - 0x50 : null;
}

function scriptNumber(hex: string): number | null {
  const bytes = hexToBytes(hex);
  if (bytes.length === 0 || bytes.length > 5) return null;
  let value = 0;
  for (let index = 0; index < bytes.length; index += 1) value += (bytes[index]! & (index === bytes.length - 1 ? 0x7f : 0xff)) * (2 ** (8 * index));
  return (bytes.at(-1)! & 0x80) === 0 ? value : -value;
}

function operationScriptNumber(operation: ScriptOperation | undefined): number | null {
  if (operation === undefined) return null;
  const opcodeValue = numberOpcode(operation.opcode);
  if (opcodeValue !== null) return opcodeValue;
  return operation.data === null ? null : scriptNumber(operation.data);
}

function parse(hexText: string): { bytes: Uint8Array; operations: ScriptOperation[] } {
  const hex = hexText.trim().replaceAll(/\s+/gu, '').toLowerCase();
  if (hex.length === 0) throw new Error('Malformed Script hex: enter at least one byte.');
  if (!/^[0-9a-f]+$/u.test(hex)) throw new Error('Malformed Script hex: only hexadecimal characters and whitespace are allowed.');
  if (hex.length % 2 !== 0) throw new Error('Malformed Script hex: odd-length hex is missing one nibble.');
  const bytes = hexToBytes(hex);
  if (bytes.length > CONSENSUS_LIMITS.maximumScriptBytes) throw new Error('Script is unreasonably large.');
  const operations: ScriptOperation[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const start = offset;
    const opcode = bytes[offset++]!;
    let length: number | null = opcode >= 1 && opcode <= 75 ? opcode : null;
    if (opcode === 0x4c) { if (offset >= bytes.length) throw new Error('Malformed Script: truncated OP_PUSHDATA1.'); length = bytes[offset++]!; }
    if (opcode === 0x4d) { if (offset + 2 > bytes.length) throw new Error('Malformed Script: truncated OP_PUSHDATA2.'); length = bytes[offset]! | (bytes[offset + 1]! << 8); offset += 2; }
    if (opcode === 0x4e) {
      if (offset + 4 > bytes.length) throw new Error('Malformed Script: truncated OP_PUSHDATA4.');
      length = (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0; offset += 4;
    }
    let data: string | null = null;
    if (length !== null) {
      if (length > bytes.length - offset) throw new Error(`Malformed Script: push at byte ${start} exceeds the script length.`);
      data = bytesToHex(bytes.slice(offset, offset + length)); offset += length;
    }
    operations.push({
      offset: start,
      opcode,
      name: data === null ? (NAMES[opcode] ?? `OP_UNKNOWN_0x${opcode.toString(16).padStart(2, '0')}`) : `PUSH(${length})`,
      data,
      meaning: operationMeaning(opcode, data),
    });
  }
  return { bytes, operations };
}

function multisigAt(ops: readonly ScriptOperation[], start: number): { end: number; text: string } | null {
  const required = numberOpcode(ops[start]?.opcode ?? -1);
  if (required === null || required < 1) return null;
  let index = start + 1;
  let keys = 0;
  while (ops[index]?.data !== null && /^(02|03)[0-9a-f]{64}$/u.test(ops[index]?.data ?? '')) { keys += 1; index += 1; }
  const total = numberOpcode(ops[index]?.opcode ?? -1);
  if (total !== keys || required > keys || ops[index + 1]?.opcode !== 0xae) return null;
  return { end: index + 2, text: `${required}-of-${keys} multisig` };
}

function lockAt(ops: readonly ScriptOperation[], start: number): { next: number; condition: string } | null {
  const lock = operationScriptNumber(ops[start]);
  const lockOp = ops[start + 1]?.opcode;
  const terminal = ops[start + 2]?.opcode;
  if (lock === null || (lockOp !== 0xb1 && lockOp !== 0xb2) || (terminal !== 0x69 && terminal !== 0x75)) return null;
  const condition = lockOp === 0xb1
    ? `absolute lock ${lock}`
    : ((lock & CONSENSUS_LIMITS.bip68TypeFlag) !== 0 ? `relative delay ${(lock & CONSENSUS_LIMITS.bip68SequenceMask) * 512} seconds` : `relative delay ${lock & CONSENSUS_LIMITS.bip68SequenceMask} blocks`);
  return { next: start + 3, condition };
}

function recoveryBranchAt(ops: readonly ScriptOperation[], start: number): { end: number; text: string } | null {
  const lock = lockAt(ops, start);
  if (lock === null) return null;
  const singleKey = ops[lock.next];
  if (/^(02|03)[0-9a-f]{64}$/u.test(singleKey?.data ?? '') && ops[lock.next + 1]?.opcode === 0xac) {
    return { end: lock.next + 2, text: `one recovery key after ${lock.condition}` };
  }
  const multisig = multisigAt(ops, lock.next);
  if (multisig !== null) return { end: multisig.end, text: `${multisig.text} after ${lock.condition}` };
  return null;
}

function infer(ops: readonly ScriptOperation[]): string {
  const direct = multisigAt(ops, 0);
  if (direct?.end === ops.length) return direct.text;
  if (ops[0]?.opcode === 0x63) {
    const primary = multisigAt(ops, 1);
    if (primary !== null && ops[primary.end]?.opcode === 0x67) {
      const recovery = recoveryBranchAt(ops, primary.end + 1);
      if (recovery !== null && ops[recovery.end]?.opcode === 0x68 && recovery.end + 1 === ops.length) {
        return `${primary.text} immediately OR ${recovery.text}`;
      }
      if (ops[primary.end + 1]?.opcode === 0x63) {
        const first = recoveryBranchAt(ops, primary.end + 2);
        if (first !== null && ops[first.end]?.opcode === 0x67) {
          const second = recoveryBranchAt(ops, first.end + 1);
          if (second !== null && ops[second.end]?.opcode === 0x68 && ops[second.end + 1]?.opcode === 0x68 && second.end + 2 === ops.length) {
            return `${primary.text} immediately OR ${first.text} OR ${second.text}`;
          }
        }
      }
    }
  }
  const lock = operationScriptNumber(ops[0]);
  const locked = multisigAt(ops, 3);
  if (lock !== null && (ops[1]?.opcode === 0xb1 || ops[1]?.opcode === 0xb2) && (ops[2]?.opcode === 0x69 || ops[2]?.opcode === 0x75) && locked?.end === ops.length) return `${locked.text} after lock value ${lock}`;
  return 'No supported multisig/timelock template recognized; review every opcode manually.';
}

export function decodeScript(hexText: string, chain: PsbtChain, network: PsbtNetwork, role: 'spending' | 'script-pubkey'): DecodedScript {
  const { bytes, operations } = parse(hexText);
  const direct = describeScript(bytes, chain, network);
  const wrappers: ScriptWrapper[] = [];
  if (role === 'spending') {
    const p2sh = Uint8Array.of(0xa9, 0x14, ...hash160(bytes), 0x87);
    const p2shDescription = describeScript(p2sh, chain, network);
    if (bytes.length <= CONSENSUS_LIMITS.maximumScriptElementBytes && p2shDescription.address !== null) wrappers.push({ label: `${chain === 'dash' ? 'Dash' : 'Bitcoin'} P2SH`, address: p2shDescription.address, scriptPubKey: bytesToHex(p2sh) });
    if (chain === 'bitcoin' && bytes.length <= CONSENSUS_LIMITS.maximumScriptBytes) {
      const p2wsh = Uint8Array.of(0x00, 0x20, ...sha256(bytes));
      const description = describeScript(p2wsh, chain, network);
      if (description.address !== null) wrappers.push({ label: 'Bitcoin P2WSH', address: description.address, scriptPubKey: bytesToHex(p2wsh) });
    }
  }
  return {
    hex: bytesToHex(bytes), byteLength: bytes.length,
    asm: operations.map((op) => op.data === null ? op.name : pushedValueAsm(op.data)).join(' '), operations,
    classification: direct.type, directAddress: direct.address, inferredPolicy: infer(operations), wrappers,
  };
}

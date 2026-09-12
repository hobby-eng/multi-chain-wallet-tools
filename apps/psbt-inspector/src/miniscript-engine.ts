import { analyzeMiniscript, compileMiniscript } from '@bitcoinerlab/miniscript';
import { hash160, hexToBytes, secp256k1 } from '@ckd/core/crypto.js';
import { validateMultisigConsensusLimits, type ScriptPolicyContext } from './consensus-limits.js';

export interface CompiledMiniscript {
  readonly script: Uint8Array;
  readonly asm: string;
  readonly analysis: string;
  readonly sane: boolean;
  readonly needsSignature: boolean;
}

export interface ValidatedMiniscript {
  readonly analysis: ReturnType<typeof analyzeMiniscript>;
}

function invalidMiniscript(error: string): Error {
  if (/(?:older|after)\(\).*out of range|timelock/iu.test(error)) {
    return new Error(`Invalid timelock: ${error}.`);
  }
  if (/^[a-z]+: requires/iu.test(error) || /wrapper/iu.test(error)) {
    return new Error(`Invalid wrapper combination: ${error}.`);
  }
  if (/unknown miniscript fragment/iu.test(error)) {
    return new Error(`Unsupported top-level Miniscript: ${error}.`);
  }
  return new Error(`Invalid Miniscript type: ${error}.`);
}

export interface MiniscriptContextOptions {
  readonly tapscript?: boolean;
  readonly allowUncompressed?: boolean;
  readonly context?: ScriptPolicyContext;
}

export function validatePolicyMiniscript(
  miniscript: string,
  options: MiniscriptContextOptions = {},
): ValidatedMiniscript {
  try {
    const context = options.context ?? (options.tapscript === true ? 'tapscript' : 'p2wsh');
    validateMultisigConsensusLimits(miniscript, context);
    const analysis = analyzeMiniscript(miniscript, options);
    if (!analysis.valid) throw invalidMiniscript(analysis.error ?? 'type validation failed');
    return { analysis };
  } catch (error) {
    if (error instanceof Error && /^(?:Invalid|Unsupported) /u.test(error.message)) throw error;
    throw invalidMiniscript(error instanceof Error ? error.message : String(error));
  }
}

const OPCODES: Readonly<Record<string, number>> = {
  OP_0: 0x00,
  OP_IF: 0x63,
  OP_NOTIF: 0x64,
  OP_ELSE: 0x67,
  OP_ENDIF: 0x68,
  OP_VERIFY: 0x69,
  OP_TOALTSTACK: 0x6b,
  OP_FROMALTSTACK: 0x6c,
  OP_IFDUP: 0x73,
  OP_DROP: 0x75,
  OP_DUP: 0x76,
  OP_SWAP: 0x7c,
  OP_SIZE: 0x82,
  OP_EQUAL: 0x87,
  OP_EQUALVERIFY: 0x88,
  OP_0NOTEQUAL: 0x92,
  OP_ADD: 0x93,
  OP_BOOLAND: 0x9a,
  OP_BOOLOR: 0x9b,
  OP_NUMEQUAL: 0x9c,
  OP_NUMEQUALVERIFY: 0x9d,
  OP_LESSTHANOREQUAL: 0xa1,
  OP_RIPEMD160: 0xa6,
  OP_SHA256: 0xa8,
  OP_HASH160: 0xa9,
  OP_HASH256: 0xaa,
  OP_CHECKSIG: 0xac,
  OP_CHECKSIGVERIFY: 0xad,
  OP_CHECKMULTISIG: 0xae,
  OP_CHECKMULTISIGVERIFY: 0xaf,
  OP_CHECKLOCKTIMEVERIFY: 0xb1,
  OP_CHECKSEQUENCEVERIFY: 0xb2,
  OP_CHECKSIGADD: 0xba,
};

function pushData(data: Uint8Array): number[] {
  if (data.length <= 75) return [data.length, ...data];
  if (data.length <= 0xff) return [0x4c, data.length, ...data];
  if (data.length <= 0xffff) return [0x4d, data.length & 0xff, data.length >>> 8, ...data];
  throw new Error('Compiled Miniscript push exceeds the supported Script element size.');
}

function scriptNumberFromPush(hex: string): string | null {
  if (hex.length === 0 || hex.length > 8 || hex.length % 2 !== 0) return null;
  const bytes = hexToBytes(hex);
  const negative = (bytes[bytes.length - 1]! & 0x80) !== 0;
  let value = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = index === bytes.length - 1 ? bytes[index]! & 0x7f : bytes[index]!;
    value += byte * (2 ** (8 * index));
  }
  return String(negative ? -value : value);
}

function normalizeMiniscriptAsm(asm: string): string {
  return asm.split(/\s+/u).filter(Boolean).map((token) => {
    const pushed = /^<([0-9a-fA-F]*)>$/u.exec(token)?.[1];
    return pushed === undefined ? token : scriptNumberFromPush(pushed) ?? token;
  }).join(' ');
}

export function scriptFromMiniscriptAsm(asm: string): Uint8Array {
  const bytes: number[] = [];
  for (const token of asm.split(/\s+/u).filter(Boolean)) {
    const opcode = OPCODES[token];
    if (opcode !== undefined) {
      bytes.push(opcode);
      continue;
    }
    if (/^(?:0|[1-9]|1[0-6])$/u.test(token)) {
      bytes.push(token === '0' ? 0x00 : 0x50 + Number(token));
      continue;
    }
    const pushed = /^<([0-9a-fA-F]*)>$/u.exec(token)?.[1];
    if (pushed !== undefined && pushed.length % 2 === 0) {
      bytes.push(...pushData(hexToBytes(pushed)));
      continue;
    }
    const publicKeyHash = /^<HASH160\(([0-9a-fA-F]{64}|[0-9a-fA-F]{66}|04[0-9a-fA-F]{128})\)>$/u.exec(token)?.[1];
    if (publicKeyHash !== undefined) {
      bytes.push(...pushData(hash160(hexToBytes(publicKeyHash))));
      continue;
    }
    throw new Error(`The Miniscript compiler emitted an unsupported ASM token: ${token}.`);
  }
  return Uint8Array.from(bytes);
}

export function compilePolicyMiniscript(miniscript: string, options: MiniscriptContextOptions = {}): CompiledMiniscript {
  // The compiler type-checks symbols; it does not prove that literal keys
  // are valid points of the required consensus key type.
  for (const match of miniscript.matchAll(/(?:^|[^a-z_])(?:pk|pk_k|pkh|pk_h|multi|multi_a)\(([^()]*)\)/gu)) {
    const values = match[1]!.split(',');
    const keys = match[0]!.includes('multi') ? values.slice(1) : values;
    for (const key of keys) {
      const expected = options.tapscript === true ? /^[0-9a-fA-F]{64}$/u : options.allowUncompressed === true ? /^(?:(?:02|03)[0-9a-fA-F]{64}|04[0-9a-fA-F]{128})$/u : /^(?:02|03)[0-9a-fA-F]{64}$/u;
      if (!expected.test(key)) throw new Error('Invalid public key for the selected Miniscript context.');
      try { secp256k1.Point.fromBytes(hexToBytes(options.tapscript === true ? `02${key}` : key)); }
      catch { throw new Error('Invalid public key: not a secp256k1 point.'); }
    }
  }
  const { analysis } = validatePolicyMiniscript(miniscript, options);
  const compiled = compileMiniscript(miniscript, options);
  if (compiled.asm.length === 0) throw invalidMiniscript(compiled.error ?? 'compilation failed');
  return {
    script: scriptFromMiniscriptAsm(compiled.asm),
    asm: normalizeMiniscriptAsm(compiled.asm),
    sane: analysis.issane,
    needsSignature: analysis.needsSignature,
    analysis: [
      analysis.issane ? 'sane' : `not sane${analysis.error === null ? '' : ` (${analysis.error})`}`,
      analysis.nonMalleable ? 'non-malleable satisfactions available' : 'malleability warning',
      analysis.needsSignature ? 'signature required' : 'no signature required',
      analysis.timelockMix ? 'mixed timelock units' : 'compatible timelock units',
      analysis.hasDuplicateKeys ? 'duplicate keys detected' : 'no duplicate keys',
    ].join(' · '),
  };
}

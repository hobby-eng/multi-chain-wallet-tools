import { equalBytes } from '@ckd/core/bytes.js';
import { bytesToHex, hash160, secp256k1, sha256 } from '@ckd/core/crypto.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { aggregateMusigParticipants } from './musig-psbt.js';
import { CONSENSUS_LIMITS } from './consensus-limits.js';
import { Reader, compactValue, littleU32, type PsbtPair, pair } from './psbt-binary.js';
import { readTxOut } from './transaction.js';

function validatePoint(bytes: Uint8Array, xOnly = false): void {
  if (xOnly && bytes.length !== 32) throw new Error('Taproot public key must contain 32 bytes.');
  if (!xOnly && bytes.length !== 33 && bytes.length !== 65) throw new Error('Invalid PSBT public key length.');
  try {
    secp256k1.Point.fromBytes(xOnly ? Uint8Array.of(2, ...bytes) : bytes);
  } catch {
    throw new Error('Invalid PSBT public key point.');
  }
}
function derivationValue(value: Uint8Array, taproot = false): void {
  const reader = new Reader(value);
  if (taproot) reader.read(reader.compactNumber('Tapleaf hashes') * 32);
  if (reader.remaining < 4 || reader.remaining % 4 !== 0) throw new Error('Invalid BIP32 fingerprint/path length.');
  if ((reader.remaining - 4) / 4 > CONSENSUS_LIMITS.maximumBip32Depth)
    throw new Error('BIP32 key-origin path exceeds the 255-level depth limit.');
}
function validateDerSignature(value: Uint8Array): void {
  // PSBT_IN_PARTIAL_SIG includes the one-byte sighash type after a strict-DER ECDSA signature.
  if (value.length < 9 || value.length > 73)
    throw new Error('PSBT partial signature must contain a strict-DER ECDSA signature and one sighash byte.');
  const der = value.subarray(0, -1);
  if (der[0] !== 0x30 || der[1] !== der.length - 2 || der[2] !== 0x02)
    throw new Error('PSBT partial signature is not strict DER.');
  const rLength = der[3] ?? 0;
  const sTag = 4 + rLength;
  const sLength = der[sTag + 1] ?? 0;
  if (
    rLength === 0 ||
    sTag + 2 > der.length ||
    der[sTag] !== 0x02 ||
    sLength === 0 ||
    sTag + 2 + sLength !== der.length
  ) {
    throw new Error('PSBT partial signature is not strict DER.');
  }
  const rStart = 4;
  const sStart = sTag + 2;
  if ((der[rStart]! & 0x80) !== 0 || (rLength > 1 && der[rStart] === 0 && (der[rStart + 1]! & 0x80) === 0))
    throw new Error('PSBT partial signature has a non-canonical R integer.');
  if ((der[sStart]! & 0x80) !== 0 || (sLength > 1 && der[sStart] === 0 && (der[sStart + 1]! & 0x80) === 0))
    throw new Error('PSBT partial signature has a non-canonical S integer.');
}

export function validateMap(map: readonly PsbtPair[], scope: 'global' | 'input' | 'output'): void {
  const singleton =
    scope === 'global'
      ? [0, 2, 3, 4, 5, 6, 251]
      : scope === 'input'
        ? [0, 1, 3, 4, 5, 7, 8, 9, 14, 15, 16, 17, 18, 19, 23, 24]
        : [0, 1, 3, 4, 5, 6];
  for (const field of map) {
    const { keyData: key, value } = field;
    const type = Number(field.type);
    const size = (n: number): void => {
      if (value.length !== n) throw new Error(`Invalid ${scope} field ${type} value length.`);
    };
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
      const digest =
        type === 10
          ? ripemd160(value)
          : type === 11
            ? sha256(value)
            : type === 12
              ? hash160(value)
              : sha256(sha256(value));
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
    if ((input && type === 23) || (!input && type === 5)) {
      size(32);
      validatePoint(value, true);
    }
    if ((input && type === 22) || (!input && type === 7)) {
      validatePoint(key, true);
      derivationValue(value, true);
    }
    if (input && (type === 19 || type === 20)) {
      if (type === 20) {
        if (key.length !== 64) throw new Error('Taproot script signature key must contain 64 bytes.');
        validatePoint(key.slice(0, 32), true);
      }
      if (value.length !== 64 && value.length !== 65) throw new Error('Taproot signature must contain 64 or 65 bytes.');
      if (value.length === 65 && ![1, 2, 3, 129, 130, 131].includes(value[64]!))
        throw new Error('Invalid explicit Taproot sighash byte.');
    }
    if (input && type === 21) {
      if (
        key.length < 33 ||
        key.length > 33 + CONSENSUS_LIMITS.maximumTaprootTreeDepth * 32 ||
        (key.length - 33) % 32 !== 0
      )
        throw new Error('Invalid Taproot control block length.');
      validatePoint(key.slice(1, 33), true);
      if (value.length === 0 || value[value.length - 1] !== (key[0]! & 0xfe))
        throw new Error('Tapleaf version disagrees with the control block.');
    }
    if (!input && type === 6) {
      const reader = new Reader(value);
      const depths: number[] = [];
      while (reader.remaining > 0) {
        const depth = reader.read(1)[0]!;
        const version = reader.read(1)[0]!;
        if (depth > CONSENSUS_LIMITS.maximumTaprootTreeDepth || (version & 1) !== 0)
          throw new Error('Invalid Taproot tree depth or leaf version.');
        reader.varBytes('Taproot leaf script');
        depths.push(depth);
        while (depths.length > 1 && depths.at(-1) === depths.at(-2)) {
          const current = depths.pop()!;
          depths.pop();
          if (current === 0) throw new Error('Taproot tree contains extra roots.');
          depths.push(current - 1);
        }
      }
      if (depths.length !== 1 || depths[0] !== 0) throw new Error('Incomplete Taproot tree.');
    }
  }
}
export function validateVersionFields(
  global: readonly PsbtPair[],
  inputs: readonly (readonly PsbtPair[])[],
  outputs: readonly (readonly PsbtPair[])[],
  version: number,
): boolean {
  if (version === 0) {
    for (const [maps, types] of [
      [[global], [2n, 3n, 4n, 5n, 6n]],
      [inputs, [14n, 15n, 16n, 17n, 18n]],
      [outputs, [3n, 4n]],
    ] as const) {
      if (maps.some((map) => map.some((field) => types.some((type) => field.type === type))))
        throw new Error('PSBT v0 contains a PSBT v2-only field.');
    }
    return false;
  }
  if (pair(global, 2) === undefined) throw new Error('PSBT v2 is missing its transaction version.');
  let requiresTime = false;
  let requiresHeight = false;
  for (const map of inputs) {
    if (pair(map, 14) === undefined || pair(map, 15) === undefined)
      throw new Error('PSBT v2 input is missing its previous transaction ID or output index.');
    const time = pair(map, 17);
    const height = pair(map, 18);
    if (time !== undefined) {
      if (littleU32(time.value, 'time lock') < CONSENSUS_LIMITS.absoluteLockTimeThreshold)
        throw new Error('Required time lock is below 500000000.');
      requiresTime = true;
    }
    if (height !== undefined) {
      const value = littleU32(height.value, 'height lock');
      if (value === 0 || value >= CONSENSUS_LIMITS.absoluteLockTimeThreshold)
        throw new Error('Required height lock is outside 1..499999999.');
      requiresHeight = true;
    }
  }
  const mixedLockKinds = requiresTime && requiresHeight;
  if (outputs.some((map) => pair(map, 3) === undefined || pair(map, 4) === undefined))
    throw new Error('PSBT v2 output is missing its amount or script.');
  return mixedLockKinds;
}

function validateCompressedPublicKey(value: Uint8Array, label: string): void {
  if (value.length !== 33 || (value[0] !== 0x02 && value[0] !== 0x03))
    throw new Error(`${label} must be a 33-byte compressed public key.`);
  try {
    secp256k1.Point.fromBytes(value);
  } catch {
    throw new Error(`${label} is not a valid secp256k1 point.`);
  }
}

function validateMusigReferenceKey(keyData: Uint8Array, label: string): void {
  if (keyData.length !== 66 && keyData.length !== 98) {
    throw new Error(
      `${label} key data must contain participant and aggregate public keys, plus an optional 32-byte Tapleaf hash.`,
    );
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
        throw new Error(
          `PSBT ${scope} MuSig2 participant list must contain one or more 33-byte compressed public keys.`,
        );
      }
      const participants: Uint8Array[] = [];
      for (let offset = 0; offset < item.value.length; offset += 33) {
        const participant = item.value.slice(offset, offset + 33);
        validateCompressedPublicKey(participant, `PSBT ${scope} MuSig2 participant ${offset / 33 + 1}`);
        participants.push(participant);
      }
      const computed = aggregateMusigParticipants(participants);
      if (!equalBytes(computed, item.keyData))
        throw new Error(`PSBT ${scope} MuSig2 aggregate key does not match KeyAgg(participants).`);
      participantsByAggregate.set(bytesToHex(item.keyData), new Set(participants.map(bytesToHex)));
    } else if (scope === 'input' && item.type === 0x1bn) {
      validateMusigReferenceKey(item.keyData, 'PSBT input MuSig2 public nonce');
      if (item.value.length !== 66)
        throw new Error('PSBT input MuSig2 public nonce value must contain exactly 66 bytes.');
      validateCompressedPublicKey(item.value.slice(0, 33), 'MuSig2 nonce R1');
      validateCompressedPublicKey(item.value.slice(33), 'MuSig2 nonce R2');
    } else if (scope === 'input' && item.type === 0x1cn) {
      validateMusigReferenceKey(item.keyData, 'PSBT input MuSig2 partial signature');
      if (item.value.length !== 32)
        throw new Error('PSBT input MuSig2 partial signature value must contain exactly 32 bytes.');
      if (BigInt(`0x${bytesToHex(item.value)}`) >= secp256k1.Point.Fn.ORDER)
        throw new Error('MuSig2 partial signature scalar is out of range.');
    }
  }
  if (scope === 'input') {
    for (const item of map) {
      if (item.type !== 0x1bn && item.type !== 0x1cn) continue;
      const participant = bytesToHex(item.keyData.slice(0, 33));
      const aggregate = bytesToHex(item.keyData.slice(33, 66));
      const known = participantsByAggregate.get(aggregate);
      if (known !== undefined && !known.has(participant)) {
        throw new Error(
          `PSBT input MuSig2 ${item.type === 0x1bn ? 'public nonce' : 'partial signature'} participant is absent from the aggregate participant list.`,
        );
      }
    }
  }
}

import { bytewords } from './bytewords-list.js';

const CHECKSUM_BYTES = 4;
const MAX_TRANSPORT_BYTES = 128;
const CRC32_INITIAL = 0xffffffff;
const CRC32_REFLECTED_POLYNOMIAL = 0xedb88320;
const CBOR_UINT16_TAG = 0xd9;
const CBOR_TAG_BYTES = 3;
const SSKR_CBOR_TAGS = new Set([40309, 309]);
const SHARE_METADATA_BYTES = 5;
const SHARE_LENGTHS = new Set([21, 25, 29, 33, 37]);
const LOW_NIBBLE_MASK = 0x0f;
const COLOR_VERSION = 0xa1;
const COLOR_HEADER_BYTES = 2;
const RGB_BYTES = 3;
const MAX_COLOR_TEXT_LENGTH = 1024;
const MAX_SHARE_COUNT = 256;

const minimalBytewords = bytewords.map((word) => word[0]! + word[3]!);
const minimalBytewordValues = new Map(minimalBytewords.map((word, index) => [word, index]));
const fullBytewordValues = new Map<string, number>(bytewords.map((word, index) => [word, index]));

function crc32(bytes: Uint8Array): number {
  let crc = CRC32_INITIAL;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      const polynomial = crc & 1 ? CRC32_REFLECTED_POLYNOMIAL : 0;
      crc = (crc >>> 1) ^ polynomial;
    }
  }
  return (crc ^ CRC32_INITIAL) >>> 0;
}

function validateTransportChecksum(bytes: Uint8Array): void {
  if (bytes.length < CHECKSUM_BYTES + 1 || bytes.length > MAX_TRANSPORT_BYTES) {
    throw new Error('Invalid SSKR transport length.');
  }
  const checksumOffset = bytes.length - CHECKSUM_BYTES;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const recordedChecksum = view.getUint32(checksumOffset);
  if (crc32(bytes.subarray(0, checksumOffset)) !== recordedChecksum) {
    throw new Error('SSKR transport checksum does not match.');
  }
}

function addTransportChecksum(payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(payload.length + CHECKSUM_BYTES);
  bytes.set(payload);
  new DataView(bytes.buffer).setUint32(payload.length, crc32(payload));
  return bytes;
}

/** Only the definite byte-string CBOR form used by SSKR is accepted. */
function sharePayload(transport: Uint8Array): Uint8Array {
  validateTransportChecksum(transport);
  const cbor = transport.subarray(0, -CHECKSUM_BYTES);
  let offset = 0;
  if (cbor[0] === CBOR_UINT16_TAG) {
    const tag = (cbor[1]! << 8) | cbor[2]!;
    if (!SSKR_CBOR_TAGS.has(tag)) throw new Error('Not an SSKR CBOR tag.');
    offset = CBOR_TAG_BYTES;
  }
  const header = cbor[offset++]!;
  let payloadLength = -1;
  if (header >= 0x40 && header <= 0x57) {
    payloadLength = header - 0x40;
  } else if (header === 0x58) {
    payloadLength = cbor[offset++]!;
  }
  if (payloadLength !== cbor.length - offset || !SHARE_LENGTHS.has(payloadLength)) {
    throw new Error('Invalid SSKR share byte string.');
  }
  return cbor.subarray(offset);
}

export interface ShareInfo {
  readonly identifier: number;
  readonly groupThreshold: number;
  readonly groupCount: number;
  readonly groupIndex: number;
  readonly memberThreshold: number;
  readonly memberIndex: number;
  readonly secretLength: number;
}

/** Thresholds and group count are stored minus one; member/group indexes are zero-based. */
export function shareInfo(transport: Uint8Array): ShareInfo {
  const payload = sharePayload(transport);
  const info: ShareInfo = {
    identifier: (payload[0]! << 8) | payload[1]!,
    groupThreshold: (payload[2]! >>> 4) + 1,
    groupCount: (payload[2]! & LOW_NIBBLE_MASK) + 1,
    groupIndex: payload[3]! >>> 4,
    memberThreshold: (payload[3]! & LOW_NIBBLE_MASK) + 1,
    memberIndex: payload[4]! & LOW_NIBBLE_MASK,
    secretLength: payload.length - SHARE_METADATA_BYTES,
  };
  const reservedBits = payload[4]! >>> 4;
  if (
    reservedBits !== 0 ||
    info.groupThreshold > info.groupCount ||
    info.groupIndex >= info.groupCount
  ) {
    throw new Error('Invalid SSKR share metadata.');
  }
  return info;
}

export function urToTransport(value: string): Uint8Array {
  const match = /^ur:sskr\/([a-z]+)$/iu.exec(value.trim());
  const body = match?.[1];
  if (!body || body.length % 2 !== 0 || body.length > MAX_TRANSPORT_BYTES * 2) {
    throw new Error('Expected a single-part ur:sskr record.');
  }
  const pairs = body.toLowerCase().match(/../gu)!;
  const bytes = Uint8Array.from(pairs, (pair) => {
    const byte = minimalBytewordValues.get(pair);
    if (byte === undefined) throw new Error('Unknown Bytewords pair in SSKR record.');
    return byte;
  });
  shareInfo(bytes);
  return bytes;
}

export function transportToUr(bytes: Uint8Array): string {
  shareInfo(bytes);
  // A UR's type supplies the CBOR tag. Standard Bytewords contains the tag explicitly.
  const canonicalBytes =
    bytes[0] === CBOR_UINT16_TAG
      ? addTransportChecksum(bytes.subarray(CBOR_TAG_BYTES, -CHECKSUM_BYTES))
      : bytes;
  const minimalText = Array.from(canonicalBytes, (byte) => minimalBytewords[byte]!).join('');
  return `ur:sskr/${minimalText}`;
}

export function bytewordsToUr(value: string): string {
  const words = value
    .trim()
    .toLowerCase()
    .split(/[\s-]+/u);
  if (words.length > MAX_TRANSPORT_BYTES) throw new Error('SSKR record is too long.');
  const bytes = Uint8Array.from(words, (word) => {
    const byte = fullBytewordValues.get(word);
    if (byte === undefined) throw new Error('Unknown SSKR Byteword.');
    return byte;
  });
  return transportToUr(bytes);
}

function paddedColorLength(payloadLength: number): number {
  return Math.ceil((payloadLength + COLOR_HEADER_BYTES) / RGB_BYTES) * RGB_BYTES;
}

function colorHex(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `#${hex.toUpperCase()}`;
}

/** Version 1: A1, byte length, original UR bytewords bytes including CRC, zero padding. */
export function shareToColors(ur: string): string[] {
  const payload = urToTransport(ur);
  const bytes = new Uint8Array(paddedColorLength(payload.length));
  bytes[0] = COLOR_VERSION;
  bytes[1] = payload.length;
  bytes.set(payload, COLOR_HEADER_BYTES);
  const colors: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += RGB_BYTES) {
    colors.push(colorHex(bytes.subarray(offset, offset + RGB_BYTES)));
  }
  return colors;
}

function parseColorBytes(value: string): Uint8Array {
  const input = value.trim();
  const prefixedCodes = /^(?:#[0-9a-f]{6}\s*)+$/iu.test(input);
  const plainCodes = /^(?:[0-9a-f]{6}\s*)+$/iu.test(input);
  if (!input || input.length > MAX_COLOR_TEXT_LENGTH || (!prefixedCodes && !plainCodes)) {
    throw new Error('Invalid SSKR RGB codes. Preserve their printed order.');
  }
  const hex = input.replace(/[#\s]/gu, '');
  return Uint8Array.from(hex.match(/../gu)!, (pair) => parseInt(pair, 16));
}

export function colorsToShare(value: string): string {
  const bytes = parseColorBytes(value);
  const payloadLength = bytes[1]!;
  const payloadEnd = COLOR_HEADER_BYTES + payloadLength;
  const paddingIsZero = bytes.subarray(payloadEnd).every((byte) => byte === 0);
  if (
    bytes[0] !== COLOR_VERSION ||
    payloadLength < CHECKSUM_BYTES + 1 ||
    bytes.length !== paddedColorLength(payloadLength) ||
    !paddingIsZero
  ) {
    throw new Error('Unsupported or truncated SSKR color record.');
  }
  return transportToUr(bytes.subarray(COLOR_HEADER_BYTES, payloadEnd));
}

export function normalizeShare(value: string): string {
  const text = value.trim();
  if (/^ur:/iu.test(text)) return transportToUr(urToTransport(text));
  if (/^[#0-9a-f\s]+$/iu.test(text)) return colorsToShare(text);
  return bytewordsToUr(text);
}

function assertSameSet(info: ShareInfo, expected: ShareInfo): void {
  if (
    info.identifier !== expected.identifier ||
    info.groupThreshold !== expected.groupThreshold ||
    info.groupCount !== expected.groupCount ||
    info.secretLength !== expected.secretLength
  ) {
    throw new Error('SSKR shares belong to different sets.');
  }
}

/** Reject mixed sets and duplicate members before asking the cryptographic engine. */
export function validateShareSet(records: readonly string[], requireQuorum = true): string[] {
  if (!records.length || records.length > MAX_SHARE_COUNT) {
    throw new Error('Provide between 1 and 256 SSKR shares.');
  }
  const shares = records.map(normalizeShare);
  const infos = shares.map((share) => shareInfo(urToTransport(share)));
  const first = infos[0]!;
  const seenMembers = new Set<string>();
  const groups = new Map<number, { threshold: number; members: number }>();
  for (const info of infos) {
    assertSameSet(info, first);
    const memberKey = `${info.groupIndex}:${info.memberIndex}`;
    if (seenMembers.has(memberKey))
      throw new Error('The same SSKR member was supplied more than once.');
    seenMembers.add(memberKey);
    const group = groups.get(info.groupIndex) ?? { threshold: info.memberThreshold, members: 0 };
    if (group.threshold !== info.memberThreshold)
      throw new Error('Conflicting SSKR group thresholds.');
    group.members += 1;
    groups.set(info.groupIndex, group);
  }
  const completeGroups = [...groups.values()].filter(
    (group) => group.members >= group.threshold,
  ).length;
  if (requireQuorum && completeGroups < first.groupThreshold) {
    throw new Error('Not enough SSKR shares to meet the recorded threshold.');
  }
  return shares;
}

const MEMO_BYTES = 36;
const PAYLOAD_OFFSET = 4;

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * A memo is attacker-supplied text from the chain. Rendering happens through
 * `textContent`, so there is no script risk, but bidirectional overrides and
 * other invisible format/control characters can still reorder what the reader
 * sees around them and forge a neighbouring address or amount. Strip them and
 * keep the printable content; `memoHex` remains available for the raw bytes.
 */
function stripDisplayControls(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, '');
}

/** Decodes the official 4-byte-kind + 32-byte-payload Dash shielded memo. */
export function decodeDashShieldedMemo(bytes: Uint8Array): string {
  if (bytes.length !== MEMO_BYTES) throw new Error('Dash shielded memo must contain 36 bytes.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = view.getUint32(0, true);
  const payload = bytes.slice(PAYLOAD_OFFSET);
  let end = payload.length;
  while (end > 0 && payload[end - 1] === 0) end -= 1;

  if (kind === 0 && end === 0) return '';
  if (kind === 1) {
    const decoded = decodeUtf8(payload.slice(0, end));
    if (decoded !== undefined) return stripDisplayControls(decoded);
  }
  return `Raw memo kind ${kind}`;
}

export function formatPlatformCredits(value: bigint): string {
  if (value < 0n) throw new Error('Platform credit value cannot be negative.');
  return formatDashCredits(value);
}
import { formatDashCredits } from '@ckd/core/dash-units.js';

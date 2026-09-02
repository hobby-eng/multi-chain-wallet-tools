import { bytesToHex, wipe } from '@ckd/core/crypto.js';

interface SecretCandidate {
  label: string;
  value: string;
  substringSafe: boolean;
}

function normalizedString(value: string): string {
  return value.normalize('NFKD');
}

/** Alphanumeric-only projection, so separators cannot hide a registered value. */
function compactedString(value: string): string {
  return value.replace(/[^0-9a-z]+/giu, '');
}

/**
 * Candidate views of one outbound string.
 *
 * A raw substring search only catches material that leaves verbatim. The
 * cheapest evasions are transport encodings applied on the way out, so every
 * outbound string is also compared after percent-decoding, after base64
 * decoding, and with every separator removed. This is a tripwire, not a
 * boundary: an encoding not listed here, a cipher, or a value split across
 * fields still passes, which is why the guard never substitutes for keeping
 * secrets away from the network layer.
 */
function candidateViews(raw: string): string[] {
  const views = new Set<string>();
  const add = (value: string): void => {
    if (value.length === 0) return;
    views.add(value);
    views.add(compactedString(value));
  };
  const normalized = normalizedString(raw);
  add(normalized);
  if (normalized.includes('%')) {
    try {
      add(normalizedString(decodeURIComponent(normalized)));
    } catch {
      // A malformed percent sequence is compared in its raw form only.
    }
  }
  if (/^[0-9a-z+/=_-]{12,}$/iu.test(normalized.trim())) {
    try {
      const base64 = normalized.trim().replaceAll('-', '+').replaceAll('_', '/');
      add(normalizedString(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))));
    } catch {
      // Not valid base64: the raw form has already been added.
    }
  }
  return [...views];
}

function collectStrings(value: unknown, output: string[], seen = new Set<object>()): void {
  if (typeof value === 'string') {
    output.push(value);
    return;
  }
  if (value === null || value === undefined || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (value instanceof Uint8Array) {
    output.push(bytesToHex(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output, seen);
    return;
  }
  for (const item of Object.values(value as Record<string, unknown>)) collectStrings(item, output, seen);
}

/**
 * Runtime tripwire for an outbound boundary. Per-wallet instances are cleared
 * after scanning; the run-level instance prevalidates both report formats and
 * is then cleared before either cached public report can be downloaded.
 */
export class SecretEgressGuard {
  readonly #candidates: SecretCandidate[] = [];

  registerString(label: string, value: string): void {
    if (value.length === 0) return;
    const normalized = normalizedString(value);
    this.#candidates.push({ label, value: normalized, substringSafe: normalized.length >= 8 });
    const compact = compactedString(normalized);
    if (compact !== normalized && compact.length >= 8) {
      this.#candidates.push({ label: `${label} (compact)`, value: compact, substringSafe: true });
    }
  }

  registerBytes(label: string, bytes: Uint8Array): void {
    const hex = bytesToHex(bytes);
    this.#candidates.push({ label: `${label} (hex)`, value: hex, substringSafe: true });
  }

  assertPublic(value: unknown, context: string): void {
    const strings: string[] = [];
    collectStrings(value, strings);
    for (const raw of strings) {
      for (const candidateValue of candidateViews(raw)) {
        for (const secret of this.#candidates) {
          const leaked = candidateValue === secret.value
            || (secret.substringSafe && candidateValue.includes(secret.value));
          if (leaked) {
            throw new Error(`Blocked ${context}: it contained registered secret material (${secret.label}).`);
          }
        }
      }
    }
  }

  clear(): void {
    this.#candidates.length = 0;
  }
}

export function disposeSecretBytes(...values: Array<Uint8Array | undefined>): void {
  wipe(...values.filter((value): value is Uint8Array => value !== undefined));
}

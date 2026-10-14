import { bytesToHex, wipe } from "@ckd/core/crypto.js";
import { base64, base64url } from "@scure/base";

interface SecretCandidate {
  label: string;
  value: string;
  substringSafe: boolean;
  ignoreCase?: boolean;
}

function normalizedString(value: string): string {
  return value.normalize("NFKD");
}

function compactedString(value: string): string {
  return value.replace(/[^0-9a-z]+/giu, "");
}

/**
 * Compare several cheap transport views because a public DTO can accidentally
 * carry a secret after URL/base64 encoding or separator insertion. This is a
 * defense-in-depth tripwire, not the boundary itself: secrets must be kept out
 * of the network layer by the protocol and isolated worker design.
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
  // A malformed percent escape elsewhere in a CSV must not hide a valid encoded cell.
  add(normalized.replace(/%[0-9a-f]{2}/giu, (escape) => escape.toUpperCase()));
  if (normalized.includes("%")) {
    try {
      add(normalizedString(decodeURIComponent(normalized)));
    } catch {
      /* raw form remains covered */
    }
  }
  if (/^[0-9a-z+/=_-]{12,}$/iu.test(normalized.trim())) {
    try {
      const base64 = normalized.trim().replaceAll("-", "+").replaceAll("_", "/");
      add(normalizedString(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))));
    } catch {
      /* raw form remains covered */
    }
  }
  return [...views];
}

function collectStrings(value: unknown, output: string[], seen = new Set<object>()): void {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (value === null || value === undefined || typeof value !== "object") return;
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
  for (const item of Object.values(value as Record<string, unknown>))
    collectStrings(item, output, seen);
}

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
    // Encoded input may preserve composed text even when the wallet normalizes it for its KDF.
    for (const text of new Set([value, normalized])) {
      const bytes = new TextEncoder().encode(text);
      try {
        this.#encodedBytes(label, bytes);
        try {
          const encoded = encodeURIComponent(text);
          if (encoded !== text)
            this.#candidates.push({ label, value: encoded, substringSafe: encoded.length >= 8 });
        } catch {
          // A lone UTF-16 surrogate has no URI encoding; raw and UTF-8 transport views still apply.
        }
      } finally {
        wipe(bytes);
      }
    }
  }

  registerBytes(label: string, bytes: Uint8Array): void {
    if (bytes.length === 0) return;
    this.#candidates.push({
      label: `${label} (hex)`,
      value: bytesToHex(bytes),
      substringSafe: true,
      ignoreCase: true,
    });
    this.#encodedBytes(label, bytes);
  }

  #encodedBytes(label: string, bytes: Uint8Array): void {
    const encodings = new Set([base64.encode(bytes), base64url.encode(bytes)]);
    for (const encoded of [...encodings]) encodings.add(encoded.replace(/=+$/u, ""));
    for (const value of encodings)
      this.#candidates.push({ label, value, substringSafe: value.length >= 8 });
  }

  assertPublic(value: unknown, context: string): void {
    const strings: string[] = [];
    collectStrings(value, strings);
    for (const raw of strings) {
      for (const candidateValue of candidateViews(raw)) {
        for (const secret of this.#candidates) {
          const view = secret.ignoreCase ? candidateValue.toLowerCase() : candidateValue;
          if (view === secret.value || (secret.substringSafe && view.includes(secret.value))) {
            throw new Error(
              `Blocked ${context}: it contained registered secret material (${secret.label}).`,
            );
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

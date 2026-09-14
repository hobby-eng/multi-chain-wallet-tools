const MAX_ERROR_MESSAGE = 600;

function readablePrimitive(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  return null;
}

export function describeUnknownError(cause: unknown, fallback = 'Unknown error'): string {
  // WASM-bindgen failures may be freeable plain objects rather than Error
  // instances; inspect public fields before the owner disposes the object.
  if (cause instanceof DOMException && cause.name === 'AbortError') return 'Operation cancelled.';
  if (cause instanceof Error) return cause.message || cause.name || fallback;
  const direct = readablePrimitive(cause);
  if (direct !== null) return direct;
  if (typeof cause !== 'object' || cause === null) return fallback;
  const parts: string[] = [];
  for (const key of ['name', 'message', 'code', 'kind', 'status', 'details'] as const) {
    try {
      const value = readablePrimitive((cause as Record<string, unknown>)[key]);
      if (value !== null && !parts.includes(value)) parts.push(key === 'message' ? value : `${key}: ${value}`);
    } catch {
      /* A consumed native/WASM object may throw from getters. */
    }
  }
  return (parts.join(' · ') || fallback).slice(0, MAX_ERROR_MESSAGE);
}

export function freeThrownValue(cause: unknown): void {
  if (typeof cause !== 'object' || cause === null) return;
  try {
    const free = (cause as { free?: unknown }).free;
    if (typeof free === 'function') free.call(cause);
  } catch {
    /* Error cleanup must not mask the original failure. */
  }
}

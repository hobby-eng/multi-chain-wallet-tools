const MAX_ERROR_MESSAGE = 600;

function readablePrimitive(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  return null;
}

/**
 * wasm-bindgen errors are sometimes plain freeable objects rather than native
 * Error instances. Read their public getters before the owner frees them, and
 * never degrade a useful DAPI failure to the string "[object Object]".
 */
export function describeUnknownError(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === 'AbortError') return 'Recovery network operation cancelled.';
  if (cause instanceof Error) return cause.message || cause.name || 'Unknown Error';
  const direct = readablePrimitive(cause);
  if (direct !== null) return direct;
  if (typeof cause !== 'object' || cause === null) return 'Unknown error';

  const parts: string[] = [];
  for (const key of ['name', 'message', 'code', 'kind', 'status', 'details'] as const) {
    try {
      const value = readablePrimitive((cause as Record<string, unknown>)[key]);
      if (value !== null && !parts.includes(value)) parts.push(key === 'message' ? value : `${key}: ${value}`);
    } catch {
      // A consumed wasm-bindgen object can throw from a getter. Other fields
      // may still carry enough context for a useful diagnostic.
    }
  }
  const message = parts.join(' · ');
  return (message || 'Unclassified object error').slice(0, MAX_ERROR_MESSAGE);
}

export function freeThrownValue(cause: unknown): void {
  if (typeof cause !== 'object' || cause === null) return;
  try {
    const free = (cause as { free?: unknown }).free;
    if (typeof free === 'function') free.call(cause);
  } catch {
    // Diagnostics must not be replaced by a secondary disposer failure.
  }
}

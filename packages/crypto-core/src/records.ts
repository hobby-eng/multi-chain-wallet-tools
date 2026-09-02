/** Rejects arrays and null at untrusted JSON/structured-clone boundaries. */
export function requireRecord(value: unknown, malformedMessage: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(malformedMessage);
  }
  return value as Record<string, unknown>;
}

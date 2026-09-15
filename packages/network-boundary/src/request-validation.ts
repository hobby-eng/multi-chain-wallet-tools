import type { RecoveryNetwork, RecoveryNetworkRequest } from './protocol.js';

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/u;

export type NetworkPayloadValidator = (value: unknown) => void;
export type NetworkOperationValidators = Readonly<Record<string, NetworkPayloadValidator>>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) {
    throw new Error(`${label} contains unsupported fields.`);
  }
}

export function exactNetworkPayload(value: unknown, expected: readonly string[]): Record<string, unknown> {
  const parsed = record(value, 'Network request payload');
  exactKeys(parsed, expected, 'Network request payload');
  return parsed;
}

export function assertRecoveryNetwork(value: unknown): asserts value is RecoveryNetwork {
  if (value !== 'mainnet' && value !== 'testnet') throw new Error('Network must be mainnet or testnet.');
}

export function assertPublicToken(value: unknown, label: string, maximum = 2048): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || /\s/u.test(value)) {
    throw new Error(`${label} must be one bounded public value without whitespace.`);
  }
}

export function assertPublicTokenBatch(value: unknown, maximum: number): asserts value is string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) {
    throw new Error(`Address batch must contain between 1 and ${maximum} entries.`);
  }
  for (const entry of value) assertPublicToken(entry, 'Address');
}

export function assertHex(value: unknown, bytes: number, label: string): asserts value is string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'iu').test(value)) {
    throw new Error(`${label} is invalid.`);
  }
}

export function assertDecimal(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,19})$/u.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
}

export function assertIntegerRange(value: unknown, minimum: number, maximum: number, label: string): void {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
}

/**
 * Validates the untrusted MessagePort envelope and delegates its payload to the
 * exact operation allowlist supplied by the concrete build. Coin and provider
 * names deliberately live outside this transport package.
 */
export function validateNetworkRequest(value: unknown, validators: NetworkOperationValidators): RecoveryNetworkRequest {
  const request = record(value, 'Network request');
  exactKeys(request, ['id', 'operation', 'payload'], 'Network request');
  if (typeof request.id !== 'string' || !REQUEST_ID.test(request.id)) throw new Error('Network request id is invalid.');
  if (typeof request.operation !== 'string') throw new Error('Network request operation is invalid.');
  const validatePayload = validators[request.operation];
  if (validatePayload === undefined) throw new Error('Network request operation is not supported by this build.');
  validatePayload(request.payload);
  return request as unknown as RecoveryNetworkRequest;
}

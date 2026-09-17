import type { RecoveryNetwork } from '@ckd/network-boundary/protocol.js';

const PUBLIC_KEY_HASH_PATTERN = /^[0-9a-f]{40}$/u;
export const TRANSACTION_HASH_PATTERN = /^[0-9a-f]{64}$/u;
export const POOL_POSITION_PATTERN = /^(0|[1-9][0-9]*)$/u;
export const PLATFORM_IDENTIFIER_PATTERN = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{44}$/u;

export function assertNetwork(value: unknown): asserts value is RecoveryNetwork {
  if (value !== 'mainnet' && value !== 'testnet') throw new Error('Network Worker rejected an unsupported network.');
}

export function assertHash(hash: unknown): asserts hash is string {
  if (typeof hash !== 'string' || !TRANSACTION_HASH_PATTERN.test(hash)) {
    throw new Error('Network Worker rejected an invalid transaction hash.');
  }
}

export function assertAddressBatch(
  addresses: unknown,
  network: RecoveryNetwork,
  validate: (address: string, network: RecoveryNetwork) => string,
  label: string,
  maximum: number,
): asserts addresses is string[] {
  if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > maximum) {
    throw new Error(`Network Worker requires 1 to ${maximum} ${label} addresses per request.`);
  }
  for (const address of addresses) {
    if (typeof address !== 'string') throw new Error(`Network Worker rejected an invalid ${label} address.`);
    try {
      if (validate(address, network) !== address) throw new Error('Address normalization changed the value.');
    } catch {
      throw new Error(`Network Worker rejected an invalid ${label} address.`);
    }
  }
}

export function assertSingleAddress(
  address: unknown,
  network: RecoveryNetwork,
  validate: (value: string, network: RecoveryNetwork) => string,
  label: string,
): asserts address is string {
  if (typeof address !== 'string') throw new Error(`Network Worker rejected an invalid ${label} address.`);
  try {
    if (validate(address, network) !== address) throw new Error('Address normalization changed the value.');
  } catch {
    throw new Error(`Network Worker rejected an invalid ${label} address.`);
  }
}

export function publicKeyHashBytes(hex: string): Uint8Array {
  if (!PUBLIC_KEY_HASH_PATTERN.test(hex))
    throw new Error('Network Worker requires a 20-byte lowercase public-key hash.');
  const bytes = new Uint8Array(20);
  for (let offset = 0; offset < bytes.length; offset += 1) {
    bytes[offset] = Number.parseInt(hex.slice(offset * 2, offset * 2 + 2), 16);
  }
  return bytes;
}

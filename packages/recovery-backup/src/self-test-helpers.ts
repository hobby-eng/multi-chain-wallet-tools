import { bytesToHex } from '@noble/hashes/utils.js';

export function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export function expectText(label: string, actual: string, expected: string): void {
  if (actual !== expected) throw new Error('Recovery self-test failed: ' + label + '.');
}

export function expectBytes(label: string, actual: Uint8Array, expected: Uint8Array): void {
  expectText(label, bytesToHex(actual), bytesToHex(expected));
}

export function deterministicRandom(): (length: number) => Uint8Array {
  let counter = 0;
  return (length) => Uint8Array.from({ length }, () => (counter++ * 29 + 17) & 0xff);
}

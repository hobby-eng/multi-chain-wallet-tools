import { describe, expect, it } from 'vitest';
import {
  assertCanonicalWasmBindgenProducer,
  CANONICAL_WASM_BINDGEN_VERSION,
  readWasmProducers,
} from './verify-wasm-producers.mjs';

function uleb(value) {
  const result = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) byte |= 0x80;
    result.push(byte);
  } while (value !== 0);
  return result;
}

function text(value) {
  const bytes = [...new TextEncoder().encode(value)];
  return [...uleb(bytes.length), ...bytes];
}

function moduleWithProducer(version) {
  const payload = [...uleb(1), ...text('processed-by'), ...uleb(1), ...text('wasm-bindgen'), ...text(version)];
  const custom = [...text('producers'), ...payload];
  return new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x00, ...uleb(custom.length), ...custom]);
}

describe('canonical WASM producer metadata', () => {
  it('accepts the exact crates.io wasm-bindgen release', () => {
    const bytes = moduleWithProducer(CANONICAL_WASM_BINDGEN_VERSION);
    expect(readWasmProducers(bytes).get('processed-by')?.get('wasm-bindgen')).toBe('0.2.128');
    expect(() => assertCanonicalWasmBindgenProducer(bytes)).not.toThrow();
  });

  it('rejects a source-built CLI carrying Git metadata', () => {
    expect(() => assertCanonicalWasmBindgenProducer(moduleWithProducer('0.2.128 (92201b377)'))).toThrow(
      /crates\.io wasm-bindgen 0\.2\.128/u,
    );
  });

  it('rejects a module without producer provenance', () => {
    const emptyModule = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    expect(() => assertCanonicalWasmBindgenProducer(emptyModule)).toThrow(/producers section/u);
  });
});

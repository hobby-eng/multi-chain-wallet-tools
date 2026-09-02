import { describe, expect, it } from 'vitest';
import { addDescriptorChecksum, descriptorChecksum } from '../src/descriptor.js';

describe('BIP380 descriptor checksum', () => {
  it('matches the official BIP380 checksum vector', () => {
    expect(descriptorChecksum('raw(deadbeef)')).toBe('89f8spxm');
    expect(addDescriptorChecksum('raw(deadbeef)')).toBe('raw(deadbeef)#89f8spxm');
  });

  it('rejects an existing checksum and characters outside the BIP380 alphabet', () => {
    expect(() => descriptorChecksum('raw(deadbeef)#89f8spxm')).toThrow(/already contain/u);
    expect(() => descriptorChecksum('raw(\u00dc)')).toThrow(/unsupported character/u);
  });
});

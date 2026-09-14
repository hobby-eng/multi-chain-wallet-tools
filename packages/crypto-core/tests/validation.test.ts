import { describe, expect, it } from 'vitest';
import { parseConcurrency, parseInteger } from '../src/validation.js';

describe('shared numeric validation', () => {
  it('accepts bounded values and rejects unsafe/negative values', () => {
    expect(parseInteger('0', 'Account')).toBe(0);
    expect(parseInteger('4', 'Account', 1)).toBe(4);
    expect(parseConcurrency('5')).toBe(5);
    expect(() => parseInteger('-1', 'Account')).toThrow(/at least 0/iu);
    expect(() => parseInteger('1.5', 'Account')).toThrow(/whole number/iu);
    expect(() => parseConcurrency('0')).toThrow(/1 to 5/iu);
    expect(() => parseConcurrency('6')).toThrow(/1 to 5/iu);
  });
});

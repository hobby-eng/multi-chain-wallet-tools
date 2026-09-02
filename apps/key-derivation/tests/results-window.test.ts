import { describe, expect, it } from 'vitest';
import { normalizeResultWindow } from '../src/ui/results.js';

describe('result DOM windowing', () => {
  it('normalizes navigation to bounded pages', () => {
    expect(normalizeResultWindow(10_000, 0, 200)).toEqual({ start: 0, end: 200, size: 200 });
    expect(normalizeResultWindow(10_000, 275, 200)).toEqual({ start: 200, end: 400, size: 200 });
    expect(normalizeResultWindow(10_000, 99_999, 200)).toEqual({ start: 9_800, end: 10_000, size: 200 });
  });

  it('keeps advanced pages small and handles empty results', () => {
    expect(normalizeResultWindow(101, 96, 24)).toEqual({ start: 96, end: 101, size: 24 });
    expect(normalizeResultWindow(0, 100, 0)).toEqual({ start: 0, end: 0, size: 1 });
  });
});

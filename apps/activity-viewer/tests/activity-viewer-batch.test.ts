import { describe, expect, it } from 'vitest';
import {
  mapViewerBatchTasks,
  parseViewerBatchInputs,
  parseViewerConcurrency,
} from '../src/batch.js';

describe('Activity Viewer batch helpers', () => {
  it('keeps source lines, removes blank lines, and de-duplicates exact inputs', () => {
    expect(parseViewerBatchInputs(' first\n\nsecond\r\nfirst\n third ')).toEqual([
      { id: 'query-1', line: 1, value: 'first' },
      { id: 'query-2', line: 3, value: 'second' },
      { id: 'query-3', line: 5, value: 'third' },
    ]);
  });

  it('rejects empty batches and invalid concurrency', () => {
    expect(() => parseViewerBatchInputs('\n  \n')).toThrow('at least one lookup value');
    expect(() => parseViewerConcurrency('0')).toThrow('1 to 5');
    expect(() => parseViewerConcurrency('6')).toThrow('1 to 5');
    expect(parseViewerConcurrency('3')).toBe(3);
  });

  it('preserves input order and isolates task failures', async () => {
    let active = 0;
    let highestActive = 0;
    const results = await mapViewerBatchTasks([30, 10, 20], 2, async (delay, index) => {
      active += 1;
      highestActive = Math.max(highestActive, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      if (index === 1) throw new Error('fixture failure');
      return index;
    });
    expect(highestActive).toBe(2);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 0 });
    expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.any(Error) });
    expect(results[2]).toEqual({ status: 'fulfilled', value: 2 });
  });
});

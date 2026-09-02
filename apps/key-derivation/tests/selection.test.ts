import { describe, expect, it } from 'vitest';
import { invertSelection, selectAll, selectNone } from '../src/ui/selection.js';

describe('result selection', () => {
  const indices = [4, 7, 12];

  it('selects all and none without assuming contiguous indices', () => {
    expect([...selectAll(indices)]).toEqual(indices);
    expect([...selectNone()]).toEqual([]);
  });

  it('inverts only indices present in the current result set', () => {
    expect([...invertSelection(indices, new Set([7, 99]))]).toEqual([4, 12]);
  });
});

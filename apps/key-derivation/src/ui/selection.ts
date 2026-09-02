export function selectAll(indices: readonly number[]): Set<number> {
  return new Set(indices);
}

export function selectNone(): Set<number> {
  return new Set();
}

export function invertSelection(indices: readonly number[], selected: ReadonlySet<number>): Set<number> {
  return new Set(indices.filter((index) => !selected.has(index)));
}

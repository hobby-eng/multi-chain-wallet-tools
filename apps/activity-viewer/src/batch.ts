export interface ViewerBatchInput {
  id: string;
  line: number;
  value: string;
}

export function parseViewerBatchInputs(value: string): ViewerBatchInput[] {
  const seen = new Set<string>();
  const inputs: ViewerBatchInput[] = [];
  value.replaceAll('\r', '').split('\n').forEach((line, lineIndex) => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) return;
    seen.add(trimmed);
    inputs.push({
      id: `query-${inputs.length + 1}`,
      line: lineIndex + 1,
      value: trimmed,
    });
  });
  if (inputs.length === 0) throw new Error('Enter at least one lookup value in batch mode.');
  return inputs;
}

export function parseViewerConcurrency(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new Error('Batch concurrency must be an integer from 1 to 5.');
  }
  return parsed;
}

export async function mapViewerBatchTasks<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const limit = parseViewerConcurrency(String(concurrency));
  const results: Array<PromiseSettledResult<R> | undefined> = new Array(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) {
        results[index] = { status: 'rejected', reason: new Error('Batch input changed while running.') };
        continue;
      }
      try {
        results[index] = { status: 'fulfilled', value: await task(item, index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results.map((result) => result ?? {
    status: 'rejected',
    reason: new Error('Batch query did not produce a result.'),
  });
}

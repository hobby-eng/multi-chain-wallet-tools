import { describe, expect, it, vi } from 'vitest';
import { runShieldedPageStream } from '../src/shielded-stream-policy.js';

interface Page { count: number; height: bigint }

describe('Orchard stream snapshot consistency', () => {
  it.each([
    { name: 'an older partial tail after a full page', pages: [{ count: 2048, height: 101n }, { count: 1, height: 100n }] },
    { name: 'an older empty successor after a partial page', pages: [{ count: 1, height: 101n }, { count: 0, height: 100n }] },
    { name: 'an older second terminal confirmation', pages: [{ count: 0, height: 101n }, { count: 0, height: 100n }] },
  ])('rejects $name before applying stale data', async ({ pages }) => {
    const applied: Page[] = [];
    const disposed: Page[] = [];
    const requested: bigint[] = [];
    await expect(runShieldedPageStream({
      fetchPage: async (position) => { requested.push(position); return pages[requested.length - 1]!; },
      noteCount: page => page.count,
      revision: page => page.height,
      onPage: page => { applied.push(page); },
      disposePage: page => { disposed.push(page); },
    })).rejects.toThrow('Orchard proof height decreased');
    expect(applied).toEqual([pages[0]]);
    expect(disposed).toEqual(pages);
    expect(requested).toHaveLength(2);
  });

  it('still refreshes an appended partial chunk at a newer height before completing', async () => {
    const pages: Page[] = [
      { count: 1, height: 100n }, { count: 0, height: 101n },
      { count: 2, height: 101n }, { count: 0, height: 101n }, { count: 0, height: 101n },
    ];
    const fetchPage = vi.fn(async (_position: bigint) => pages.shift()!);
    const disposePage = vi.fn();
    const outcome = await runShieldedPageStream({
      fetchPage, noteCount: page => page.count, revision: page => page.height,
      onPage: () => {}, disposePage,
    });
    expect(fetchPage.mock.calls.map(([position]) => position)).toEqual([0n, 2048n, 0n, 2048n, 2048n]);
    expect(outcome).toEqual({ complete: true, pageCount: 5, terminalPosition: 2048n });
    expect(disposePage).toHaveBeenCalledTimes(5);
  });
});

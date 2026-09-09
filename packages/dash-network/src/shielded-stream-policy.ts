export const SHIELDED_PAGE_SIZE = 2048;
export const SHIELDED_EMPTY_CONFIRMATIONS = 2;
export const SHIELDED_MAX_PAGES_PER_SCAN = 4096;

export interface ShieldedStreamCursor {
  /** Chunk-aligned DAPI start index for the next request. */
  position: bigint;
  /** Includes non-empty and empty proof responses. */
  pageCount: number;
  consecutiveEmpty: number;
}

export interface ShieldedStreamStep extends ShieldedStreamCursor {
  decision: 'continue' | 'complete' | 'limit';
}

export interface ShieldedStreamOutcome {
  complete: boolean;
  pageCount: number;
  terminalPosition: bigint;
}

export interface ShieldedPageVisit {
  position: bigint;
  pageNumber: number;
  emptyConfirmation: number;
}

export function initialShieldedStreamCursor(): ShieldedStreamCursor {
  return { position: 0n, pageCount: 0, consecutiveEmpty: 0 };
}

/** A short non-empty page is not proof of end-of-pool; only an empty successor is. */
export function isTerminalShieldedPage(noteCount: number): boolean {
  if (!Number.isSafeInteger(noteCount) || noteCount < 0 || noteCount > SHIELDED_PAGE_SIZE) {
    throw new Error('Orchard page count is outside the reviewed range.');
  }
  return noteCount === 0;
}

/**
 * Advances the reviewed Orchard DAPI stream.
 *
 * DAPI requires `start_index` to be aligned to the requested 2,048-action
 * chunk. A short page therefore advances by the chunk size, not by its item
 * count. Two verified empty reads at the same aligned cursor are required so
 * a single transient empty response cannot produce a false complete result.
 */
export function advanceShieldedStream(
  cursor: ShieldedStreamCursor,
  noteCount: number,
  maximumPages = SHIELDED_MAX_PAGES_PER_SCAN,
): ShieldedStreamStep {
  if (
    cursor.position < 0n
    || cursor.position % BigInt(SHIELDED_PAGE_SIZE) !== 0n
    || !Number.isSafeInteger(cursor.pageCount)
    || cursor.pageCount < 0
    || !Number.isSafeInteger(cursor.consecutiveEmpty)
    || cursor.consecutiveEmpty < 0
    || cursor.consecutiveEmpty >= SHIELDED_EMPTY_CONFIRMATIONS
  ) {
    throw new Error('Orchard stream cursor is outside the reviewed state space.');
  }
  if (!Number.isSafeInteger(maximumPages) || maximumPages < SHIELDED_EMPTY_CONFIRMATIONS) {
    throw new Error('Orchard stream page ceiling is invalid.');
  }
  isTerminalShieldedPage(noteCount);

  const pageCount = cursor.pageCount + 1;
  if (noteCount === 0) {
    const consecutiveEmpty = cursor.consecutiveEmpty + 1;
    if (consecutiveEmpty >= SHIELDED_EMPTY_CONFIRMATIONS) {
      return { position: cursor.position, pageCount, consecutiveEmpty, decision: 'complete' };
    }
    if (pageCount >= maximumPages) {
      return { position: cursor.position, pageCount, consecutiveEmpty, decision: 'limit' };
    }
    return { position: cursor.position, pageCount, consecutiveEmpty, decision: 'continue' };
  }

  const position = cursor.position + BigInt(SHIELDED_PAGE_SIZE);
  if (pageCount >= maximumPages) {
    return { position, pageCount, consecutiveEmpty: 0, decision: 'limit' };
  }
  return { position, pageCount, consecutiveEmpty: 0, decision: 'continue' };
}

/** Shared loop used by both the Viewer and Recovery vault. */
export async function runShieldedPageStream<Page>(options: {
  fetchPage(position: bigint): Promise<Page>;
  noteCount(page: Page): number;
  /** Platform height authenticated by this page's proof. */
  revision(page: Page): bigint;
  onPage(page: Page, visit: ShieldedPageVisit): void | Promise<void>;
  disposePage(page: Page): void;
  isCancelled?(): boolean;
  yieldTurn?(): Promise<void>;
  maximumPages?: number;
}): Promise<ShieldedStreamOutcome> {
  const maximumPages = options.maximumPages ?? SHIELDED_MAX_PAGES_PER_SCAN;
  if (!Number.isSafeInteger(maximumPages) || maximumPages < SHIELDED_EMPTY_CONFIRMATIONS) {
    throw new Error('Orchard stream page ceiling is invalid.');
  }
  const checkCancellation = (): void => {
    if (options.isCancelled?.() === true) throw new DOMException('Shielded pool scan cancelled.', 'AbortError');
  };
  let cursor = initialShieldedStreamCursor();
  let lastPartial: { position: bigint; revision: bigint } | undefined;
  let terminalRevision: bigint | undefined;
  let highestRevision: bigint | undefined;
  for (;;) {
    checkCancellation();
    const page = await options.fetchPage(cursor.position);
    let noteCount: number;
    let revision: bigint;
    try {
      checkCancellation();
      noteCount = options.noteCount(page);
      isTerminalShieldedPage(noteCount);
      revision = options.revision(page);
      if (typeof revision !== 'bigint' || revision < 0n) {
        throw new Error('Orchard proof revision must be a non-negative bigint.');
      }
      // A proof authenticates a state, not its freshness relative to earlier
      // pages. Never combine an older tail with a newer ledger snapshot.
      if (highestRevision !== undefined && revision < highestRevision) {
        throw new Error('Orchard proof height decreased during the scan. Retry with a synchronized provider.');
      }
      highestRevision = revision;
      const partialMatchesRevision = lastPartial === undefined || lastPartial.revision === revision;
      const emptyConfirmation = noteCount === 0
        ? partialMatchesRevision && terminalRevision === revision ? cursor.consecutiveEmpty + 1 : 1
        : 0;
      await options.onPage(page, {
        position: cursor.position,
        pageNumber: cursor.pageCount + 1,
        emptyConfirmation,
      });
      checkCancellation();
    } finally {
      options.disposePage(page);
    }
    const pageCount = cursor.pageCount + 1;
    if (noteCount > 0) {
      lastPartial = noteCount < SHIELDED_PAGE_SIZE
        ? { position: cursor.position, revision }
        : undefined;
      terminalRevision = undefined;
      const position = cursor.position + BigInt(SHIELDED_PAGE_SIZE);
      if (pageCount >= maximumPages) {
        return { complete: false, pageCount, terminalPosition: position };
      }
      cursor = { position, pageCount, consecutiveEmpty: 0 };
      await options.yieldTurn?.();
      continue;
    }

    // A newer terminal proof can contain actions appended inside the previous
    // partial chunk. Refresh that chunk before accepting the empty successor.
    if (lastPartial !== undefined && lastPartial.revision !== revision) {
      terminalRevision = undefined;
      if (pageCount >= maximumPages) {
        return { complete: false, pageCount, terminalPosition: lastPartial.position };
      }
      cursor = { position: lastPartial.position, pageCount, consecutiveEmpty: 0 };
      await options.yieldTurn?.();
      continue;
    }

    const consecutiveEmpty = terminalRevision === revision ? cursor.consecutiveEmpty + 1 : 1;
    terminalRevision = revision;
    if (consecutiveEmpty >= SHIELDED_EMPTY_CONFIRMATIONS) {
      return {
        complete: true,
        pageCount,
        terminalPosition: cursor.position,
      };
    }
    if (pageCount >= maximumPages) {
      return { complete: false, pageCount, terminalPosition: cursor.position };
    }
    cursor = { position: cursor.position, pageCount, consecutiveEmpty };
    await options.yieldTurn?.();
  }
}

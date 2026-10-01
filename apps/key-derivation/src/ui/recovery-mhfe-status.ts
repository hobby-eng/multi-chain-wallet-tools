// Status texts and password-field handling of the MHFE panel, kept apart from the panel so that
// they can be tested without the browser package's WebAssembly and the page.
import { MhfeError } from '@ckd/recovery-mhfe-wasm/client.js';

/** Error text for the status line: the client's codes carry a message written for people. */
export function describe(cause: unknown, fallback: string): string {
  if (cause instanceof MhfeError && cause.code === 'CANCELLED')
    return 'Stopped. The worker and its memory were discarded.';
  // An error in this page's own progress display: the client stopped the operation for safety.
  if (cause instanceof MhfeError && cause.code === 'CALLBACK_FAILED') {
    const detail = cause.cause instanceof Error ? ` (${cause.cause.message})` : '';
    return `Stopped because this page failed to show the progress${detail}. The worker and its memory were discarded.`;
  }
  return cause instanceof Error ? cause.message : fallback;
}

/**
 * Empties the password fields once, at the first progress report. The client reports progress only
 * after it has accepted every argument, so a refused one (an empty password, for example) rejects
 * before it and leaves the typed password in place to be corrected.
 */
export function clearOnFirstProgress(...fields: HTMLInputElement[]): () => void {
  let cleared = false;
  return () => {
    if (cleared) return;
    cleared = true;
    for (const field of fields) field.value = '';
  };
}

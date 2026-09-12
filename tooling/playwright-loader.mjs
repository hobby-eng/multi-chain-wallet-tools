import { pathToFileURL } from 'node:url';

/**
 * Loads either the repository's pinned Playwright package or an explicit local
 * module override. CommonJS entry points expose the browser API through
 * `default`, while ESM entry points expose named bindings.
 */
export async function loadPlaywright(moduleOverride = process.env.PLAYWRIGHT_MODULE) {
  const loaded = moduleOverride === undefined
    ? await import('playwright')
    : await import(pathToFileURL(moduleOverride).href);
  const api = loaded.default ?? loaded;
  if (api.chromium === undefined || api.firefox === undefined) {
    throw new Error('The selected Playwright module does not expose Chromium and Firefox.');
  }
  return api;
}

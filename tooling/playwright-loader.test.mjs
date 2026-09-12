import { describe, expect, it } from 'vitest';
import { loadPlaywright } from './playwright-loader.mjs';

describe('Playwright browser-runner loader', () => {
  it('loads Chromium and Firefox from the pinned package export shape', async () => {
    const api = await loadPlaywright();
    expect(typeof api.chromium?.launch).toBe('function');
    expect(typeof api.firefox?.launch).toBe('function');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeClipboard } from '../src/clipboard.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('clipboard fallback cleanup', () => {
  it('removes and clears the temporary field when the legacy copy call throws', async () => {
    let removed = false;
    const temporary = {
      value: '',
      readOnly: false,
      tabIndex: 0,
      style: {} as CSSStyleDeclaration,
      select: vi.fn(),
      remove: () => {
        removed = true;
      },
    };
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', {
      createElement: () => temporary,
      body: { append: vi.fn() },
      execCommand: () => {
        throw new Error('synthetic copy failure');
      },
    });
    await expect(writeClipboard('public test text')).rejects.toThrow('synthetic copy failure');
    expect(temporary.value).toBe('');
    expect(removed).toBe(true);
  });
});

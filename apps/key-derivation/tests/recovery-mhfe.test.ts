import { describe as group, expect, it } from 'vitest';
import { MhfeError } from '@ckd/recovery-mhfe-wasm/client.js';
import { clearOnFirstProgress, describe } from '../src/ui/recovery-mhfe-status.js';

group('MHFE panel', () => {
  it('empties the password fields once, when the operation reports its first progress', () => {
    const password = { value: 'public test password' } as HTMLInputElement;
    const repeat = { value: 'public test password' } as HTMLInputElement;
    const clear = clearOnFirstProgress(password, repeat);
    expect(password.value).toBe('public test password');
    clear();
    expect([password.value, repeat.value]).toEqual(['', '']);
    password.value = 'typed again';
    clear();
    expect(password.value).toBe('typed again');
  });

  it('says that an error in the page stopped the operation', () => {
    const cause = new Error('progress element missing');
    // The error as MHFE 0.5.0 gives it: its constructor stores the page's error as `cause`.
    const error = Object.defineProperty(new MhfeError('CALLBACK_FAILED', 'callback failed'), 'cause', { value: cause });
    expect(describe(error, 'fallback')).toContain(
      'Stopped because this page failed to show the progress (progress element missing)',
    );
    expect(describe(new MhfeError('CANCELLED', 'x'), 'fallback')).toContain('Stopped.');
    expect(describe(new MhfeError('EMPTY_PASSWORD', 'The password is empty.'), 'fallback')).toBe(
      'The password is empty.',
    );
  });
});

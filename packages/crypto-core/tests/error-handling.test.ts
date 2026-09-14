import { describe, expect, it } from 'vitest';
import { describeUnknownError, freeThrownValue } from '../src/error-handling.js';

describe('shared error handling', () => {
  it('formats native, primitive and structured errors consistently', () => {
    expect(describeUnknownError(new Error('boom'))).toBe('boom');
    expect(describeUnknownError('boom')).toBe('boom');
    expect(describeUnknownError({ name: 'DapiError', code: 7, message: 'bad request' })).toBe(
      'name: DapiError · bad request · code: 7',
    );
    expect(describeUnknownError(null)).toBe('Unknown error');
  });

  it('does not let a failing free getter replace the original diagnostic', () => {
    const value = {
      get free(): never {
        throw new Error('cleanup failed');
      },
    };
    expect(() => freeThrownValue(value)).not.toThrow();
    expect(describeUnknownError(value)).toBe('Unknown error');
  });
});

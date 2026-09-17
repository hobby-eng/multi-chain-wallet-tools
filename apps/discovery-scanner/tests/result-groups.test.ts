import { describe, expect, it } from 'vitest';
import { groupRecoveryResultsByCoin } from '../src/view.js';
import type { RecoveryWalletResult } from '../src/types.js';
const report = (inputId: string, coinId: string, coinLabel: string) =>
  ({ inputId, coinId, coinLabel }) as RecoveryWalletResult;
describe('result grouping', () => {
  it('creates one ordered tab per coin and keeps every seed report inside it', () => {
    const groups = groupRecoveryResultsByCoin([
      report('a-btc', 'bitcoin', 'Bitcoin'),
      report('a-dash', 'dash', 'Dash'),
      report('b-btc', 'bitcoin', 'Bitcoin'),
      report('a-eth', 'ethereum', 'Ethereum'),
    ]);
    expect(groups.map(({ id }) => id)).toEqual(['bitcoin', 'dash', 'ethereum']);
    expect(groups[0]?.reports.map(({ inputId }) => inputId)).toEqual(['a-btc', 'b-btc']);
  });
  it('uses registry order regardless of asynchronous completion order', () => {
    const groups = groupRecoveryResultsByCoin(
      [
        report('a-dash', 'dash', 'Dash'),
        report('a-eth', 'ethereum', 'Ethereum'),
        report('a-btc', 'bitcoin', 'Bitcoin'),
      ],
      ['bitcoin', 'ethereum', 'dash'],
    );
    expect(groups.map(({ id }) => id)).toEqual(['bitcoin', 'ethereum', 'dash']);
  });
});

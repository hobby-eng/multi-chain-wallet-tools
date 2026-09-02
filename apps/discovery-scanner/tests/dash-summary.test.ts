import { describe, expect, it } from 'vitest';
import { summarizeDashSections } from '../src/coins/dash/summary.js';
import { formatDashFromCredits } from '../src/coins/dash/util.js';
import type { RecoveryFinding, RecoverySection, RecoverySectionId } from '../src/types.js';

function section(id: RecoverySectionId, balances: bigint[]): RecoverySection {
  const findings: RecoveryFinding[] = balances.map((balanceAtomic, index) => ({
    id: `${id}:${index}`,
    title: `${id}-${index}`,
    subtitle: 'fixture',
    balanceAtomic,
    balanceLabel: String(balanceAtomic),
    fields: [],
  }));
  return {
    id,
    title: id,
    description: 'fixture',
    state: 'complete',
    metrics: [],
    findings,
    scanned: findings.length,
    source: 'fixture',
    proof: 'fixture',
  };
}

describe('Dash wallet-wide recovery summary', () => {
  it('renders the fixed Orchard raw-credit vector without a 1,000x unit error', () => {
    expect(formatDashFromCredits(123_456_789_012n)).toBe('1.23456789012 DASH');
    const overview = summarizeDashSections([
      section('core', []), section('platform', []), section('identity', []),
      section('shielded', [123_456_789_012n]),
    ]);
    expect(overview.find(({ label }) => label === 'Total located value')?.value).toBe('1.23456789012 DASH');
  });
  it('reports identity-only value even when Core and Platform-address balances are zero', () => {
    const overview = summarizeDashSections([
      section('core', []),
      section('platform', []),
      section('identity', [4_000_000_000n, 608_475_680n]),
      section('shielded', []),
    ]);
    expect(overview.find(({ label }) => label === 'Total located value')?.value).toBe('0.0460847568 DASH');
    expect(overview.find(({ label }) => label === 'Identity credits')?.value).toBe('0.0460847568 DASH');
    expect(overview.find(({ label }) => label === 'Funded resources')?.value).toBe('2');
  });

  it('converts Core duffs to Platform credits without losing precision', () => {
    const overview = summarizeDashSections([
      section('core', [44_465_456n]),
      section('platform', [4_990_050_160n]),
      section('identity', [1_384_483_040n]),
      section('shielded', [24_706_348_000n]),
    ]);
    expect(overview.find(({ label }) => label === 'Total located value')?.value).toBe('0.755463372 DASH');
  });
});

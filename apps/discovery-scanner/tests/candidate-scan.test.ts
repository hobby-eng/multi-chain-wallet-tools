import { describe, expect, it, vi } from 'vitest';
import { candidateFailure, candidateSummary, scanCandidates } from '../src/candidate-scan.js';
import type { RecoveryCoinAdapter, RecoveryScanConfig, RecoveryScanContext, RecoverySeedInput } from '../src/types.js';

const config = { network: 'mainnet', account: 7, scanCore: false, scanCustomPath: true, includeUsedZeroBalance: false } as RecoveryScanConfig;
function context(signal = new AbortController().signal): RecoveryScanContext {
  return { signal, networkApi: {} as RecoveryScanContext['networkApi'], onProgress: vi.fn(), onFinding: vi.fn() };
}
function inputs(): RecoverySeedInput[] {
  return [1, 2].map(n => ({ id: `candidate-${n}`, label: `Candidate ${n}`, mnemonic: `phrase${n}`, passphrase: `password${n}` }));
}
function adapter(id: string): RecoveryCoinAdapter {
  return { id, label: id, networks: ['mainnet'], scan: vi.fn(async (input, cfg) => {
    const report = candidateFailure(input, cfg, id, id, '');
    report.warnings = []; report.sections[0]!.state = 'complete'; report.sections[0]!.balanceAvailable = true;
    return report;
  }) };
}

describe('automatic ready-candidate scanning', () => {
  it('visits each candidate then each coin, preserves the phrase until all coins finish, and forces standard coverage with history', async () => {
    const candidates = inputs(); const order: string[] = [];
    const coins = ['bitcoin', 'dash'].map(id => {
      const coin = adapter(id); const original = coin.scan;
      coin.scan = vi.fn(async (input, cfg, ctx) => {
        order.push(`${input.mnemonic}:${id}`);
        expect(input.passphrase).toBe(input.mnemonic.replace('phrase', 'password'));
        expect(cfg.account).toBe(7); expect(cfg.scanCustomPath).toBe(false); expect(cfg.includeUsedZeroBalance).toBe(true);
        expect(cfg.scanCore).toBe(id !== 'dash');
        await Promise.resolve(); return original(input, cfg, ctx);
      }); return coin;
    });
    const results = vi.fn();
    await scanCandidates(candidates, coins, config, context(), s => s, results);
    expect(order).toEqual(['phrase1:bitcoin', 'phrase1:dash', 'phrase2:bitcoin', 'phrase2:dash']);
    expect(results.mock.calls.map(([r]) => r.inputId)).toEqual(['candidate-1-bitcoin', 'candidate-1-dash', 'candidate-2-bitcoin', 'candidate-2-dash']);
    expect(candidates.every(input => input.mnemonic === '' && input.passphrase === '')).toBe(true);
  });
  it('does not expose invalid phrases or stop subsequent candidates', async () => {
    const coin = adapter('dash'); const results = vi.fn();
    await scanCandidates(inputs(), [coin], config, context(), s => { if (s === 'phrase1') throw new Error(s); return s; }, results);
    expect(coin.scan).toHaveBeenCalledTimes(1);
    expect(results.mock.calls[0]![0].coinId).toBe('input');
    expect(JSON.stringify(results.mock.calls)).not.toContain('phrase1');
    expect(results.mock.calls).toHaveLength(2);
  });
  it('retains explicit failures and proceeds to the next coin without exposing provider errors', async () => {
    const broken = adapter('bitcoin'); broken.scan = vi.fn(async () => { throw new Error('phrase1'); });
    const results = vi.fn();
    await scanCandidates(inputs(), [broken, adapter('dash')], config, context(), s => s, results);
    expect(results.mock.calls).toHaveLength(4);
    expect(results.mock.calls[0]![0].sections[0].state).toBe('failed');
    expect(JSON.stringify(results.mock.calls)).not.toContain('phrase1');
  });
  it('marks unsupported networks unknown without calling their adapter', async () => {
    const coin: RecoveryCoinAdapter = { ...adapter('dash'), networks: ['testnet'] };
    const results = vi.fn();
    await scanCandidates(inputs(), [coin], config, context(), s => s, results);
    expect(coin.scan).not.toHaveBeenCalled();
    expect(candidateSummary(results.mock.calls[0]![0])).toContain('unknown');
  });
  it('stops between bounded operations, records cancellation and wipes all candidates', async () => {
    const abort = new AbortController(); const coin = adapter('dash');
    coin.scan = vi.fn(async () => { abort.abort(); throw new Error('stopped'); });
    const candidates = inputs(); const results = vi.fn(); const later = adapter('other');
    await expect(scanCandidates(candidates, [coin, later], config, context(abort.signal), s => s, results)).rejects.toMatchObject({ name: 'AbortError' });
    expect(later.scan).not.toHaveBeenCalled(); expect(results).toHaveBeenCalledTimes(1);
    expect(candidates.every(input => input.mnemonic === '' && input.passphrase === '')).toBe(true);
  });
  it('does not confuse missing balances, skipped coverage, zero balances and funded partial findings', () => {
    const report = candidateFailure(inputs()[0]!, config, 'dash', 'Dash', 'failed');
    expect(candidateSummary(report)).toContain('unknown');
    const section = report.sections[0]!; section.state = 'complete'; section.balanceAvailable = true;
    expect(candidateSummary(report)).toContain('within scanned coverage');
    section.findings.push({ id: 'a', title: 'a', subtitle: '', balanceAtomic: 0n, balanceLabel: '0', fields: [] });
    expect(candidateSummary(report)).toContain('Resources / activity');
    section.findings[0]!.balanceAtomic = null;
    expect(candidateSummary(report)).toContain('incomplete');
    section.findings[0]!.balanceAtomic = 1n; section.state = 'partial';
    expect(candidateSummary(report)).toContain('1 funded resource found · incomplete');
    section.state = 'skipped'; expect(candidateSummary(report)).toContain('unknown');
  });
});

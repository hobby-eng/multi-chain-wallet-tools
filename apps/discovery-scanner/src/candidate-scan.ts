import { enrichRecoveryHistory } from './history.js';
import type { RecoveryCoinAdapter, RecoveryScanConfig, RecoveryScanContext, RecoverySeedInput, RecoveryWalletResult } from './types.js';

export function candidateFailure(input: Pick<RecoverySeedInput, 'id' | 'label'>, config: RecoveryScanConfig, coinId: string, coinLabel: string, message: string): RecoveryWalletResult {
  const now = new Date().toISOString();
  return { inputId: input.id, label: input.label, coinId, coinLabel, network: config.network,
    startedAt: now, completedAt: now, overview: [], warnings: [message],
    sections: [{ id: 'core', title: 'Check incomplete', description: message, state: 'failed', balanceAvailable: false,
      metrics: [], findings: [], scanned: 0, source: 'Not established', proof: 'Not established', warning: message }] };
}

/** Ready BIP39 candidates only. Never guesses words or sends mnemonic material to providers. */
export async function scanCandidates(
  inputs: RecoverySeedInput[], adapters: readonly RecoveryCoinAdapter[], config: RecoveryScanConfig,
  context: RecoveryScanContext, validate: (phrase: string) => string,
  onResult: (result: RecoveryWalletResult) => void,
): Promise<void> {
  try {
    for (const candidate of inputs) {
      if (context.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      try {
        try {
          candidate.mnemonic = validate(candidate.mnemonic);
        } catch {
          // Validation errors may quote the input. Only this fixed message reaches results/exports.
          onResult(candidateFailure(candidate, config, 'input', 'Input validation', 'Invalid BIP39 candidate: check word list, word count and checksum. No coins were checked.'));
          continue;
        }
        context.sessionSecretGuard?.registerString('Candidate mnemonic', candidate.mnemonic);
        context.sessionSecretGuard?.registerString('Candidate passphrase', candidate.passphrase);
        for (const adapter of adapters) {
          if (context.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          const input = { ...candidate, id: `${candidate.id}-${adapter.id}`, label: `${candidate.label} · ${adapter.label}` };
          const coinConfig = { ...config, scanCustomPath: false, includeUsedZeroBalance: true,
            scanCore: adapter.id === 'dash' ? config.scanCore : true };
          try {
            if (!adapter.networks.includes(config.network)) {
              onResult(candidateFailure(input, config, adapter.id, adapter.label, 'Selected network is not supported by this coin adapter.'));
              continue;
            }
            const result = await adapter.scan(input, coinConfig, context);
            await enrichRecoveryHistory(adapter, result, context);
            if (context.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
            onResult(result);
          } catch {
            const cancelled = context.signal.aborted;
            onResult(candidateFailure(input, config, adapter.id, adapter.label, cancelled
              ? 'Cancelled: this coin check is incomplete.' : 'Coin check failed. Balance and activity are unknown; retry this coin separately.'));
            if (cancelled) throw new DOMException('Cancelled', 'AbortError');
          } finally {
            input.mnemonic = '';
            input.passphrase = '';
          }
        }
      } finally {
        candidate.mnemonic = '';
        candidate.passphrase = '';
      }
    }
  } finally {
    for (const input of inputs) { input.mnemonic = ''; input.passphrase = ''; }
  }
}

export function candidateSummary(result: RecoveryWalletResult): string {
  if (result.coinId === 'input') return 'Invalid BIP39 candidate · no coins checked';
  const sections = result.sections.filter(section => section.state !== 'skipped');
  const findings = sections.flatMap(section => section.findings);
  const funded = findings.filter(finding => finding.balanceAtomic !== null && finding.balanceAtomic > 0n).length;
  const incomplete = sections.length === 0 || sections.some(section => section.state !== 'complete' || section.balanceAvailable === false)
    || findings.some(finding => finding.balanceAtomic === null);
  const outcome = funded > 0 ? `${funded} funded resource${funded === 1 ? '' : 's'} found`
    : findings.length > 0 ? 'Resources / activity found; no confirmed positive balance'
    : incomplete ? 'Balance / activity unknown' : 'No activity found within scanned coverage';
  return `${outcome}${incomplete ? ' · incomplete check' : ''}`;
}

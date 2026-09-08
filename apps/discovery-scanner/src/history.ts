import { RecoveryNetworkGateway } from './network-gateway.js';
import { SecretEgressGuard } from './secret-guard.js';
import type { RecoveryCoinAdapter, RecoveryHistory, RecoveryScanContext, RecoveryWalletResult } from './types.js';

export { emptyHistory, validateHistory, historyAmount, historyFields } from './history-model.js';
import { emptyHistory, validateHistory } from './history-model.js';

export function historyGateway(context: RecoveryScanContext): RecoveryNetworkGateway {
  return new RecoveryNetworkGateway(context.sessionSecretGuard ?? new SecretEgressGuard(), context.networkApi, context.networkLimiter);
}

export async function enrichRecoveryHistory(adapter: RecoveryCoinAdapter, result: RecoveryWalletResult, context: RecoveryScanContext): Promise<void> {
  const cache = new Map<string, RecoveryHistory>();
  const findings = result.sections.flatMap(section => section.findings.map(finding => ({ section, finding })));
  for (const [index, { section, finding }] of findings.entries()) {
    context.signal.throwIfAborted();
    context.onProgress({ inputId: result.inputId, section: section.id, message: `Loading history ${index + 1}/${findings.length}`, completed: index, total: findings.length });
    const unit = adapter.amountUnit?.(section.id);
    if (unit !== undefined) finding.balanceUnit = unit;
    const unavailable = emptyHistory(unit?.asset, unit?.atomicUnit, unit?.decimals);
    const key = `${section.id}:${finding.title}`;
    let h = cache.get(key);
    if (h === undefined) {
      try {
        h = adapter.getHistory === undefined
          ? { ...unavailable, status: 'unsupported', note: 'This adapter does not provide historical data.' } satisfies RecoveryHistory
          : validateHistory(await adapter.getHistory(finding, section.id, result.network, context));
        if (unit !== undefined && (h.asset !== unit.asset || h.atomicUnit !== unit.atomicUnit || h.decimals !== unit.decimals)) {
          throw new Error('History units differ from the adapter balance units.');
        }
      } catch {
        context.signal.throwIfAborted();
        h = { ...unavailable, note: 'The history provider is unavailable or returned inconsistent data. The discovered balance is preserved; retry the scan to refresh history.' };
      }
      cache.set(key, h);
    }
    finding.history = h;
    if (finding.balanceUnit === undefined && h.asset && h.atomicUnit) finding.balanceUnit = { asset: h.asset, atomicUnit: h.atomicUnit, decimals: h.decimals };
  }
  result.completedAt = new Date().toISOString();
}

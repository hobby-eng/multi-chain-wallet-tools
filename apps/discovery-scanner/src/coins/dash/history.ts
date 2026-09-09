import { emptyHistory, historyGateway } from '../../history.js';
import type { RecoveryAmountUnit, RecoveryCoinAdapter, RecoveryHistory, RecoverySectionId } from '../../types.js';
import { validateDashScanAddressHistory } from './util.js';
import { validatePlatformHistory } from './platform-history.js';

export function dashAmountUnit(section: RecoverySectionId): RecoveryAmountUnit {
  return ['platform', 'identity', 'shielded'].includes(section)
    ? { asset: 'DASH', atomicUnit: 'credits', decimals: 11 }
    : { asset: 'DASH', atomicUnit: 'duffs', decimals: 8 };
}

const HISTORY_DATE_NOTE = 'First/last seen are activity dates, not necessarily receipt/spend dates. Separate receipt/spend dates are not provided by this index.';
export function dashCoreHistory(data: ReturnType<typeof validateDashScanAddressHistory>): RecoveryHistory {
  return { ...emptyHistory('DASH', 'duffs', 8), status: 'complete', source: 'DashScan', scope: 'Indexed Core address history',
    totalReceivedAtomic: data.received.toString(), totalSentAtomic: data.sent.toString(),
    firstSeen: data.firstSeen === null ? null : new Date(data.firstSeen).toISOString(), lastSeen: data.lastSeen === null ? null : new Date(data.lastSeen).toISOString(), transactionCount: data.txCount,
    note: `${HISTORY_DATE_NOTE} Sent counts consumed address outputs, including change and fees.` };
}
export function dashPlatformHistory(data: ReturnType<typeof validatePlatformHistory>): RecoveryHistory {
  return { ...emptyHistory('DASH', 'credits', 11), status: 'complete', source: 'Dash Platform Explorer', scope: 'Indexed Platform credit history',
    totalReceivedAtomic: data.totalReceived.toString(), totalSentAtomic: data.totalSent.toString(), totalFeesAtomic: data.totalFees?.toString() ?? null,
    firstSeen: data.firstSeen === null ? null : new Date(data.firstSeen).toISOString(), lastSeen: data.lastSeen === null ? null : new Date(data.lastSeen).toISOString(), transactionCount: data.transactionCount, note: HISTORY_DATE_NOTE };
}

export const getDashHistory: NonNullable<RecoveryCoinAdapter['getHistory']> = async (finding, section, network, context) => {
  if (finding.history !== undefined) return finding.history;
  const platform = section === 'platform' || section === 'identity';
  const unit = dashAmountUnit(section);
  const h = emptyHistory(unit.asset, unit.atomicUnit, unit.decimals);
  h.source = platform ? 'Dash Platform Explorer' : 'DashScan';
  h.scope = platform ? 'Indexed Platform credit history' : 'Indexed Core address history';
  h.note = 'First/last seen are activity dates, not necessarily receipt/spend dates. The provider does not expose separate first/last receipt and spend dates.';
  if (section === 'shielded') return { ...h, status: 'unsupported', source: 'Orchard pool', scope: 'Recovered notes',
    note: 'Per-note calendar dates and lifetime address totals are not exposed by this pool API. See note values, spend state and the section totals, labelled Observed when the scan is incomplete.' };
  const gateway = historyGateway(context);
  if (platform) {
    if (finding.balanceAtomic === null) throw new Error('Platform balance unavailable; history cannot be reconciled.');
    const value = await gateway.runPublic({ network, address: finding.title }, `platform.${section}-history`,
      () => section === 'identity'
        ? context.networkApi.platformIdentityHistory(network, finding.title, context.signal)
        : context.networkApi.platformAddressHistory(network, finding.title, context.signal), context.signal);
    const data = validatePlatformHistory(value, finding.title, finding.balanceAtomic);
    return dashPlatformHistory(data);
  }
  const data = validateDashScanAddressHistory(await gateway.runPublic({ network, address: finding.title }, 'core.address-history',
    () => context.networkApi.coreAddressHistory(network, finding.title, context.signal), context.signal), finding.title);
  return dashCoreHistory(data);
};

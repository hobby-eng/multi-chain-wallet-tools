import { CREDITS_PER_DUFF } from '@ckd/core/dash-units.js';
import type { RecoveryMetric, RecoverySection } from '../../types.js';
import { formatDashFromCredits, formatDashFromDuffs } from './util.js';

function positiveBalance(section: RecoverySection | undefined): bigint {
  if (section?.state !== 'complete' || section.balanceAvailable === false) return 0n;
  return section.findings.reduce(
    (sum, finding) => sum + (finding.balanceAtomic !== null && finding.balanceAtomic > 0n ? finding.balanceAtomic : 0n),
    0n,
  );
}

/** Coin-owned overview keeps Dash unit conversion out of the generic renderer. */
export function summarizeDashSections(sections: readonly RecoverySection[]): RecoveryMetric[] {
  const core = positiveBalance(sections.find(({ id }) => id === 'core'));
  const legacyCore = positiveBalance(sections.find(({ id }) => id === 'legacyCore'));
  const coinjoin = positiveBalance(sections.find(({ id }) => id === 'coinjoin'));
  const providerCollateral = positiveBalance(sections.find(({ id }) => id === 'providerCollateral'));
  const platform = positiveBalance(sections.find(({ id }) => id === 'platform'));
  const identity = positiveBalance(sections.find(({ id }) => id === 'identity'));
  const shielded = positiveBalance(sections.find(({ id }) => id === 'shielded'));
  // Dash Platform consensus expresses transparent address, identity, and
  // Orchard note values in credits. One Core duff is exactly 1,000 credits;
  // `note.value().inner()` is therefore already in the same credit unit.
  // Independently pinned to dashpay/platform commit 1c128acaf92e68a147086f9b87810dae5cc21993:
  // rs-unified-sdk-jni/src/funding.rs documents 1 DASH = 1e11 credits, while
  // rs-platform-wallet/.../memo_roundtrip_tests.rs passes `value_credits`
  // directly to `NoteValue::from_raw` (the production builder does likewise).
  const coreChain = core + legacyCore + coinjoin + providerCollateral;
  const totalCredits = coreChain * CREDITS_PER_DUFF + platform + identity + shielded;
  const unavailable = (ids?: string[]): boolean => sections.some(section => (!ids || ids.includes(section.id))
    && (section.state === 'partial' || section.state === 'failed' || section.balanceAvailable === false || section.findings.some(finding => finding.balanceAtomic === null)));
  const fundedResources = sections.filter(section => section.state === 'complete' && section.balanceAvailable !== false).reduce(
    (sum, section) => sum + section.findings.filter(({ balanceAtomic }) => (balanceAtomic ?? 0n) > 0n).length,
    0,
  );
  return [
    { label: 'Total located value', value: unavailable() ? 'Unavailable · incomplete balance coverage' : formatDashFromCredits(totalCredits), tone: !unavailable() && totalCredits > 0n ? 'positive' : 'neutral' },
    { label: unavailable() ? 'Confirmed funded resources' : 'Funded resources', value: String(fundedResources), tone: fundedResources > 0 ? 'positive' : 'neutral' },
    { label: 'Core L1', value: unavailable(['core', 'legacyCore', 'coinjoin', 'providerCollateral']) ? 'Unavailable' : formatDashFromDuffs(coreChain), tone: !unavailable(['core', 'legacyCore', 'coinjoin', 'providerCollateral']) && coreChain > 0n ? 'positive' : 'neutral' },
    { label: 'Dash Mobile CoinJoin · DIP9', value: unavailable(['coinjoin']) ? 'Unavailable' : formatDashFromDuffs(coinjoin), tone: !unavailable(['coinjoin']) && coinjoin > 0n ? 'positive' : 'neutral' },
    { label: 'Provider holdings', value: unavailable(['providerCollateral']) ? 'Unavailable' : formatDashFromDuffs(providerCollateral), tone: !unavailable(['providerCollateral']) && providerCollateral > 0n ? 'positive' : 'neutral' },
    { label: 'Platform addresses', value: unavailable(['platform']) ? 'Unavailable' : formatDashFromCredits(platform), tone: !unavailable(['platform']) && platform > 0n ? 'positive' : 'neutral' },
    { label: 'Identity credits', value: unavailable(['identity']) ? 'Unavailable' : formatDashFromCredits(identity), tone: !unavailable(['identity']) && identity > 0n ? 'positive' : 'neutral' },
    { label: 'Shielded spendable', value: unavailable(['shielded']) ? 'Unavailable' : formatDashFromCredits(shielded), tone: !unavailable(['shielded']) && shielded > 0n ? 'positive' : 'neutral' },
  ];
}

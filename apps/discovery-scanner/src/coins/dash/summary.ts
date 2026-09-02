import type { RecoveryMetric, RecoverySection } from '../../types.js';
import { formatDashFromCredits, formatDashFromDuffs } from './util.js';

function positiveBalance(section: RecoverySection | undefined): bigint {
  return section?.findings.reduce(
    (sum, finding) => sum + (finding.balanceAtomic > 0n ? finding.balanceAtomic : 0n),
    0n,
  ) ?? 0n;
}

/** Coin-owned overview keeps Dash unit conversion out of the generic renderer. */
export function summarizeDashSections(sections: readonly RecoverySection[]): RecoveryMetric[] {
  const core = positiveBalance(sections.find(({ id }) => id === 'core'));
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
  const totalCredits = core * 1_000n + platform + identity + shielded;
  const fundedResources = sections.reduce(
    (sum, section) => sum + section.findings.filter(({ balanceAtomic }) => balanceAtomic > 0n).length,
    0,
  );
  return [
    { label: 'Total located value', value: formatDashFromCredits(totalCredits), tone: totalCredits > 0n ? 'positive' : 'neutral' },
    { label: 'Funded resources', value: String(fundedResources), tone: fundedResources > 0 ? 'positive' : 'neutral' },
    { label: 'Core L1', value: formatDashFromDuffs(core), tone: core > 0n ? 'positive' : 'neutral' },
    { label: 'Platform addresses', value: formatDashFromCredits(platform), tone: platform > 0n ? 'positive' : 'neutral' },
    { label: 'Identity credits', value: formatDashFromCredits(identity), tone: identity > 0n ? 'positive' : 'neutral' },
    { label: 'Shielded spendable', value: formatDashFromCredits(shielded), tone: shielded > 0n ? 'positive' : 'neutral' },
  ];
}

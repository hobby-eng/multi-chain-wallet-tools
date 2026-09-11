import type { ShieldedActivityLedger } from '@ckd/dash-network/activity.js';
import { SHIELDED_EMPTY_CONFIRMATIONS, SHIELDED_MAX_PAGES_PER_SCAN, type ShieldedStreamOutcome } from '@ckd/dash-network/shielded-stream-policy.js';
import type { RecoveryFinding, RecoverySection } from '../../types.js';
import { shouldDisplayShieldedActivity } from './shielded-filter.js';
import { shieldedFindingPresentation } from './shielded-presentation.js';
import { formatDashFromCredits } from './util.js';

interface ShieldedSectionOptions {
  includeUsedZeroBalance: boolean;
  /** Display-only label for the finding fields; watch-only viewing keys have no BIP32 account path. */
  accountPathLabel: string;
}

export function sectionFromLedger(
  ledger: ShieldedActivityLedger,
  options: ShieldedSectionOptions,
  outcome: ShieldedStreamOutcome,
  shared: boolean,
  onFinding: (finding: RecoveryFinding) => void,
): RecoverySection {
  const snapshot = ledger.snapshot(outcome.complete);
  const visibleRecords = snapshot.records.filter((record) => shouldDisplayShieldedActivity(record, options.includeUsedZeroBalance));
  const incomingCount = snapshot.records.filter((record) => record.direction === 'received').length;
  const outgoingCount = snapshot.records.filter((record) => record.direction === 'sent').length;
  const selfCount = snapshot.records.filter((record) => record.direction === 'self').length;
  const spendableCount = snapshot.records.filter((record) => record.incoming !== undefined && record.spent === false).length;
  const spentCount = snapshot.records.filter((record) => record.incoming !== undefined && record.spent === true).length;
  const memoCount = snapshot.records.filter((record) => (record.incoming ?? record.outgoing)?.memo.length !== 0).length;
  const firstPosition = snapshot.records[0]?.position ?? null;
  const lastPosition = snapshot.records.at(-1)?.position ?? null;
  const findings: RecoveryFinding[] = visibleRecords.map((record) => {
    const incoming = record.incoming;
    const outgoing = record.outgoing;
    const note = incoming ?? outgoing;
    if (note === undefined) throw new Error('Recovered Orchard activity has no note view.');
    const presentation = shieldedFindingPresentation(record, outcome.complete);
    const finding: RecoveryFinding = {
      id: `shielded:${record.position}`,
      title: note.address,
      subtitle: `${record.direction === 'received' ? 'Received' : record.direction === 'sent' ? 'Sent output' : 'Self/change'} · pool position ${record.position}`,
      balanceAtomic: presentation.balanceAtomic,
      balanceLabel: presentation.balanceLabel,
      fields: [
        { label: 'Account/viewing-key path', value: options.accountPathLabel, copyable: true },
        { label: 'Pool position', value: record.position.toString() },
        { label: 'Direction', value: record.direction },
        { label: 'Note value', value: formatDashFromCredits(note.value) },
        { label: 'Note commitment', value: record.cmx, copyable: true },
        { label: 'Spend state', value: presentation.spendState },
        ...(record.spentAtPosition === undefined ? [] : [{ label: 'Spent at pool position', value: record.spentAtPosition.toString() }]),
        ...(note.memo.length > 0 ? [{ label: 'Memo', value: note.memo }] : []),
      ],
    };
    onFinding(finding);
    return finding;
  });

  const keyKind = snapshot.keyKind;
  const capabilityNote = keyKind === 'full'
    ? undefined
    : keyKind === 'incoming'
      ? 'An Incoming Viewing Key sees incoming notes only. It cannot see outgoing notes, cannot prove a note is unspent, and therefore has no authoritative current balance.'
      : 'An Outgoing Viewing Key sees outgoing notes only. It cannot see incoming notes and has no concept of a current balance.';
  const balanceAvailable = keyKind === 'full' && outcome.complete;
  const incompleteReason = outcome.limitReason === 'changing-tip'
    ? 'The pool kept changing while its last partial page was being reconciled.'
    : `The Orchard scan reached its ${SHIELDED_MAX_PAGES_PER_SCAN.toLocaleString()}-page safety ceiling before two proof-verified empty terminal reads.`;
  const totalScope = outcome.complete ? 'Lifetime' : 'Observed';
  const balanceMetric = balanceAvailable
    ? { label: 'Spendable balance', value: formatDashFromCredits(snapshot.balance ?? 0n), tone: (snapshot.balance ?? 0n) > 0n ? 'positive' as const : 'neutral' as const }
    : { label: 'Spendable balance', value: 'Not available · not an authoritative full balance', tone: 'neutral' as const };
  return {
    id: 'shielded',
    title: 'Dash Orchard · shielded pool',
    description: keyKind === 'full'
      ? 'The account FVK is derived locally. Each proof-verified encrypted page is decrypted inside the network-denied Secret Vault and then wiped before the next page is requested.'
      : `The pasted ${keyKind === 'incoming' ? 'Incoming' : 'Outgoing'} Viewing Key stays local. Each proof-verified encrypted page is decrypted inside the network-denied Secret Vault and then wiped before the next page is requested. ${capabilityNote ?? ''}`,
    state: outcome.complete ? 'complete' : 'partial',
    balanceAvailable,
    metrics: [
      balanceMetric,
      ...(keyKind === 'outgoing' ? [] : [{ label: `${totalScope} received`, value: formatDashFromCredits(snapshot.receivedExternal ?? 0n) }]),
      ...(keyKind === 'incoming' ? [] : [{ label: `${totalScope} sent`, value: formatDashFromCredits(snapshot.sentExternal ?? 0n) }]),
      ...(keyKind === 'full' ? [{ label: `${totalScope} self/change`, value: formatDashFromCredits(snapshot.selfOrChange ?? 0n) }] : []),
      { label: 'Incoming notes', value: String(incomingCount) },
      { label: 'Outgoing notes', value: String(outgoingCount) },
      { label: 'Self/change notes', value: String(selfCount) },
      { label: 'Spendable notes', value: balanceAvailable ? String(spendableCount) : 'Unknown' },
      { label: 'Spent notes', value: String(spentCount) },
      { label: 'Notes with memo', value: String(memoCount) },
      { label: 'Recovered notes', value: String(snapshot.records.length) },
      ...(firstPosition === null ? [] : [{ label: 'First activity pool position', value: firstPosition.toString() }]),
      ...(lastPosition === null ? [] : [{ label: 'Last activity pool position', value: lastPosition.toString() }]),
      { label: 'Pool actions checked', value: snapshot.scannedNotes.toLocaleString() },
      { label: 'DAPI pages', value: `${outcome.pageCount}${shared ? ' · one-pass batch stream' : ' · streamed'}` },
    ],
    findings,
    scanned: snapshot.scannedNotes,
    source: 'Dash Platform DAPI · proof-verified encrypted notes',
    proof: outcome.complete
      ? `Complete from pool position 0 through ${SHIELDED_EMPTY_CONFIRMATIONS} proof-verified empty terminal reads at aligned position ${outcome.terminalPosition} · proof height ${snapshot.proofHeight} · protocol ${snapshot.protocolVersion} · bounded-memory page stream${shared ? ' shared across this seed batch' : ''}`
      : `Partial: ${incompleteReason} · next aligned position ${outcome.terminalPosition} · proof height ${snapshot.proofHeight} · protocol ${snapshot.protocolVersion} · bounded-memory page stream${shared ? ' shared across this seed batch' : ''}`,
    ...(outcome.complete && capabilityNote === undefined ? {} : {
      warning: [
        ...(outcome.complete ? [] : [`${incompleteReason} Results are partial; do not treat the displayed balance as authoritative.`]),
        ...(capabilityNote === undefined ? [] : [capabilityNote]),
      ].join(' '),
    }),
  };
}

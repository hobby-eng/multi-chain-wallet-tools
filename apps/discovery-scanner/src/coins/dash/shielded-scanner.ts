import { deriveDashShielded } from '@ckd/coins/dash/shielded.js';
import { assertValidMnemonic, mnemonicToSeed } from '@ckd/core/bip39.js';
import { clearDerivationResult } from '@ckd/core/secrets.js';
import type { ResultField } from '@ckd/core/types.js';
import { ShieldedActivityLedger } from '@ckd/dash-network/activity.js';
import { assertCanonicalViewingKey, scanEncryptedPage } from '@ckd/dash-network/orchard-scanner.js';
import type { ShieldedPage } from '@ckd/dash-network/types.js';
import type { NormalizedViewingKey } from '@ckd/dash-network/viewing-key.js';
import { RecoveryConcurrencyLimiter } from '../../concurrency.js';
import { RecoveryNetworkGateway } from '../../network-gateway.js';
import { SecretEgressGuard, disposeSecretBytes } from '../../secret-guard.js';
import type {
  RecoveryFinding,
  RecoveryProgress,
  RecoveryScanConfig,
  RecoveryScanContext,
  RecoverySection,
  RecoverySeedInput,
} from '../../types.js';
import { shouldDisplayShieldedActivity } from './shielded-filter.js';
import {
  runShieldedPageStream,
  SHIELDED_EMPTY_CONFIRMATIONS,
  SHIELDED_MAX_PAGES_PER_SCAN,
  SHIELDED_PAGE_SIZE,
  type ShieldedStreamOutcome,
} from '@ckd/dash-network/shielded-stream-policy.js';
import { exactSafeInteger, exactUnsigned, formatDashFromCredits, object } from './util.js';

const PAGE_SIZE = SHIELDED_PAGE_SIZE;

interface ShieldedParticipant {
  inputId: string;
  viewingKey: NormalizedViewingKey;
  ledger: ShieldedActivityLedger;
}

function findField(fields: ResultField[], id: string): string {
  const field = fields.find((candidate) => candidate.key === id);
  if (field === undefined) throw new Error(`Dash Orchard derivation did not return ${id}.`);
  return field.value;
}

function exactBytes(value: unknown, length: number, context: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== length) {
    throw new Error(`${context} must contain exactly ${length} bytes.`);
  }
  return value;
}

function validateShieldedPage(value: unknown, maximumCount: number): ShieldedPage {
  const response = object(value, 'Isolated Orchard page response');
  if (!Array.isArray(response.notes) || response.notes.length > maximumCount) {
    throw new Error('Isolated Orchard page response contained an invalid note count.');
  }
  const notes = response.notes.map((raw) => {
    const note = object(raw, 'Isolated Orchard action');
    return {
      cmx: exactBytes(note.cmx, 32, 'Orchard note commitment'),
      nullifier: exactBytes(note.nullifier, 32, 'Orchard action nullifier'),
      cvNet: exactBytes(note.cvNet, 32, 'Orchard value commitment'),
      encryptedNote: exactBytes(note.encryptedNote, 216, 'Orchard encrypted note'),
    };
  });
  const metadata = object(response.metadata, 'Isolated Orchard proof metadata');
  return {
    notes,
    proofHeight: exactUnsigned(metadata.height, 'Orchard proof height'),
    coreChainLockedHeight: exactSafeInteger(metadata.coreChainLockedHeight, 'Orchard Core ChainLock height'),
    protocolVersion: exactSafeInteger(metadata.protocolVersion, 'Orchard protocol version'),
    timeMs: exactUnsigned(metadata.timeMs, 'Orchard proof response time'),
  };
}

function wipeShieldedPage(page: ShieldedPage): void {
  for (const note of page.notes) {
    note.cmx.fill(0);
    note.nullifier.fill(0);
    note.cvNet.fill(0);
    note.encryptedNote.fill(0);
  }
  page.notes.length = 0;
}

async function fetchShieldedPage(
  config: RecoveryScanConfig,
  gateway: RecoveryNetworkGateway,
  position: bigint,
  signal: AbortSignal,
): Promise<ShieldedPage> {
  return validateShieldedPage(await gateway.runPublic(
    { network: config.network, startPosition: position.toString(), count: PAGE_SIZE },
    'shielded.page',
    () => gateway.networkApi.shieldedPage(config.network, position.toString(), PAGE_SIZE, signal),
    signal,
  ), PAGE_SIZE);
}

function deriveViewingKey(
  seed: Uint8Array,
  config: RecoveryScanConfig,
  guard: SecretEgressGuard,
  sessionSecretGuard?: SecretEgressGuard,
): NormalizedViewingKey {
  const shieldedSeed = seed.slice();
  const derived = deriveDashShielded({
    seed: shieldedSeed,
    network: config.network,
    account: config.account,
    start: 0,
    count: 1,
  });
  try {
    const fullViewingKey = findField(derived.summary, 'fullViewingKey');
    guard.registerString('Orchard Full Viewing Key', fullViewingKey);
    if (sessionSecretGuard !== undefined) {
      const fields = [
        ...derived.basicSummary,
        ...derived.summary,
        ...derived.rows.flatMap((row) => [...row.basic, ...row.advanced]),
      ];
      for (const field of fields) {
        if (field.secret) sessionSecretGuard.registerString(field.label, field.value);
      }
    }
    const viewingKey: NormalizedViewingKey = { kind: 'full', hex: fullViewingKey };
    assertCanonicalViewingKey(viewingKey);
    return viewingKey;
  } finally {
    shieldedSeed.fill(0);
    clearDerivationResult(derived);
  }
}

function skippedSection(): RecoverySection {
  return {
    id: 'shielded',
    title: 'Dash Orchard · shielded pool',
    description: 'Account-wide Orchard recovery was disabled in the scan settings.',
    state: 'skipped',
    metrics: [{ label: 'Status', value: 'Skipped' }],
    findings: [],
    scanned: 0n,
    source: 'Not connected',
    proof: 'Not requested',
  };
}

function sectionFromLedger(
  ledger: ShieldedActivityLedger,
  config: RecoveryScanConfig,
  outcome: ShieldedStreamOutcome,
  shared: boolean,
  onFinding: (finding: RecoveryFinding) => void,
): RecoverySection {
  const snapshot = ledger.snapshot(outcome.complete);
  const visibleRecords = snapshot.records.filter((record) => shouldDisplayShieldedActivity(record, config.includeUsedZeroBalance));
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
    const unspent = incoming !== undefined && record.spent === false;
    const finding: RecoveryFinding = {
      id: `shielded:${record.position}`,
      title: note.address,
      subtitle: `${record.direction === 'received' ? 'Received' : record.direction === 'sent' ? 'Sent output' : 'Self/change'} · pool position ${record.position}`,
      balanceAtomic: unspent ? note.value : 0n,
      balanceLabel: unspent
        ? formatDashFromCredits(note.value)
        : record.spent === true ? '0 DASH · already spent' : '0 DASH · outgoing activity',
      fields: [
        { label: 'ZIP-32 account path', value: `m/32'/${config.network === 'mainnet' ? 5 : 1}'/${config.account}'`, copyable: true },
        { label: 'Pool position', value: record.position.toString() },
        { label: 'Direction', value: record.direction },
        { label: 'Note value', value: formatDashFromCredits(note.value) },
        { label: 'Note commitment', value: record.cmx, copyable: true },
        { label: 'Spend state', value: incoming === undefined ? 'Outgoing view only' : record.spent === true ? 'Spent' : 'Unspent' },
        ...(record.spentAtPosition === undefined ? [] : [{ label: 'Spent at pool position', value: record.spentAtPosition.toString() }]),
        ...(note.memo.length > 0 ? [{ label: 'Memo', value: note.memo }] : []),
      ],
    };
    onFinding(finding);
    return finding;
  });

  return {
    id: 'shielded',
    title: 'Dash Orchard · shielded pool',
    description: 'The account FVK is derived locally. Each proof-verified encrypted page is decrypted inside the network-denied Secret Vault and then wiped before the next page is requested.',
    state: outcome.complete ? 'complete' : 'partial',
    metrics: [
      { label: 'Spendable balance', value: formatDashFromCredits(snapshot.balance ?? 0n), tone: (snapshot.balance ?? 0n) > 0n ? 'positive' : 'neutral' },
      { label: 'Lifetime received', value: formatDashFromCredits(snapshot.receivedExternal ?? 0n) },
      { label: 'Lifetime sent', value: formatDashFromCredits(snapshot.sentExternal ?? 0n) },
      { label: 'Lifetime self/change', value: formatDashFromCredits(snapshot.selfOrChange ?? 0n) },
      { label: 'Incoming notes', value: String(incomingCount) },
      { label: 'Outgoing notes', value: String(outgoingCount) },
      { label: 'Self/change notes', value: String(selfCount) },
      { label: 'Spendable notes', value: String(spendableCount) },
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
      : `Partial at the ${SHIELDED_MAX_PAGES_PER_SCAN.toLocaleString()}-page safety ceiling · next aligned position ${outcome.terminalPosition} · proof height ${snapshot.proofHeight} · protocol ${snapshot.protocolVersion} · bounded-memory page stream${shared ? ' shared across this seed batch' : ''}`,
    ...(outcome.complete ? {} : {
      warning: `The Orchard scan reached its ${SHIELDED_MAX_PAGES_PER_SCAN.toLocaleString()}-page safety ceiling before two proof-verified empty terminal reads. Results are partial; do not treat the displayed balance as authoritative.`,
    }),
  };
}

async function streamPool(
  participants: readonly ShieldedParticipant[],
  config: RecoveryScanConfig,
  gateway: RecoveryNetworkGateway,
  signal: AbortSignal,
  onProgress: (progress: RecoveryProgress) => void,
): Promise<ShieldedStreamOutcome> {
  return runShieldedPageStream({
    fetchPage: (position) => fetchShieldedPage(config, gateway, position, signal),
    noteCount: (page) => page.notes.length,
    onPage: (page, visit) => {
      const noteCount = page.notes.length;
      if (noteCount > 0) {
        for (const participant of participants) {
          const matches = scanEncryptedPage(participant.viewingKey, visit.position, page.notes, config.network);
          participant.ledger.applyPage(visit.position, page, matches);
          const checked = visit.position + BigInt(noteCount);
          onProgress({
            inputId: participant.inputId,
            section: 'shielded',
            message: `Locally checked ${checked.toLocaleString()} proof-verified Orchard actions · page ${visit.pageNumber} will now be discarded`,
            completed: Number(checked > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : checked),
            total: null,
          });
        }
      } else {
        for (const participant of participants) {
          onProgress({
            inputId: participant.inputId,
            section: 'shielded',
            message: `Verified empty Orchard page ${visit.emptyConfirmation}/${SHIELDED_EMPTY_CONFIRMATIONS} at aligned position ${visit.position}`,
            completed: Number(visit.position > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : visit.position),
            total: null,
          });
        }
      }
    },
    disposePage: wipeShieldedPage,
    isCancelled: () => signal.aborted,
    yieldTurn: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
  });
}

export async function scanDashShielded(
  inputId: string,
  seed: Uint8Array,
  config: RecoveryScanConfig,
  gateway: RecoveryNetworkGateway,
  signal: AbortSignal,
  onProgress: (progress: RecoveryProgress) => void,
  onFinding: (finding: RecoveryFinding) => void,
  sessionSecretGuard?: SecretEgressGuard,
): Promise<RecoverySection> {
  if (!config.scanShieldedPool) return skippedSection();
  const viewingKey = deriveViewingKey(seed, config, gateway.guard, sessionSecretGuard);
  const ledger = new ShieldedActivityLedger('full');
  try {
    onProgress({ inputId, section: 'shielded', message: 'Streaming proof-verified Orchard pages through bounded memory', completed: 0, total: null });
    const outcome = await streamPool([{ inputId, viewingKey, ledger }], config, gateway, signal, onProgress);
    return sectionFromLedger(ledger, config, outcome, false, onFinding);
  } finally {
    viewingKey.hex = '';
  }
}

/**
 * Downloads each public Orchard page once, applies it to every locally derived
 * FVK, wipes the page, and only then requests the next page. Memory therefore
 * grows with matches, not with the total shielded pool size.
 */
export async function scanDashShieldedBatch(
  inputs: readonly RecoverySeedInput[],
  config: RecoveryScanConfig,
  context: Omit<RecoveryScanContext, 'preparedSections'>,
): Promise<ReadonlyMap<string, RecoverySection>> {
  if (!config.scanShieldedPool) return new Map(inputs.map((input) => [input.id, skippedSection()]));
  const guard = new SecretEgressGuard();
  const gateway = new RecoveryNetworkGateway(
    guard,
    context.networkApi,
    context.networkLimiter ?? new RecoveryConcurrencyLimiter(5),
  );
  const participants: ShieldedParticipant[] = [];
  try {
    // This preparation intentionally contains no await: every phrase is
    // consumed before per-wallet orchestration is allowed to clear its input.
    for (const input of inputs) {
      const mnemonic = assertValidMnemonic(input.mnemonic);
      const seed = mnemonicToSeed(mnemonic, input.passphrase);
      try {
        guard.registerString('BIP39 mnemonic', mnemonic);
        guard.registerString('BIP39 passphrase', input.passphrase);
        guard.registerBytes('BIP39 seed', seed);
        context.sessionSecretGuard?.registerString('BIP39 mnemonic', mnemonic);
        context.sessionSecretGuard?.registerString('BIP39 passphrase', input.passphrase);
        context.sessionSecretGuard?.registerBytes('BIP39 seed', seed);
        participants.push({
          inputId: input.id,
          viewingKey: deriveViewingKey(seed, config, guard, context.sessionSecretGuard),
          ledger: new ShieldedActivityLedger('full'),
        });
      } finally {
        disposeSecretBytes(seed);
      }
    }
    for (const participant of participants) {
      context.onProgress({ inputId: participant.inputId, section: 'shielded', message: 'Waiting for the shared one-pass Orchard page stream', completed: 0, total: null });
    }
    const outcome = await streamPool(participants, config, gateway, context.signal, context.onProgress);
    const results = new Map<string, RecoverySection>();
    for (const participant of participants) {
      results.set(participant.inputId, sectionFromLedger(
        participant.ledger,
        config,
        outcome,
        true,
        (finding) => context.onFinding(participant.inputId, 'shielded', finding),
      ));
    }
    return results;
  } finally {
    for (const participant of participants) participant.viewingKey.hex = '';
    guard.clear();
  }
}

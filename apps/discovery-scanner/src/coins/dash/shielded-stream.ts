import { ShieldedActivityLedger } from '@ckd/dash-network/activity.js';
import { scanEncryptedPage } from '@ckd/dash-network/orchard-scanner.js';
import {
  runShieldedPageStream,
  SHIELDED_EMPTY_CONFIRMATIONS,
  SHIELDED_PAGE_SIZE,
  type ShieldedStreamOutcome,
} from '@ckd/dash-network/shielded-stream-policy.js';
import type { ShieldedPage } from '@ckd/dash-network/types.js';
import type { NormalizedViewingKey } from '@ckd/dash-network/viewing-key.js';
import { RecoveryNetworkGateway } from '../../network-gateway.js';
import type { RecoveryNetwork, RecoveryProgress } from '../../types.js';
import { exactSafeInteger, exactUnsigned, object } from './util.js';

export interface ShieldedParticipant {
  inputId: string;
  viewingKey: NormalizedViewingKey;
  ledger: ShieldedActivityLedger;
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
  network: RecoveryNetwork,
  gateway: RecoveryNetworkGateway,
  position: bigint,
  signal: AbortSignal,
): Promise<ShieldedPage> {
  return validateShieldedPage(
    await gateway.runPublic(
      { network, startPosition: position.toString(), count: SHIELDED_PAGE_SIZE },
      'shielded.page',
      () => gateway.networkApi.shieldedPage(network, position.toString(), SHIELDED_PAGE_SIZE, signal),
      signal,
    ),
    SHIELDED_PAGE_SIZE,
  );
}

/** Streams each public page through every local viewing key and wipes it before advancing. */
export async function streamShieldedPool(
  participants: readonly ShieldedParticipant[],
  network: RecoveryNetwork,
  gateway: RecoveryNetworkGateway,
  signal: AbortSignal,
  onProgress: (progress: RecoveryProgress) => void,
): Promise<ShieldedStreamOutcome> {
  return runShieldedPageStream({
    fetchPage: (position) => fetchShieldedPage(network, gateway, position, signal),
    noteCount: (page) => page.notes.length,
    revision: (page) => page.proofHeight,
    onPage: (page, visit) => {
      const noteCount = page.notes.length;
      if (noteCount > 0) {
        for (const participant of participants) {
          const matches = scanEncryptedPage(participant.viewingKey, visit.position, page.notes, network);
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
            completed: Number(
              visit.position > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : visit.position,
            ),
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

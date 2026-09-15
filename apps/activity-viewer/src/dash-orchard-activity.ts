import type { ShieldedActivityLedger } from '@ckd/dash-network/activity.js';
import type { ViewerNetwork } from '@ckd/dash-network/types.js';
import type { ViewingKeyInputMode } from '@ckd/dash-network/viewing-key.js';
import type { ViewerSingleExportState } from './export.js';
import type { ActivityViewerView } from './view.js';

const PAINT_INTERVAL_MS = 500;

interface DashOrchardActivityOptions {
  view: ActivityViewerView;
  ShieldedActivityLedger: typeof import('@ckd/dash-network/activity.js').ShieldedActivityLedger;
  Source: typeof import('@ckd/dash-network/dash-source.js').DashEvoShieldedSource;
  assertCanonicalViewingKey: typeof import('@ckd/dash-network/orchard-scanner.js').assertCanonicalViewingKey;
  normalizeViewingKey: typeof import('@ckd/dash-network/viewing-key.js').normalizeViewingKey;
  runPageStream: typeof import('@ckd/dash-network/shielded-stream-policy.js').runShieldedPageStream;
  scanEncryptedPage: typeof import('@ckd/dash-network/orchard-scanner.js').scanEncryptedPage;
  emptyConfirmations: number;
  maxPagesPerScan: number;
  pageSize: number;
  cancelled(): boolean;
  checkCancellation(): void;
  setExportState(state: Extract<ViewerSingleExportState, { mode: 'shielded' }>): void;
  yieldTurn(): Promise<void>;
}

/** Keeps viewing-key material and Orchard page disposal inside the Orchard module. */
export async function runDashOrchardActivity(
  options: DashOrchardActivityOptions,
  network: ViewerNetwork,
  value: string,
  inputMode: ViewingKeyInputMode,
): Promise<void> {
  const viewingKey = options.normalizeViewingKey(value, inputMode);
  let lastPaintAt = 0;
  const renderProgress = (ledger: ShieldedActivityLedger, complete: boolean, force: boolean): void => {
    const now = performance.now();
    if (!force && now - lastPaintAt < PAINT_INTERVAL_MS) return;
    lastPaintAt = now;
    const snapshot = ledger.snapshot(complete);
    options.setExportState({ mode: 'shielded', network, snapshot });
    options.view.renderShielded(snapshot);
  };
  try {
    if (viewingKey.bundleNetwork !== undefined && viewingKey.bundleNetwork !== network) {
      throw new Error(`This viewing bundle is for ${viewingKey.bundleNetwork}; select that network before scanning.`);
    }
    options.assertCanonicalViewingKey(viewingKey);
    options.view.setDiagnosticDetail(`Validated canonical ${viewingKey.kind} viewing capability locally.`);
    const ledger = new options.ShieldedActivityLedger(viewingKey.kind);
    const source = new options.Source(network);
    options.view.setStatus(`Connecting to Dash Platform ${network} with trusted proof verification…`);
    const connectStarted = performance.now();
    await source.connect();
    options.checkCancellation();
    options.view.addRemoteDuration(performance.now() - connectStarted);
    options.view.setDiagnosticDetail(
      'Connected through trusted quorum discovery. Fetching proof-verified encrypted notes.',
    );
    const outcome = await options.runPageStream({
      fetchPage: async (position) => {
        options.view.setStatus(`Fetching and verifying pool actions from aligned position ${position}…`);
        const fetchStarted = performance.now();
        const page = await source.fetchPage(position, options.pageSize);
        if (!options.cancelled()) {
          options.view.addRemoteDuration(performance.now() - fetchStarted);
          options.view.recordRequest();
        }
        return page;
      },
      noteCount: (page) => page.notes.length,
      revision: (page) => page.proofHeight,
      onPage: (page, visit) => {
        options.checkCancellation();
        options.view.setDiagnosticProof(`${page.proofHeight} · protocol ${page.protocolVersion}`);
        options.view.setDiagnosticRemoteTime(page.timeMs);
        if (page.notes.length > 0) {
          const scanStarted = performance.now();
          const matches = options.scanEncryptedPage(viewingKey, visit.position, page.notes, network);
          ledger.applyPage(visit.position, page, matches);
          options.view.addLocalDuration(performance.now() - scanStarted);
        } else if (visit.emptyConfirmation < options.emptyConfirmations) {
          options.view.setStatus(
            `Confirming empty Orchard terminal page ${visit.emptyConfirmation + 1}/${options.emptyConfirmations} at aligned position ${visit.position}…`,
          );
        }
        renderProgress(ledger, false, false);
        options.view.updateTiming();
      },
      disposePage: (page) => {
        for (const note of page.notes) {
          note.cmx.fill(0);
          note.nullifier.fill(0);
          note.cvNet.fill(0);
          note.encryptedNote.fill(0);
        }
        page.notes.length = 0;
      },
      isCancelled: options.cancelled,
      yieldTurn: options.yieldTurn,
    });
    options.checkCancellation();
    if (outcome.complete) {
      renderProgress(ledger, true, true);
      options.view.setStatus(
        `Scan complete after ${options.emptyConfirmations} verified empty terminal reads. ${ledger.snapshot(true).scannedNotes} pool actions checked.`,
      );
      options.view.finishDiagnostics(
        `Proof verification and local Orchard recovery completed through aligned position ${outcome.terminalPosition}.`,
      );
    } else {
      renderProgress(ledger, false, true);
      const message =
        outcome.limitReason === 'changing-tip'
          ? 'The pool kept changing while its last partial page was being reconciled. Results are partial; retry later.'
          : `Stopped at the ${options.maxPagesPerScan.toLocaleString()}-page safety ceiling before the pool end was confirmed. Results are partial.`;
      options.view.setStatus(message);
      options.view.failDiagnostics(message);
    }
  } finally {
    viewingKey.hex = '';
  }
}

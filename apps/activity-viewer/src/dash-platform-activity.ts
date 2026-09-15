import type { ViewerNetwork } from '@ckd/dash-network/types.js';
import type { ViewerSingleExportState } from './export.js';
import type { ActivityViewerView } from './view.js';

interface DashPlatformActivityOptions {
  view: ActivityViewerView;
  AddressSource: typeof import('@ckd/dash-network/platform-address-source.js').DashPlatformAddressSource;
  assertPublicLookupInput: typeof import('@ckd/secret-boundary/public-input-guard.js').assertPublicLookupInput;
  queryHistory: typeof import('@ckd/dash-network/platform-address-history.js').queryPlatformAddressHistory;
  checkCancellation(): void;
}

/** Keeps proof-verified Platform state and auxiliary explorer history in one boundary. */
export async function runDashPlatformActivity(
  options: DashPlatformActivityOptions,
  network: ViewerNetwork,
  value: string,
  signal: AbortSignal,
): Promise<Extract<ViewerSingleExportState, { mode: 'platform' }>> {
  options.assertPublicLookupInput(value);
  const source = new options.AddressSource(network);
  const limit = Number(options.view.historyLimitInput.value);
  options.view.setStatus(`Connecting to Dash Platform ${network} with trusted proof verification…`);
  options.view.setDiagnosticDetail('Validating the DIP18 address and establishing a trusted DAPI context.');
  const connectStarted = performance.now();
  await source.connect();
  options.checkCancellation();
  options.view.addRemoteDuration(performance.now() - connectStarted);
  options.view.setRequestCount(1);
  const queryStartedAt = performance.now();
  const snapshot = await source.query(value);
  options.view.addRemoteDuration(performance.now() - queryStartedAt);
  options.checkCancellation();
  options.view.setStatus(
    'Platform state verified. Checking Platform Explorer synchronization and loading address history…',
  );
  options.view.setDiagnosticDetail(
    'DAPI proof verified. Querying the Platform Explorer address index and latest indexed height.',
  );
  const historyStartedAt = performance.now();
  const history = await options.queryHistory(value, network, limit, signal);
  options.view.addRemoteDuration(performance.now() - historyStartedAt);
  options.view.setRequestCount(1 + history.requests);
  options.checkCancellation();
  options.view.renderPlatform(snapshot, history);
  options.view.setDiagnosticSource(`Proof DAPI + ${history.endpoint}`);
  options.view.setDiagnosticProof(`DAPI ${snapshot.proofHeight} · Explorer ${history.indexedHeight.toLocaleString()}`);
  options.view.setDiagnosticRemoteTime(history.indexedTimeMs);
  options.view.setStatus(
    `Platform state verified and ${history.transitions.length.toLocaleString()} of ${history.totalTransitions.toLocaleString()} address transitions loaded.`,
  );
  options.view.finishDiagnostics(
    `Verified the GroveDB address-state proof and a ${history.indexStatus} Platform Explorer index. Proof values take precedence if the two sources disagree.`,
  );
  return { mode: 'platform', network: snapshot.network, snapshot, history };
}

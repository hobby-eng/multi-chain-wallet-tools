import type { PlatformIdentityHistoryResult } from '@ckd/dash-network/platform-identity-history.js';
import type { ViewerNetwork } from '@ckd/dash-network/types.js';
import type { ViewerSingleExportState } from './export.js';
import type { ActivityViewerView } from './view.js';

interface DashIdentityActivityOptions {
  view: ActivityViewerView;
  IdentitySource: typeof import('@ckd/dash-network/platform-identity-source.js').DashPlatformIdentitySource;
  normalizeInput: typeof import('@ckd/dash-network/platform-identity-source.js').normalizeIdentityLookupInput;
  queryHistory: typeof import('@ckd/dash-network/platform-identity-history.js').queryPlatformIdentityHistory;
  checkCancellation(): void;
}

/** Queries proof-verified Identity state before attaching optional indexed history. */
export async function runDashIdentityActivity(
  options: DashIdentityActivityOptions,
  network: ViewerNetwork,
  value: string,
  signal: AbortSignal,
): Promise<Extract<ViewerSingleExportState, { mode: 'identity' }>> {
  const input = options.normalizeInput(value);
  const source = new options.IdentitySource(network);
  const limit = Number(options.view.historyLimitInput.value);
  options.view.setStatus(`Connecting to Dash Platform ${network} with trusted proof verification…`);
  options.view.setDiagnosticDetail(`Validated ${input.label} locally. No private material was sent to the network.`);
  const connectStarted = performance.now();
  await source.connect();
  options.checkCancellation();
  options.view.addRemoteDuration(performance.now() - connectStarted);
  const lookupStarted = performance.now();
  const snapshot = await source.query(input);
  options.view.addRemoteDuration(performance.now() - lookupStarted);
  options.view.setRequestCount(snapshot.requests);
  options.checkCancellation();
  options.view.setStatus(
    snapshot.identities.length === 0
      ? 'Identity lookup proof verified. No matching Identity was found.'
      : `Verified ${snapshot.identities.length.toLocaleString()} Identity result(s). Loading synchronized indexed activity…`,
  );
  const histories: PlatformIdentityHistoryResult[] = [];
  for (const identity of snapshot.identities) {
    options.checkCancellation();
    const historyStarted = performance.now();
    try {
      const history = await options.queryHistory(identity.identifier, network, limit, signal);
      options.view.addRemoteDuration(performance.now() - historyStarted);
      histories.push({ identifier: identity.identifier, history, error: null });
    } catch (cause) {
      options.view.addRemoteDuration(performance.now() - historyStarted);
      options.checkCancellation();
      histories.push({
        identifier: identity.identifier,
        history: null,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
    options.view.setRequestCount(
      snapshot.requests + histories.reduce((total, result) => total + (result.history?.requests ?? 0), 0),
    );
  }
  const historyRequests = histories.reduce((total, result) => total + (result.history?.requests ?? 0), 0);
  options.view.setRequestCount(snapshot.requests + historyRequests);
  options.view.renderIdentity(snapshot, histories);
  const highestProof = snapshot.proofs.reduce((highest, { height }) => (height > highest ? height : highest), 0n);
  const explorerHeights = histories.flatMap(({ history }) => (history === null ? [] : [history.indexedHeight]));
  options.view.setDiagnosticSource(
    histories.some(({ history }) => history !== null)
      ? 'Proof DAPI + Dash Platform Explorer'
      : 'Dash Platform DAPI proof',
  );
  options.view.setDiagnosticProof(
    explorerHeights.length === 0
      ? `DAPI ${highestProof}`
      : `DAPI ${highestProof} · Explorer ${Math.max(...explorerHeights).toLocaleString()}`,
  );
  options.view.setDiagnosticRemoteTime(snapshot.proofs.at(-1)?.responseTimeMs ?? null);
  const historyFailures = histories.filter(({ error }) => error !== null).length;
  options.view.setStatus(
    snapshot.identities.length === 0
      ? 'Proof-verified lookup complete. No matching registered Identity exists.'
      : `Loaded ${snapshot.identities.length.toLocaleString()} proof-verified Identity result(s)${historyFailures === 0 ? ' with synchronized indexed activity' : `; indexed history failed for ${historyFailures.toLocaleString()}`}.`,
  );
  options.view.finishDiagnostics(
    `Verified ${snapshot.proofs.length.toLocaleString()} DAPI proof response(s). Explorer history is auxiliary; proof-verified Identity state remains authoritative.`,
  );
  return { mode: 'identity', network, snapshot, histories };
}

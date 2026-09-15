import type { ViewerNetwork } from '@ckd/dash-network/types.js';
import type { ViewerSingleExportState } from './export.js';
import type { ActivityViewerView } from './view.js';

interface DashCoreActivityOptions {
  view: ActivityViewerView;
  assertPublicLookupInput: typeof import('@ckd/secret-boundary/public-input-guard.js').assertPublicLookupInput;
  queryCoreAddress: typeof import('@ckd/dash-network/public-address.js').queryCoreAddress;
  cancelled(): boolean;
}

/** Runs the complete Dash Core address lookup and its diagnostic presentation. */
export async function runDashCoreActivity(
  options: DashCoreActivityOptions,
  network: ViewerNetwork,
  value: string,
  signal: AbortSignal,
): Promise<Extract<ViewerSingleExportState, { mode: 'core' }>> {
  options.assertPublicLookupInput(value);
  const limit = Number(options.view.historyLimitInput.value);
  options.view.setStatus(`Querying Dash Core ${network} address history…`);
  options.view.setDiagnosticDetail(
    'Validating the Base58Check address, checking DashScan synchronization, then loading exact-duff totals and history.',
  );
  const remoteStarted = performance.now();
  const snapshot = await options.queryCoreAddress(value, network, limit, signal);
  options.view.addRemoteDuration(performance.now() - remoteStarted);
  options.view.setRequestCount(snapshot.requests);
  const state = { mode: 'core' as const, network: snapshot.network, snapshot };
  if (options.cancelled()) return state;
  options.view.renderCore(snapshot);
  options.view.setDiagnosticSource(snapshot.endpoint);
  options.view.setDiagnosticProof(
    `DashScan ${snapshot.indexStatus} · Core height ${snapshot.indexedHeight.toLocaleString()}`,
  );
  options.view.setDiagnosticRemoteTime(snapshot.indexedTimeMs);
  options.view.setStatus(
    `Address query complete. ${snapshot.transactionCount.toLocaleString()} transactions reported; ${snapshot.transactions.length.toLocaleString()} loaded.`,
  );
  options.view.finishDiagnostics(
    `DashScan reported a synchronized index at Core height ${snapshot.indexedHeight.toLocaleString()}. Loaded address totals and ${snapshot.transactions.length.toLocaleString()} newest transaction record(s) in ${snapshot.requests} request(s).`,
  );
  return state;
}

import { describeUnknownError } from '@ckd/core/error-handling.js';
import type { ViewerNetwork } from '@ckd/dash-network/types.js';
import type { ActivityViewerDependencies } from './dependencies.js';
import type { ViewerSingleExportState } from './export.js';
import type { ActivityViewerView } from './view.js';

interface CommonQueryOptions {
  readonly dependencies: ActivityViewerDependencies;
  readonly view: ActivityViewerView;
  readonly network: ViewerNetwork;
  readonly limit: number;
  readonly signal: AbortSignal | undefined;
  readonly isCancellationRequested: () => boolean;
  readonly onFinished: () => void;
}

async function measured<T>(options: CommonQueryOptions, run: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await run();
  } finally {
    options.view.addRemoteDuration(performance.now() - startedAt);
    options.onFinished();
  }
}

function cancelled(options: CommonQueryOptions, label: string): void {
  if (options.isCancellationRequested()) throw new DOMException(`${label} batch cancelled.`, 'AbortError');
}

export function queryCoreBatchItem(
  address: string,
  options: CommonQueryOptions,
): Promise<Extract<ViewerSingleExportState, { mode: 'core' }>> {
  return measured(options, async () => {
    cancelled(options, 'Core');
    const snapshot = await options.dependencies.queryCoreAddress(
      address,
      options.network,
      options.limit,
      options.signal,
    );
    options.view.recordRequests(snapshot.requests);
    return { mode: 'core', network: snapshot.network, snapshot };
  });
}

export function queryPlatformBatchItem(
  address: string,
  source: InstanceType<ActivityViewerDependencies['DashPlatformAddressSource']>,
  options: CommonQueryOptions,
): Promise<Extract<ViewerSingleExportState, { mode: 'platform' }>> {
  return measured(options, async () => {
    cancelled(options, 'Platform');
    const snapshot = await source.query(address);
    options.view.recordRequest();
    const history = await options.dependencies.queryPlatformAddressHistory(
      address,
      options.network,
      options.limit,
      options.signal,
    );
    options.view.recordRequests(history.requests);
    return { mode: 'platform', network: snapshot.network, snapshot, history };
  });
}

export function queryIdentityBatchItem(
  lookup: ReturnType<ActivityViewerDependencies['normalizeIdentityLookupInput']>,
  source: InstanceType<ActivityViewerDependencies['DashPlatformIdentitySource']>,
  options: CommonQueryOptions,
): Promise<Extract<ViewerSingleExportState, { mode: 'identity' }>> {
  return measured(options, async () => {
    cancelled(options, 'Identity');
    const snapshot = await source.query(lookup);
    options.view.recordRequests(snapshot.requests);
    const histories: Extract<ViewerSingleExportState, { mode: 'identity' }>['histories'][number][] = [];
    for (const identity of snapshot.identities) {
      cancelled(options, 'Identity');
      try {
        const history = await options.dependencies.queryPlatformIdentityHistory(
          identity.identifier,
          options.network,
          options.limit,
          options.signal,
        );
        options.view.recordRequests(history.requests);
        histories.push({ identifier: identity.identifier, history, error: null });
      } catch (cause) {
        if (options.isCancellationRequested()) throw cause;
        histories.push({
          identifier: identity.identifier,
          history: null,
          error: cause instanceof Error ? cause.message : describeUnknownError(cause),
        });
      }
    }
    return { mode: 'identity', network: options.network, snapshot, histories };
  });
}

export interface ActivityViewerDependencies {
  ShieldedActivityLedger: typeof import('@ckd/dash-network/activity.js').ShieldedActivityLedger;
  DashEvoShieldedSource: typeof import('@ckd/dash-network/dash-source.js').DashEvoShieldedSource;
  DashPlatformAddressSource: typeof import('@ckd/dash-network/platform-address-source.js').DashPlatformAddressSource;
  DashPlatformIdentitySource: typeof import('@ckd/dash-network/platform-identity-source.js').DashPlatformIdentitySource;
  assertCanonicalViewingKey: typeof import('@ckd/dash-network/orchard-scanner.js').assertCanonicalViewingKey;
  assertAutoViewerBatchInput: typeof import('./detection.js').assertAutoViewerBatchInput;
  assertPublicBatchLookupInput: typeof import('@ckd/secret-boundary/public-input-guard.js').assertPublicBatchLookupInput;
  assertPublicLookupInput: typeof import('@ckd/secret-boundary/public-input-guard.js').assertPublicLookupInput;
  detectViewerInput: typeof import('./detection.js').detectViewerInput;
  looksLikeAutoOrchardInput: typeof import('./detection.js').looksLikeAutoOrchardInput;
  createViewerExport: typeof import('./export.js').createViewerExport;
  createViewerWorkbookExport: typeof import('./export.js').createViewerWorkbookExport;
  downloadBlob: typeof import('@ckd/export/download.js').downloadBlob;
  downloadText: typeof import('@ckd/export/download.js').downloadText;
  normalizeViewingKey: typeof import('@ckd/dash-network/viewing-key.js').normalizeViewingKey;
  normalizeIdentityLookupInput: typeof import('@ckd/dash-network/platform-identity-source.js').normalizeIdentityLookupInput;
  queryCoreAddress: typeof import('@ckd/dash-network/public-address.js').queryCoreAddress;
  queryPlatformAddressHistory: typeof import('@ckd/dash-network/platform-address-history.js').queryPlatformAddressHistory;
  queryPlatformIdentityHistory: typeof import('@ckd/dash-network/platform-identity-history.js').queryPlatformIdentityHistory;
  runBlobWorkerSelfTest: typeof import('@ckd/dash-network/blob-worker-self-test.js').runBlobWorkerSelfTest;
  runOrchardRuntimeSelfTest: typeof import('@ckd/dash-network/orchard-scanner.js').runOrchardRuntimeSelfTest;
  runShieldedPageStream: typeof import('@ckd/dash-network/shielded-stream-policy.js').runShieldedPageStream;
  scanEncryptedPage: typeof import('@ckd/dash-network/orchard-scanner.js').scanEncryptedPage;
  shieldedEmptyConfirmations: number;
  shieldedMaxPagesPerScan: number;
  shieldedPageSize: number;
}

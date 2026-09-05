import { BUILD_INFO } from '@ckd/build-info';
import { ShieldedActivityLedger } from '@ckd/dash-network/activity.js';
import { runBlobWorkerSelfTest } from '@ckd/dash-network/blob-worker-self-test.js';
import { DashEvoShieldedSource } from '@ckd/dash-network/dash-source.js';
import {
  assertCanonicalViewingKey,
  runOrchardRuntimeSelfTest,
  scanEncryptedPage,
} from '@ckd/dash-network/orchard-scanner.js';
import { queryPlatformAddressHistory } from '@ckd/dash-network/platform-address-history.js';
import { DashPlatformAddressSource } from '@ckd/dash-network/platform-address-source.js';
import { queryPlatformIdentityHistory } from '@ckd/dash-network/platform-identity-history.js';
import {
  DashPlatformIdentitySource,
  normalizeIdentityLookupInput,
} from '@ckd/dash-network/platform-identity-source.js';
import {
  assertPublicBatchLookupInput,
  assertPublicLookupInput,
} from '@ckd/dash-network/private-material.js';
import { queryCoreAddress } from '@ckd/dash-network/public-address.js';
import {
  runShieldedPageStream,
  SHIELDED_EMPTY_CONFIRMATIONS,
  SHIELDED_MAX_PAGES_PER_SCAN,
  SHIELDED_PAGE_SIZE,
} from '@ckd/dash-network/shielded-stream-policy.js';
import { normalizeViewingKey } from '@ckd/dash-network/viewing-key.js';
import { downloadText } from '@ckd/export/download.js';
import { createActivityViewerController } from './controller.js';
import { createViewerExport } from './export.js';
import { createActivityViewerView } from './view.js';

const view = createActivityViewerView(document, BUILD_INFO);
const controller = createActivityViewerController(view, {
  ShieldedActivityLedger,
  DashEvoShieldedSource,
  DashPlatformAddressSource,
  DashPlatformIdentitySource,
  assertCanonicalViewingKey,
  assertPublicBatchLookupInput,
  assertPublicLookupInput,
  createViewerExport,
  downloadText,
  normalizeViewingKey,
  normalizeIdentityLookupInput,
  queryCoreAddress,
  queryPlatformAddressHistory,
  queryPlatformIdentityHistory,
  runBlobWorkerSelfTest,
  runOrchardRuntimeSelfTest,
  runShieldedPageStream,
  scanEncryptedPage,
  shieldedEmptyConfirmations: SHIELDED_EMPTY_CONFIRMATIONS,
  shieldedMaxPagesPerScan: SHIELDED_MAX_PAGES_PER_SCAN,
  shieldedPageSize: SHIELDED_PAGE_SIZE,
});

controller.start();

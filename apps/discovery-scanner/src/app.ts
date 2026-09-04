import { BUILD_INFO } from '@ckd/build-info';
import { assertValidMnemonic } from '@ckd/core/bip39.js';
import { writeClipboard } from '@ckd/export/clipboard.js';
import { getRecoveryCoin, listRecoveryCoins } from './coins/index.js';
import { mapRecoveryTasks, RecoveryConcurrencyLimiter } from './concurrency.js';
import { createDiscoveryScannerController } from './controller.js';
import { requestRecoveryExport } from './download-client.js';
import { describeUnknownError } from './error-message.js';
import { createRecoveryExport } from './export.js';
import { recoveryNetworkApi } from './network-client.js';
import { SecretEgressGuard } from './secret-guard.js';
import { runRecoverySelfTest } from './self-test.js';
import { createDiscoveryScannerView } from './view.js';

const view = createDiscoveryScannerView(document, BUILD_INFO, writeClipboard);
const controller = createDiscoveryScannerController(view, {
  RecoveryConcurrencyLimiter,
  SecretEgressGuard,
  assertValidMnemonic,
  createRecoveryExport,
  describeUnknownError,
  getRecoveryCoin,
  listRecoveryCoins,
  mapRecoveryTasks,
  recoveryNetworkApi,
  requestRecoveryExport,
  runRecoverySelfTest,
});

controller.start();

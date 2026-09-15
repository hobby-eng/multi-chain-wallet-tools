import { assertValidMnemonic } from '@ckd/core/bip39.js';
import { getRecoveryCoin, listRecoveryCoins } from './coins/dash-community.js';
import { startDiscoveryScanner } from './start.js';
import { ALL_DISCOVERY_FEATURES } from './feature-selection.js';
import { runRecoverySelfTest } from './self-test-dash-community.js';
import { installVaultViewportBridge } from './viewport-client.js';

installVaultViewportBridge();
startDiscoveryScanner(
  { getRecoveryCoin, listRecoveryCoins },
  runRecoverySelfTest,
  assertValidMnemonic,
  ALL_DISCOVERY_FEATURES,
);

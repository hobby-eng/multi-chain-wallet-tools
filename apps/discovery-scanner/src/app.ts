import { assertValidMnemonic } from '@ckd/core/bip39.js';
import { getRecoveryCoin, listRecoveryCoins } from './coins/index.js';
import { startDiscoveryScanner } from './start.js';
import { ALL_DISCOVERY_FEATURES } from './feature-selection.js';
import { runRecoverySelfTest } from './self-test.js';
import { installVaultViewportBridge } from './viewport-client.js';
import { getRuntimeCoinAdapter } from '@ckd/coins/runtime-registry.js';
import { createBitcoinAddressSearchRunner } from './address-search-feature.js';
import { MULTI_CHAIN_WATCH_ONLY_PROFILE } from './multi-chain-watch-only.js';

installVaultViewportBridge();
startDiscoveryScanner(
  { getRecoveryCoin, listRecoveryCoins },
  runRecoverySelfTest,
  assertValidMnemonic,
  ALL_DISCOVERY_FEATURES,
  createBitcoinAddressSearchRunner(getRuntimeCoinAdapter),
  MULTI_CHAIN_WATCH_ONLY_PROFILE,
);

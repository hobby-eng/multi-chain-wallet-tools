import { getRecoveryCoin, listRecoveryCoins } from './coins/index.js';
import { startDiscoveryScanner } from './start.js';
import { runRecoverySelfTest } from './self-test.js';
import { installVaultViewportBridge } from './viewport-client.js';
import { getRuntimeCoinAdapter } from '@ckd/coins/runtime-registry.js';
import { createBitcoinAddressSearchRunner } from './address-search-feature.js';
import { MULTI_CHAIN_WATCH_ONLY_PROFILE } from './multi-chain-watch-only.js';

installVaultViewportBridge();
startDiscoveryScanner(
  { getRecoveryCoin, listRecoveryCoins },
  runRecoverySelfTest,
  createBitcoinAddressSearchRunner(getRuntimeCoinAdapter),
  MULTI_CHAIN_WATCH_ONLY_PROFILE,
);

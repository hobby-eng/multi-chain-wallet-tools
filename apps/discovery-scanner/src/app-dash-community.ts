import { getRecoveryCoin, listRecoveryCoins } from './coins/dash-community.js';
import { startDiscoveryScanner } from './start.js';
import { runRecoverySelfTest } from './self-test-dash-community.js';
import { installVaultViewportBridge } from './viewport-client.js';

installVaultViewportBridge();
startDiscoveryScanner({ getRecoveryCoin, listRecoveryCoins }, runRecoverySelfTest);

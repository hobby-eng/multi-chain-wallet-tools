import { getRecoveryCoin, listRecoveryCoins } from './coins/index.js';
import { startDiscoveryScanner } from './start.js';
import { runRecoverySelfTest } from './self-test.js';
import { installVaultViewportBridge } from './viewport-client.js';

installVaultViewportBridge();
startDiscoveryScanner({ getRecoveryCoin, listRecoveryCoins }, runRecoverySelfTest);

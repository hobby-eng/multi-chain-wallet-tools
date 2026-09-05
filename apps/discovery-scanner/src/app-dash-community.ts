import { getRecoveryCoin, listRecoveryCoins } from './coins/dash-community.js';
import { startDiscoveryScanner } from './start.js';
import { runRecoverySelfTest } from './self-test-dash-community.js';

startDiscoveryScanner({ getRecoveryCoin, listRecoveryCoins }, runRecoverySelfTest);

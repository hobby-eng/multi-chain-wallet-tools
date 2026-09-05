import { getRecoveryCoin, listRecoveryCoins } from './coins/index.js';
import { startDiscoveryScanner } from './start.js';
import { runRecoverySelfTest } from './self-test.js';

startDiscoveryScanner({ getRecoveryCoin, listRecoveryCoins }, runRecoverySelfTest);

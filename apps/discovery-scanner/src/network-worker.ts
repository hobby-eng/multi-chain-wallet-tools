import { MultiChainRecoveryNetworkService } from './network-service-multichain.js';
import { startRecoveryNetworkWorker } from './network-worker-runtime.js';

startRecoveryNetworkWorker(new MultiChainRecoveryNetworkService());

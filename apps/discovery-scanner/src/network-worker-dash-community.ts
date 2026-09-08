import { DirectRecoveryNetworkService } from './network-service.js';
import { startRecoveryNetworkWorker } from './network-worker-runtime.js';

startRecoveryNetworkWorker(new DirectRecoveryNetworkService());

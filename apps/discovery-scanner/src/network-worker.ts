import { MultiChainRecoveryNetworkService } from './network-service-multichain.js';
import { startNetworkBoundaryWorker } from '@ckd/network-boundary/worker-runtime.js';
import { executeRecoveryNetworkRequest } from './network-executor.js';
import { describeUnknownError, freeThrownValue } from '@ckd/core/error-handling.js';

startNetworkBoundaryWorker(new MultiChainRecoveryNetworkService(), executeRecoveryNetworkRequest, (cause) => {
  const message = describeUnknownError(cause);
  freeThrownValue(cause);
  return message;
});

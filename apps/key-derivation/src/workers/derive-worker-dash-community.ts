import { getRuntimeCoinAdapter } from '@ckd/coins/dash-runtime-registry.js';
import { runDashDerivationSelfTest } from '@ckd/dash-derivation-self-test';
import { startDerivationWorker } from './worker-runtime.js';

startDerivationWorker({
  getRuntimeCoinAdapter,
  runDerivationSelfTest: runDashDerivationSelfTest,
});

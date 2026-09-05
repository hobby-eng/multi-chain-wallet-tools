import { getRuntimeCoinAdapter } from '@ckd/coins/runtime-registry.js';
import { runDerivationSelfTest } from '@ckd/derivation-self-test';
import { startDerivationWorker } from './worker-runtime.js';

startDerivationWorker({ getRuntimeCoinAdapter, runDerivationSelfTest });

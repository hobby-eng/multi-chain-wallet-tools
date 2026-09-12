import { getRuntimeCoinAdapter } from '@ckd/coins/dash-runtime-registry.js';
import { runDashDerivationSelfTest } from '@ckd/dash-derivation-self-test';
import { startDerivationWorker } from './worker-runtime.js';
import { encryptDerivedP2pkhKey } from './bip38-encrypter-dash.js';
import { signDerivedMessage } from './message-signer-dash.js';

startDerivationWorker({
  getRuntimeCoinAdapter,
  runDerivationSelfTest: runDashDerivationSelfTest,
  encryptDerivedP2pkhKey,
  signDerivedMessage,
});

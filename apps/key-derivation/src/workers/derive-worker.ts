import { getRuntimeCoinAdapter } from '@ckd/coins/runtime-registry.js';
import { runDerivationSelfTest } from '@ckd/derivation-self-test';
import { startDerivationWorker } from './worker-runtime.js';
import { deriveSilentPayment } from './silent-payment.js';
import { deriveBip85 } from './bip85-deriver.js';
import { encryptDerivedP2pkhKey } from './bip38-encrypter.js';
import { signDerivedMessage } from './message-signer.js';

startDerivationWorker({
  getRuntimeCoinAdapter,
  runDerivationSelfTest,
  signDerivedMessage,
  deriveSilentPayment,
  deriveBip85,
  encryptDerivedP2pkhKey,
});

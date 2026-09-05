import { runCryptoSelfTest } from '@ckd/self-test';
import { createRecoverySelfTest } from './recovery-self-test.js';

export type { RecoverySelfTestReport } from './recovery-self-test.js';

export const runRecoverySelfTest = createRecoverySelfTest(runCryptoSelfTest);

import {
  COIN_FAMILIES,
  getAdapterFamilyId,
  getCoinAdapter,
  getDefaultCoinAdapter,
  getCoinFamily,
} from '@ckd/coins/registry.js';
import { BUILD_INFO } from '@ckd/build-info';
import { generateMnemonic, mnemonicToSeed } from '@ckd/core/bip39.js';
import { runBip39SelfTest } from '@ckd/bip39-self-test';
import { writeClipboard } from '@ckd/export/clipboard.js';
import { downloadBlob, downloadText } from '@ckd/export/download.js';
import { DerivationWorkerClient } from '../workers/derive-client.js';
import { createKeyDerivationController } from './controller.js';
import { createKeyDerivationView } from './view.js';

const view = createKeyDerivationView(document, {
  COIN_FAMILIES,
  getAdapterFamilyId,
  getCoinFamily,
});
const controller = createKeyDerivationController(view, {
  coinFamilies: COIN_FAMILIES,
  getAdapterFamilyId,
  getCoinAdapter,
  getDefaultCoinAdapter,
  buildInfo: BUILD_INFO,
  generateMnemonic,
  mnemonicToSeed,
  runBip39SelfTest,
  writeClipboard,
  downloadBlob,
  downloadText,
  createWorker: () => new DerivationWorkerClient(),
});

controller.start();

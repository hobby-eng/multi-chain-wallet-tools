import { BUILD_INFO } from '@ckd/build-info';
import { generateMnemonic, mnemonicToSeed } from '@ckd/core/bip39.js';
import type { CoinRegistry } from '@ckd/coins/registry-base.js';
import { runBip39SelfTest } from '@ckd/bip39-self-test';
import { writeClipboard } from '@ckd/export/clipboard.js';
import { downloadBlob, downloadText } from '@ckd/export/download.js';
import { DerivationWorkerClient } from '../workers/derive-client.js';
import { createKeyDerivationController } from './controller.js';
import { createKeyDerivationView } from './view.js';
import type { AddressSearchRunner } from './address-search-feature.js';

export function startKeyDerivationApp(registry: CoinRegistry, addressSearch?: AddressSearchRunner): void {
  if (BUILD_INFO.profile !== 'multi-chain' && BUILD_INFO.profile !== 'dash-community') {
    throw new Error('Key Derivation requires an offline Secret Boundary profile.');
  }
  const view = createKeyDerivationView(
    document,
    {
      COIN_FAMILIES: registry.COIN_FAMILIES,
      getAdapterFamilyId: registry.getAdapterFamilyId,
      getCoinFamily: registry.getCoinFamily,
    },
    addressSearch?.createViewElements(document),
  );
  const controller = createKeyDerivationController(view, {
    coinFamilies: registry.COIN_FAMILIES,
    getAdapterFamilyId: registry.getAdapterFamilyId,
    getCoinAdapter: registry.getCoinAdapter,
    getDefaultCoinAdapter: registry.getDefaultCoinAdapter,
    buildInfo: BUILD_INFO,
    generateMnemonic,
    mnemonicToSeed,
    runBip39SelfTest,
    writeClipboard,
    downloadBlob,
    downloadText,
    createWorker: () => new DerivationWorkerClient(),
    ...(addressSearch === undefined ? {} : { addressSearch }),
  });

  controller.start();
  installTopLevelModes();
}

function installTopLevelModes(): void {
  const deriveTab = document.querySelector<HTMLButtonElement>('#derive-generate-mode');
  const recoveryTab = document.querySelector<HTMLButtonElement>('#recovery-backup-mode');
  const standardControls = [...document.querySelectorAll<HTMLElement>('.standard-derivation-content')];
  const recoveryControls = [...document.querySelectorAll<HTMLElement>('.recovery-only')];
  if (deriveTab === null || recoveryTab === null) return;
  const setMode = (mode: 'derive' | 'recovery'): void => {
    const recovery = mode === 'recovery';
    deriveTab.classList.toggle('active', !recovery);
    recoveryTab.classList.toggle('active', recovery);
    deriveTab.setAttribute('aria-selected', String(!recovery));
    recoveryTab.setAttribute('aria-selected', String(recovery));
    for (const element of standardControls) element.hidden = recovery;
    for (const element of recoveryControls) element.hidden = !recovery;
    document.body.dataset.walletMode = mode;
  };
  setMode('derive');
  deriveTab.addEventListener('click', () => setMode('derive'));
  recoveryTab.addEventListener('click', () => setMode('recovery'));
}

declare const __CKD_HAS_RECOVERY__: boolean;
import { BUILD_INFO } from '@ckd/build-info';
import { generateMnemonic, mnemonicToSeed } from '@ckd/core/bip39.js';
import type { CoinRegistry } from '@ckd/coins/registry-base.js';
import { runBip39SelfTest } from '@ckd/bip39-self-test';
import { writeClipboard } from '@ckd/export/clipboard.js';
import { downloadBlob, downloadText } from '@ckd/export/download.js';
import { DerivationWorkerClient } from '../workers/derive-client.js';
import { createKeyDerivationController } from './controller.js';
import { createKeyDerivationView } from './view.js';
import type { WalletMatcherTargetDetector } from '@ckd/recovery/matcher-types.js';
import { installRecoveryWorkspace } from './recovery-workspace.js';
import { runRecoveryBackupSelfTest } from '@ckd/recovery-backup/self-test.js';
import * as derivationFeatures from './derivation-feature-selection.js';

export function startKeyDerivationApp(registry: CoinRegistry, detectTargets: WalletMatcherTargetDetector): void {
  if (BUILD_INFO.profile !== 'multi-chain' && BUILD_INFO.profile !== 'dash-community') {
    throw new Error('Key Derivation requires an offline Secret Boundary profile.');
  }
  const view = createKeyDerivationView(document, {
    COIN_FAMILIES: registry.COIN_FAMILIES,
    getAdapterFamilyId: registry.getAdapterFamilyId,
    getCoinFamily: registry.getCoinFamily,
  });
  const modes = installTopLevelModes();
  const recovery = __CKD_HAS_RECOVERY__
    ? installRecoveryWorkspace({
        registry,
        detectTargets,
        mnemonicToSeed,
        writeClipboard,
        useMnemonicInDeriver(mnemonic) {
          const mnemonicInput = document.querySelector<HTMLTextAreaElement>('#mnemonic');
          const passphraseInput = document.querySelector<HTMLInputElement>('#passphrase');
          if (mnemonicInput === null || passphraseInput === null) {
            throw new Error('The primary recovery source fields are unavailable.');
          }
          modes.setMode('derive');
          mnemonicInput.value = mnemonic;
          passphraseInput.value = '';
          mnemonicInput.dispatchEvent(new Event('input', { bubbles: true }));
          passphraseInput.dispatchEvent(new Event('input', { bubbles: true }));
          mnemonicInput.focus({ preventScroll: true });
          document.querySelector<HTMLElement>('.input-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      })
    : {
        useSource() {
          throw new Error('Recovery & Backup is not included in this build.');
        },
        setCryptoEnabled() {},
      };
  const controller = createKeyDerivationController(view, {
    coinFamilies: registry.COIN_FAMILIES,
    getAdapterFamilyId: registry.getAdapterFamilyId,
    getCoinAdapter: registry.getCoinAdapter,
    getDefaultCoinAdapter: registry.getDefaultCoinAdapter,
    buildInfo: BUILD_INFO,
    generateMnemonic,
    mnemonicToSeed,
    runBip39SelfTest,
    runRecoveryBackupSelfTest,
    setRecoveryControlsEnabled: recovery.setCryptoEnabled,
    writeClipboard,
    downloadBlob,
    downloadText,
    createWorker: () => new DerivationWorkerClient(),
    ...derivationFeatures,
    openRecoverySource(reference, target) {
      modes.setMode('recovery');
      recovery.useSource(reference, target);
    },
  });

  controller.start();
}

function installTopLevelModes(): Readonly<{ setMode(mode: 'derive' | 'recovery'): void }> {
  const deriveTab = document.querySelector<HTMLButtonElement>('#derive-generate-mode');
  const recoveryTab = document.querySelector<HTMLButtonElement>('#recovery-backup-mode');
  const derivePanels = [...document.querySelectorAll<HTMLElement>('.derive-only')];
  const recoveryPanels = [...document.querySelectorAll<HTMLElement>('.recovery-only')];
  if (deriveTab === null || (__CKD_HAS_RECOVERY__ && recoveryTab === null))
    throw new Error('Key Derivation mode tabs are missing.');
  const setMode = (mode: 'derive' | 'recovery'): void => {
    const recovery = mode === 'recovery';
    deriveTab.classList.toggle('active', !recovery);
    recoveryTab?.classList.toggle('active', recovery);
    deriveTab.setAttribute('aria-selected', String(!recovery));
    recoveryTab?.setAttribute('aria-selected', String(recovery));
    for (const element of derivePanels) {
      if (recovery) {
        element.dataset.hiddenBeforeRecovery = String(element.hidden);
        element.hidden = true;
      } else if (element.dataset.hiddenBeforeRecovery !== undefined) {
        element.hidden = element.dataset.hiddenBeforeRecovery === 'true';
        delete element.dataset.hiddenBeforeRecovery;
      }
    }
    for (const element of recoveryPanels) element.hidden = !recovery;
    document.body.dataset.walletMode = mode;
  };
  setMode('derive');
  deriveTab.addEventListener('click', () => setMode('derive'));
  recoveryTab?.addEventListener('click', () => setMode('recovery'));
  return { setMode };
}

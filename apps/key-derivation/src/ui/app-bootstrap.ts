declare const __CKD_HAS_RECOVERY__: boolean;
import { BUILD_INFO } from "@ckd/build-info";
import { generateMnemonic, mnemonicToSeed } from "@ckd/core/bip39.js";
import type { CoinRegistry } from "@ckd/coins/registry-base.js";
import { runBip39SelfTest } from "@ckd/bip39-self-test";
import { writeClipboard } from "@ckd/export/clipboard.js";
import { downloadBlob, downloadText } from "@ckd/export/download.js";
import { DerivationWorkerClient } from "../workers/derive-client.js";
import { createKeyDerivationController } from "./controller.js";
import { createKeyDerivationView } from "./view.js";
import { installChosenWordsFeature } from "./chosen-words-feature.js";
import type { WalletMatcherTargetDetector } from "@ckd/recovery/matcher-types.js";
import { installRecoveryWorkspace } from "./recovery-workspace.js";
import { runRecoveryBackupSelfTest } from "@ckd/recovery-backup/self-test.js";
import * as derivationFeatures from "./derivation-feature-selection.js";
import { installTopLevelModes } from "./top-level-modes.js";
import { FullSelfTestSection } from "./full-self-test.js";
import { runStartupSelfTests } from "./startup-self-test.js";
import { RecoveryDeriverHandoff } from "./recovery-deriver-handoff.js";

export function startKeyDerivationApp(
  registry: CoinRegistry,
  detectTargets: WalletMatcherTargetDetector,
): void {
  if (BUILD_INFO.profile !== "multi-chain" && BUILD_INFO.profile !== "dash-community") {
    throw new Error("Key Derivation requires an offline Secret Boundary profile.");
  }
  const view = createKeyDerivationView(document, {
    COIN_FAMILIES: registry.COIN_FAMILIES,
    getAdapterFamilyId: registry.getAdapterFamilyId,
    getCoinFamily: registry.getCoinFamily,
  });
  const modes = installTopLevelModes();
  const handoff = new RecoveryDeriverHandoff(document, () => modes.setMode("derive"));
  const recovery = __CKD_HAS_RECOVERY__
    ? installRecoveryWorkspace({
        registry,
        detectTargets,
        mnemonicToSeed,
        writeClipboard,
        downloadText,
        useMnemonicInDeriver: handoff.use.bind(handoff),
      })
    : {
        useSource() {
          throw new Error("Recover & Back Up is not included in this build.");
        },
        offerSource() {},
        setCryptoEnabled() {},
        jobs: undefined,
      };
  const createWorker = () => new DerivationWorkerClient();
  // The person's full self-test: the startup checks again with the slower vectors, then the
  // self-tests that the backup methods add. It is enabled with the other controls once the startup
  // checks pass, runs as a heavy job of Recover & Back Up, and a failure closes the controls.
  const fullSelfTest = new FullSelfTestSection(
    () =>
      runStartupSelfTests(
        { runBip39SelfTest, runRecoveryBackupSelfTest, createWorker, ...derivationFeatures },
        true,
      ),
    recovery.jobs,
  );
  const controller = createKeyDerivationController(view, {
    coinFamilies: registry.COIN_FAMILIES,
    getAdapterFamilyId: registry.getAdapterFamilyId,
    getCoinAdapter: registry.getCoinAdapter,
    getDefaultCoinAdapter: registry.getDefaultCoinAdapter,
    buildInfo: BUILD_INFO,
    generateMnemonic,
    chosenWords: installChosenWordsFeature(),
    mnemonicToSeed,
    runBip39SelfTest,
    runRecoveryBackupSelfTest,
    setRecoveryControlsEnabled(enabled) {
      recovery.setCryptoEnabled(enabled);
      fullSelfTest.enabled = enabled;
    },
    onFullSelfTestFailure: (listener) => {
      fullSelfTest.onFailure(listener);
      if ("onSelfTestFailure" in recovery) recovery.onSelfTestFailure(listener);
    },
    writeClipboard,
    downloadBlob,
    downloadText,
    createWorker,
    ...derivationFeatures,
    openRecoverySource(reference, target) {
      modes.setMode("recovery");
      recovery.useSource(reference, target);
    },
    offerRecoverySource(reference) {
      recovery.offerSource(reference);
    },
  });

  controller.start();
}

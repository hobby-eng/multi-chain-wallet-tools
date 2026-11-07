import { BIP39_WORD_COUNTS, type Bip39WordCount } from "@ckd/core/bip39-word-counts.js";
import { isTabKey, tabIndexAfter } from "@ckd/ui/tabs.js";
import { isAbortError } from "@ckd/core/error-handling.js";
import type { CoinAdapter } from "@ckd/coins/registry.js";
import {
  applySharedDerivationControls,
  readControls,
  type DerivationFeatureTab,
} from "./inputs.js";
import { DerivationErrorText } from "./derivation-error-text.js";
import type { DerivationWorkerClient } from "../workers/derive-client.js";

import type { KeyDerivationView } from "./view.js";
import type { AddressSearchRunner } from "./address-search-feature.js";
import type { RecoverySourceReference, RecoverySourceTarget } from "./recovery-source-link.js";
import { installMnemonicDiagnosticFeature } from "./mnemonic-diagnostic-feature.js";
import { MainDerivation } from "./main-derivation.js";
import { DerivationWorkspaceTabs } from "./derivation-workspace-tabs.js";
import { DerivationResultPanel } from "./derivation-result-panel.js";
import { LargeRequestPolicy } from "./large-request-policy.js";
import { installRecoverySourceController } from "./recovery-source-controller.js";
import { AdapterSettingsStore } from "./adapter-settings.js";
import { AutomaticDerivationScheduler } from "./automatic-derivation.js";
import { runStartupSelfTests } from "./startup-self-test.js";
import { SELF_TEST_NOT_PASSED } from "./crypto-self-test-gate.js";
import { FieldEdits } from "./field-edits.js";
import { DerivationResults } from "@ckd/ui/derivation-results.js";
import { DeriverSource } from "./deriver-source.js";

interface KeyDerivationDependencies {
  coinFamilies: typeof import("@ckd/coins/registry.js").COIN_FAMILIES;
  getAdapterFamilyId: typeof import("@ckd/coins/registry.js").getAdapterFamilyId;
  getCoinAdapter: typeof import("@ckd/coins/registry.js").getCoinAdapter;
  getDefaultCoinAdapter: typeof import("@ckd/coins/registry.js").getDefaultCoinAdapter;
  buildInfo: typeof import("@ckd/build-info").BUILD_INFO;
  generateMnemonic: typeof import("@ckd/core/bip39.js").generateMnemonic;
  chosenWords?: import("./chosen-words-feature.js").ChosenWordsFeature;
  installCheckedMnemonicFeature?: typeof import("./checked-mnemonic-feature.js").installCheckedMnemonicFeature;
  mnemonicToSeed: typeof import("@ckd/core/bip39.js").mnemonicToSeed;
  runBip39SelfTest: typeof import("@ckd/bip39-self-test").runBip39SelfTest;
  runRecoveryBackupSelfTest: typeof import("@ckd/recovery-backup/self-test.js").runRecoveryBackupSelfTest;
  setRecoveryControlsEnabled(enabled: boolean): void;
  /** Registers what the controller does when the person's full self-test fails. */
  onFullSelfTestFailure?(listener: (cause: unknown) => void): void;
  writeClipboard: typeof import("@ckd/export/clipboard.js").writeClipboard;
  downloadBlob: typeof import("@ckd/export/download.js").downloadBlob;
  downloadText: typeof import("@ckd/export/download.js").downloadText;
  createWorker(): DerivationWorkerClient;
  addressSearch?: AddressSearchRunner;
  openRecoverySource?(reference: RecoverySourceReference, target: RecoverySourceTarget): void;
  offerRecoverySource?(reference: RecoverySourceReference | null): void;
  installSilentPaymentFeature?: typeof import("./silent-payment-feature.js").installSilentPaymentFeature;
  installBip85Feature?: typeof import("./bip85-feature.js").installBip85Feature;
  installBip38EncryptionFeature?: ReturnType<
    typeof import("./bip38-encryption-feature.js").createBip38EncryptionInstaller
  >;
  installMessageSigningFeature?: ReturnType<
    typeof import("./message-signing-feature.js").createMessageSigningInstaller
  >;
}

import { defined } from "@ckd/core/defined.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
const ERRORS = new ErrorCatalog("wallet.deriver", {
  startup: () => "A cryptographic startup check returned a failed result.",
});
/** Composes the independent Deriver operations and binds their native page lifecycle. */
export class KeyDerivationController {
  readonly #view: KeyDerivationView;
  readonly #dependencies: KeyDerivationDependencies;
  #started = false;
  #adapter: CoinAdapter;
  #results: DerivationResults;
  #cryptoReady: boolean;
  #checkedMnemonic:
    ReturnType<NonNullable<KeyDerivationDependencies["installCheckedMnemonicFeature"]>> | undefined;
  #adapterSettings: AdapterSettingsStore;
  #automaticDerivation: AutomaticDerivationScheduler;
  #workspaceTabs: DerivationWorkspaceTabs;
  #resultPanel: DerivationResultPanel;
  #source: DeriverSource;
  #bip38Feature:
    ReturnType<NonNullable<KeyDerivationDependencies["installBip38EncryptionFeature"]>> | undefined;
  #mnemonicDiagnostic: ReturnType<typeof installMnemonicDiagnosticFeature>;
  #bip85Feature: ReturnType<NonNullable<KeyDerivationDependencies["installBip85Feature"]>> | null;
  #messageSigning:
    ReturnType<NonNullable<KeyDerivationDependencies["installMessageSigningFeature"]>> | undefined;
  #largeRequestPolicy: LargeRequestPolicy;
  #silentPaymentFeature:
    ReturnType<NonNullable<KeyDerivationDependencies["installSilentPaymentFeature"]>> | undefined;
  #derivation: MainDerivation;
  constructor(view: KeyDerivationView, dependencies: KeyDerivationDependencies) {
    this.#view = view;
    this.#dependencies = dependencies;
    this.#adapter = dependencies.getDefaultCoinAdapter(defined(dependencies.coinFamilies[0]).id);
    this.#results = new DerivationResults();
    this.#cryptoReady = false;
    this.#checkedMnemonic = this.#dependencies.installCheckedMnemonicFeature?.(
      this.#view.document,
      this.#invalidateGeneration,
    );
    this.#adapterSettings = new AdapterSettingsStore(this.#dependencies.getAdapterFamilyId);
    this.#automaticDerivation = new AutomaticDerivationScheduler(window);
    this.#workspaceTabs = new DerivationWorkspaceTabs({
      view: this.#view,
      adapter: () => this.#adapter,
      hasResults: () => this.#results.current !== null,
      silentPaymentAvailable: this.#dependencies.installSilentPaymentFeature !== undefined,
      activate: (feature) => this.#activateFeature(feature),
      schedule: () => this.#scheduleAutomaticDerivation(),
      placeDisclosure: () => this.#resultPanel.placeDisclosureControl(),
    });
    this.#resultPanel = new DerivationResultPanel({
      view: this.#view,
      results: this.#results,
      adapter: () => this.#adapter,
      feature: () => this.#workspaceTabs.active,
      bip38: () => this.#bip38Feature,
      signing: () => this.#messageSigning,
      bip85: () => this.#bip85Feature,
      silentPayment: () => this.#silentPaymentFeature,
      release: (action) => this.#releaseOwnedPart(action),
      writeClipboard: this.#dependencies.writeClipboard,
      downloadBlob: this.#dependencies.downloadBlob,
      downloadText: this.#dependencies.downloadText,
    });
    this.#source = new DeriverSource(this.#view, {
      writeClipboard: this.#dependencies.writeClipboard,
      onVisibility: () => this.#mnemonicDiagnostic.update(),
      ...(this.#dependencies.chosenWords === undefined
        ? {}
        : { chosenWords: this.#dependencies.chosenWords }),
      ...(this.#dependencies.offerRecoverySource === undefined
        ? {}
        : {
            offer: (reference: RecoverySourceReference | null) =>
              this.#dependencies.offerRecoverySource?.(reference),
          }),
    });
    this.#bip38Feature = this.#dependencies.installBip38EncryptionFeature?.({
      document: this.#view.document,
      controls: this.#view.controls,
      adapter: () => this.#adapter,
      result: () => this.#results.current,
      branch: () => this.#results.active,
      ...this.#sourceOperations(),
      render: () => this.#resultPanel.render(),
      cryptoReady: () => this.#cryptoReady,
    });
    this.#mnemonicDiagnostic = installMnemonicDiagnosticFeature({
      view: this.#view,
      mnemonic: this.#view.mnemonic,
      passphrase: this.#view.passphrase,
      sourceRevealed: () => this.#source.revealed,
      cryptoReady: () => this.#cryptoReady,
      mnemonicToSeed: this.#dependencies.mnemonicToSeed,
    });
    this.#bip85Feature = null;
    this.#messageSigning = this.#dependencies.installMessageSigningFeature?.({
      document: this.#view.document,
      mainSource: () => ({
        adapter: this.#adapter,
        controls: this.#view.controls,
        mnemonic: this.#view.mnemonic.value,
        passphrase: this.#view.passphrase.value,
      }),
      bip85Source: () =>
        this.#bip85Feature?.childSource() ?? {
          adapter: null,
          controls: null,
          mnemonic: null,
          passphrase: "",
        },
      mnemonicToSeed: this.#dependencies.mnemonicToSeed,
      createWorker: () => this.#dependencies.createWorker(),
      copy: (button, text) => {
        void this.#resultPanel.exports.copyText(button, text, false);
      },
      cryptoReady: () => this.#cryptoReady,
    });
    this.#largeRequestPolicy = new LargeRequestPolicy({
      adapter: () => this.#adapter,
      activeFeatureTab: () => this.#workspaceTabs.active,
      showConfirmation: () => this.#view.showLargeRequestConfirmation(),
      showStatus: (message) => this.#view.showStatus(message),
    });
    this.#silentPaymentFeature = this.#dependencies.installSilentPaymentFeature?.({
      document: this.#view.document,
      ...this.#sourceOperations(),
      isActive: () => this.#workspaceTabs.active === "silent-payment",
      mnemonicMayBeComplete: this.#mnemonicDiagnostic.mayBeComplete,
      cryptoReady: () => this.#cryptoReady,
    });
    this.#derivation = new MainDerivation({
      view: this.#view,
      results: this.#results,
      panel: this.#resultPanel,
      tabs: this.#workspaceTabs,
      settings: this.#adapterSettings,
      policy: this.#largeRequestPolicy,
      adapter: () => this.#adapter,
      cryptoReady: () => this.#cryptoReady,
      cancelAutomatic: () => this.#cancelAutomaticDerivation(),
      bip38: () => this.#bip38Feature,
      createWorker: () => this.#dependencies.createWorker(),
      mnemonicToSeed: this.#dependencies.mnemonicToSeed,
    });
    this.#installChildWallet();
  }
  #sourceOperations() {
    return {
      mnemonic: () => this.#view.mnemonic.value,
      passphrase: () => this.#view.passphrase.value,
      mnemonicToSeed: this.#dependencies.mnemonicToSeed,
      createWorker: () => this.#dependencies.createWorker(),
    };
  }

  #installChildWallet(): void {
    this.#bip85Feature =
      this.#dependencies.installBip85Feature?.({
        document: this.#view.document,
        coinFamilies: this.#dependencies.coinFamilies,
        getAdapterFamilyId: this.#dependencies.getAdapterFamilyId,
        getCoinAdapter: this.#dependencies.getCoinAdapter,
        getDefaultCoinAdapter: this.#dependencies.getDefaultCoinAdapter,
        parentMnemonic: () => this.#view.mnemonic.value,
        parentPassphrase: () => this.#view.passphrase.value,
        isActive: () => this.#workspaceTabs.active === "bip85",
        mnemonicMayBeComplete: this.#mnemonicDiagnostic.mayBeComplete,
        cryptoReady: () => this.#cryptoReady,
        secretsRevealed: () => this.#resultPanel.revealed,
        setSecretsRevealed: (revealed) => this.#resultPanel.setRevealed(revealed),
        mnemonicToSeed: this.#dependencies.mnemonicToSeed,
        createWorker: () => this.#dependencies.createWorker(),
        ...(this.#messageSigning === undefined ? {} : { messageSigning: this.#messageSigning }),
        // The derived child wallet offers Silent Payments through the same feature module.
        ...(this.#dependencies.installSilentPaymentFeature === undefined
          ? {}
          : { installSilentPaymentFeature: this.#dependencies.installSilentPaymentFeature }),
        copyText: this.#resultPanel.exports.copyText,
        copyBulkFrom: this.#resultPanel.exports.copyRows,
        downloadRowsFrom: this.#resultPanel.exports.downloadRows,
        invalidateExports: () => this.#resultPanel.exports.invalidate(),
        downloadText: this.#dependencies.downloadText,
        showError: (message) => this.#view.showError(message),
        showStatus: (message) => this.#view.showStatus(message),
      }) ?? null;
  }
  readonly #invalidateGeneration = (): void => {
    this.#checkedMnemonic?.cancel();
    this.#derivation.advance();
    this.#view.clearMessages();
  };
  readonly #activateFeature = (feature: Exclude<DerivationFeatureTab, null>): void => {
    this.#cancelAutomaticDerivation();
    const messages = {
      "silent-payment": "Derivation mode changed to the selected payment protocol.",
      bip85: "Derivation mode changed to BIP85.",
      coinjoin: "Derivation mode changed to Dash Mobile CoinJoin.",
    };
    this.#derivation.stop(messages[feature]);
    if (feature === "coinjoin") this.#invalidateAddressSearch();
    this.#derivation.advance();
    this.#resultPanel.clear();
    if (feature === "coinjoin") {
      this.#largeRequestPolicy.clear();
      this.#view.resetDeriveAction();
    }
    this.#workspaceTabs.select(feature);
    if (!this.#mnemonicDiagnostic.mayBeComplete()) return;
    if (feature === "silent-payment") this.#silentPaymentFeature?.derive();
    else if (feature === "bip85") void this.#bip85Feature?.derive();
    else void this.#derivation.run(true);
  };
  readonly #releaseOwnedPart = (release: () => void): void => {
    try {
      release();
    } catch {
      // Clear and source edits finish their other cleanup before the diagnostic is shown.
      queueMicrotask(() => this.#view.showError(DerivationErrorText.CLEANUP_FAILURE));
    }
  };
  readonly #invalidateAddressSearch = (): void => {
    this.#releaseOwnedPart(() => this.#dependencies.addressSearch?.invalidate());
    this.#view.hideSearchResult();
  };
  readonly #cancelAutomaticDerivation = (): void => {
    this.#automaticDerivation.cancel();
  };
  readonly #scheduleAutomaticDerivation = (): void => {
    this.#automaticDerivation.schedule(
      () => this.#cryptoReady && this.#mnemonicDiagnostic.mayBeComplete(),
      () => {
        if (this.#workspaceTabs.active === "silent-payment") {
          this.#silentPaymentFeature?.derive();
        } else if (this.#workspaceTabs.active === "bip85") {
          void this.#bip85Feature?.derive();
        } else {
          void this.#derivation.run(true);
        }
      },
    );
  };
  readonly #rememberCurrentSettings = (): void => {
    try {
      this.#adapterSettings.remember(
        this.#adapter,
        readControls(this.#adapter, this.#view.controls),
      );
    } catch {
      // Invalid partially edited controls are not persisted across variants.
    }
  };
  readonly #resetForAdapter = (next: CoinAdapter, autoDerive = true): void => {
    this.#cancelAutomaticDerivation();
    this.#invalidateAddressSearch();
    this.#rememberCurrentSettings();
    this.#derivation.stop();
    this.#derivation.advance();
    this.#resultPanel.clear();
    this.#results.resetCoinJoin();
    this.#largeRequestPolicy.clear();
    this.#view.resetDeriveAction();
    this.#adapter = next;
    this.#adapterSettings.selectVariant(this.#adapter);
    const remembered = this.#adapterSettings.controlsFor(this.#adapter);
    this.#view.configureControls(
      this.#adapter,
      applySharedDerivationControls(this.#adapter, remembered.values, remembered.shared),
    );
    this.#workspaceTabs.sync();
    this.#view.clearMessages();
    this.#view.hideSearchResult();
    if (autoDerive && this.#mnemonicDiagnostic.mayBeComplete()) void this.#derivation.run(true);
  };
  readonly #populateBuildPassport = (): void => {
    this.#view.populateBuildPassport(this.#dependencies.buildInfo);
  };
  readonly #setCryptoControlsEnabled = (enabled: boolean): void => {
    this.#view.setCryptoControlsEnabled(enabled);
    this.#checkedMnemonic?.setEnabled(enabled);
    this.#bip85Feature?.setEnabled(enabled);
    this.#silentPaymentFeature?.setEnabled(enabled);
    this.#dependencies.setRecoveryControlsEnabled(enabled);
  };
  readonly #failCryptoSelfTest = (cause: unknown): void => {
    this.#cryptoReady = false;
    this.#cancelAutomaticDerivation();
    this.#derivation.stop("The cryptographic self-test failed.");
    this.#invalidateAddressSearch();
    this.#derivation.advance();
    this.#resultPanel.clear();
    if (this.#messageSigning?.isOpen() === true) this.#messageSigning.close();
    this.#view.showCryptoSelfTestFailed(cause);
    this.#setCryptoControlsEnabled(false);
    this.#view.showError("Cryptographic self-test failed. This build will not derive wallet keys.");
  };
  readonly #initializeCryptoRuntime = async (): Promise<void> => {
    this.#setCryptoControlsEnabled(false);
    try {
      const report = await runStartupSelfTests({
        runBip39SelfTest: this.#dependencies.runBip39SelfTest,
        runRecoveryBackupSelfTest: this.#dependencies.runRecoveryBackupSelfTest,
        createWorker: () => this.#dependencies.createWorker(),
      });
      this.#cryptoReady = report.passed;
      if (!report.passed) throw ERRORS.create("startup", []);
      this.#view.showCryptoSelfTestPassed(report.checks, report.durationMs);
      this.#setCryptoControlsEnabled(true);
      this.#mnemonicDiagnostic.update();
      this.#scheduleAutomaticDerivation();
    } catch (cause) {
      this.#failCryptoSelfTest(cause);
    }
  };
  readonly #invalidateParentFeatures = (): void => {
    this.#releaseOwnedPart(() => this.#bip85Feature?.invalidate());
    this.#releaseOwnedPart(() => this.#silentPaymentFeature?.clear());
  };
  readonly #generatePhrase = async (words: Bip39WordCount): Promise<void> => {
    if (!this.#cryptoReady) {
      this.#view.showError(SELF_TEST_NOT_PASSED);
      return;
    }
    this.#source.changed();
    this.#checkedMnemonic?.cancel();
    this.#cancelAutomaticDerivation();
    this.#invalidateAddressSearch();
    this.#derivation.advance();
    this.#resultPanel.clear();
    this.#view.clearMessages();
    const revision = this.#derivation.revision;
    const wishes =
      this.#dependencies.chosenWords?.active() === true ? this.#dependencies.chosenWords : null;
    try {
      let phrase: string;
      const checkedFeature = this.#checkedMnemonic;
      const checked = checkedFeature?.active() === true;
      if (checkedFeature !== undefined && checked) {
        const request = wishes?.request(words) ?? {
          wordCount: words,
          chosen: [],
          neverUse: [],
        };
        phrase = await checkedFeature.generate(
          words,
          this.#view.passphrase.value,
          request,
          (line) => {
            if (revision === this.#derivation.revision) this.#view.showStatus(line);
          },
        );
      } else if (wishes === null) {
        phrase = this.#dependencies.generateMnemonic(words);
      } else {
        this.#view.showStatus(
          `Looking for a random ${words}-word phrase that meets your chosen words…`,
        );
        phrase = await wishes.generate(words);
        // Sampling finished in one synchronous call; a newer input before publication wins.
        if (revision !== this.#derivation.revision) return;
      }
      if (revision !== this.#derivation.revision || !this.#cryptoReady) return;
      // A new phrase is a new wallet: an ordinary generation starts it without the BIP39
      // passphrase of the last one, which the field shows only as dots, so that no address of
      // the new phrase is taken unnoticed from the wallet with that passphrase (owner's
      // decision, 2026-10-08). The MHFE wallet check keeps it: the phrase was drawn for the
      // passphrase confirmed there.
      const passphraseCleared = !checked && this.#view.passphrase.value !== "";
      if (!checked) this.#view.passphrase.value = "";
      // Generation replaces the parent without an input event. Revoke its descendants before
      // publishing the new source (AUD-022-SEC001, AUD-028-API008).
      this.#invalidateParentFeatures();
      this.#source.publish(phrase, this.#adapter.defaults.count);
      this.#rememberCurrentSettings();
      this.#mnemonicDiagnostic.update();
      this.#view.showStatus(
        `Generated a new ${words}-word BIP39 recovery phrase using crypto.getRandomValues()${wishes === null ? "" : ", with your chosen words"}${checked ? ", passing the MHFE wallet check with the BIP39 passphrase you confirmed" : ""}.${passphraseCleared ? " The BIP39 passphrase field was emptied: a new phrase starts without one; type one now if this wallet should use one." : ""} Deriving ${this.#adapter.defaults.count} results…`,
      );
      void this.#derivation.run(true);
    } catch (cause) {
      // A cancelled search was replaced by a newer action, which reports for itself. A wish that
      // cannot be met is reported as an error; no ordinary phrase is put in its place.
      if (isAbortError(cause) || revision !== this.#derivation.revision) return;
      this.#view.showError(
        cause instanceof Error ? cause.message : "Secure phrase generation failed.",
      );
    }
  };
  readonly #clearAll = (): void => {
    this.#releaseOwnedPart(() => this.#source.wipe());
    this.#cancelAutomaticDerivation();
    this.#derivation.stop("Derivation cleared by the user.");
    this.#invalidateAddressSearch();
    this.#derivation.advance();
    this.#largeRequestPolicy.clear();
    // Browser strings are immutable, so this only releases DOM references; mutable seed bytes are zeroed separately.
    this.#resultPanel.clear();
    this.#results.resetCoinJoin();
    this.#adapterSettings.clear();
    this.#view.configureControls(this.#adapter);
    this.#resultPanel.setRevealed(false);
    this.#view.clearMessages();
    this.#releaseOwnedPart(() => this.#messageSigning?.invalidate());
    this.#releaseOwnedPart(() => {
      if (this.#messageSigning?.isOpen() === true) this.#messageSigning.close();
    });
    this.#releaseOwnedPart(() => this.#bip38Feature?.reset());
    this.#releaseOwnedPart(() => this.#bip85Feature?.reset());
    this.#workspaceTabs.reset();
    this.#releaseOwnedPart(() => this.#silentPaymentFeature?.reset());
    this.#dependencies.chosenWords?.clear();
    this.#checkedMnemonic?.clear();
    this.#mnemonicDiagnostic.reset();
  };
  readonly #concealSensitiveValues = (): void => {
    if (this.#source.revealed) this.#source.setRevealed(false);
    if (this.#resultPanel.revealed) this.#resultPanel.setRevealed(false);
  };
  /** Install once; construction does not run cryptographic self-tests. */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#dependencies.chosenWords?.onChange(this.#invalidateGeneration);
    if (this.#checkedMnemonic !== undefined)
      this.#dependencies.chosenWords?.useChecked(this.#checkedMnemonic);
    this.#view.populateCoinSelect();
    this.#adapterSettings.selectVariant(this.#adapter);
    this.#view.configureControls(this.#adapter);
    this.#workspaceTabs.sync();
    this.#mnemonicDiagnostic.update();
    this.#view.updateMode(this.#results.mode);
    this.#resultPanel.updateBulkActions();
    this.#dependencies.onFullSelfTestFailure?.(this.#failCryptoSelfTest);
    this.#populateBuildPassport();
    void this.#initializeCryptoRuntime();
    this.#view.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.#cancelAutomaticDerivation();
      void this.#derivation.run(false);
    });
    this.#installAdapterNavigation();
    this.#installEdits();
    this.#installLifecycle();
  }

  #installAdapterNavigation(): void {
    this.#view.controls.coin.addEventListener("change", () => {
      this.#workspaceTabs.select(null);
      const remembered = this.#adapterSettings.variantForFamily(this.#view.controls.coin.value);
      this.#resetForAdapter(
        remembered === undefined
          ? this.#dependencies.getDefaultCoinAdapter(this.#view.controls.coin.value)
          : this.#dependencies.getCoinAdapter(remembered),
      );
    });
    this.#view.controls.includeLegacyMobile.addEventListener("change", () => {
      if (
        !this.#view.controls.includeLegacyMobile.checked &&
        this.#adapter.id === "dash-legacy-mobile"
      ) {
        this.#resetForAdapter(this.#dependencies.getCoinAdapter("dash-core"));
        return;
      }
      this.#resetForAdapter(this.#adapter, false);
    });
    this.#view.controls.protocolTabs.addEventListener("click", (event) => {
      const id = this.#view.protocolAdapterIdFrom(event.target);
      if (id !== undefined) this.#selectProtocol(id);
    });
    this.#view.controls.protocolTabs.addEventListener("keydown", (event) => {
      if (!isTabKey(event.key)) return;
      const adapterIds = this.#view.protocolAdapterIds();
      const current = adapterIds.indexOf(this.#adapter.id);
      if (current < 0 || adapterIds.length === 0) return;
      event.preventDefault();
      const index = tabIndexAfter(event.key, current, adapterIds.length);
      const id = index === undefined ? undefined : adapterIds[index];
      if (id === undefined) return;
      this.#selectProtocol(id);
    });
  }

  #selectProtocol(id: string): void {
    // Pointer and keyboard selection retire the supplemental workspace through the same path.
    this.#workspaceTabs.select(null);
    if (id === this.#adapter.id) {
      this.#cancelAutomaticDerivation();
      this.#derivation.stop("Derivation mode changed.");
      this.#invalidateAddressSearch();
      this.#derivation.advance();
      this.#resultPanel.clear();
      this.#largeRequestPolicy.clear();
      this.#view.resetDeriveAction();
      if (this.#mnemonicDiagnostic.mayBeComplete()) void this.#derivation.run(true);
    } else this.#resetForAdapter(this.#dependencies.getCoinAdapter(id));
    this.#view.focusProtocolButton(id);
  }

  #installEdits(): void {
    const rangeEdits = new FieldEdits();
    for (const control of [
      this.#view.controls.network,
      this.#view.controls.account,
      this.#view.controls.branchInput,
      this.#view.controls.branchSelect,
      this.#view.controls.includeChange,
      this.#view.controls.includeCoinJoin,
      this.#view.controls.start,
      this.#view.controls.count,
      // A protocol's text inputs are rendered per protocol; their edits bubble to this host.
      ...(this.#view.controls.textControls === undefined ? [] : [this.#view.controls.textControls]),
    ]) {
      const refresh = (): void => {
        // Changing a derivation setting revokes its generation too; discard the worker now.
        this.#checkedMnemonic?.cancel();
        this.#view.clearMessages();
        this.#derivation.stop();
        this.#invalidateAddressSearch();
        this.#derivation.advance();
        if (this.#results.current !== null) this.#resultPanel.clear();
        this.#workspaceTabs.updatePathPreview();
        this.#rememberCurrentSettings();
        this.#largeRequestPolicy.clear();
        this.#view.resetDeriveAction();
        this.#scheduleAutomaticDerivation();
      };
      for (const type of ["input", "change"])
        control.addEventListener(type, (event) => {
          if (rangeEdits.isNew(event)) refresh();
        });
    }
    for (const input of [this.#view.mnemonic, this.#view.passphrase]) {
      input.addEventListener("input", () => {
        this.#source.changed();
        this.#checkedMnemonic?.cancel();
        this.#derivation.stop();
        this.#invalidateParentFeatures();
        this.#invalidateAddressSearch();
        this.#derivation.advance();
        if (this.#results.current !== null) this.#resultPanel.clear();
        this.#mnemonicDiagnostic.update();
        this.#largeRequestPolicy.clear();
        this.#view.resetDeriveAction();
        this.#scheduleAutomaticDerivation();
      });
    }
  }

  #installLifecycle(): void {
    if (this.#dependencies.openRecoverySource !== undefined) {
      installRecoverySourceController({
        document: this.#view.document,
        open: (reference, target) => this.#dependencies.openRecoverySource?.(reference, target),
        childReference: () => this.#bip85Feature?.sourceReference() ?? null,
        originalReference: () => this.#source.reference(),
        showError: (message) => this.#view.showError(message),
      });
    }
    this.#source.offer();
    for (const input of [
      this.#view.expectedAddress,
      this.#view.searchStart,
      this.#view.searchCount,
    ])
      input?.addEventListener("input", this.#invalidateAddressSearch);
    for (const words of BIP39_WORD_COUNTS) {
      this.#view[`generate${words}Button`].addEventListener(
        "click",
        () => void this.#generatePhrase(words),
      );
    }
    this.#view.clearAllButton.addEventListener("click", this.#clearAll);
    window.addEventListener("pagehide", this.#clearAll);
    this.#view.document.addEventListener("visibilitychange", () => {
      if (this.#view.document.visibilityState === "hidden") this.#concealSensitiveValues();
    });
    window.addEventListener("blur", this.#concealSensitiveValues);
    this.#view.cancelDerivationButton.addEventListener("click", () => this.#derivation.cancel());
    this.#view.searchAddressButton?.addEventListener("click", () => {
      if (this.#dependencies.addressSearch === undefined) return;
      if (!this.#cryptoReady) {
        this.#view.showError(
          "Cryptographic self-test has not completed successfully. Address search is blocked.",
        );
        return;
      }
      this.#invalidateAddressSearch();
      this.#dependencies.addressSearch.start({
        adapter: this.#adapter,
        controls: this.#view.controls,
        fields: defined(this.#view.addressSearch),
        mnemonic: this.#view.mnemonic,
        passphrase: this.#view.passphrase,
        view: this.#view,
        readControls,
        mnemonicToSeed: this.#dependencies.mnemonicToSeed,
        createWorker: () => this.#dependencies.createWorker(),
      });
    });
  }
}
/** Compatibility composition entry; start is idempotent. */
export function createKeyDerivationController(
  view: KeyDerivationView,
  dependencies: KeyDerivationDependencies,
): KeyDerivationController {
  return new KeyDerivationController(view, dependencies);
}

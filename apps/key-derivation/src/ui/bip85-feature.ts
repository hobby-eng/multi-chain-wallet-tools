import { entropyToEnglishMnemonic } from '@ckd/core/bip39.js';
import { hexToBytes, wipe } from '@ckd/core/crypto.js';
import type { RecoverySourceReference } from './recovery-source-link.js';
import { installBip85ChildWallet, type Bip85ChildWalletOptions } from './bip85-child-wallet-feature.js';
import type { DerivationWorkerClient } from '../workers/derive-client.js';

type ChildMessageSigning = NonNullable<Bip85ChildWalletOptions['messageSigning']>;

export interface Bip85FeatureOptions extends Omit<Bip85ChildWalletOptions, 'mnemonic' | 'messageSigning'> {
  parentMnemonic(): string;
  parentPassphrase(): string;
  isActive(): boolean;
  mnemonicMayBeComplete(): boolean;
  messageSigning?: ChildMessageSigning;
}

/** Owns all BIP85 state so builds without this feature omit its UI runtime. */
export function installBip85Feature(options: Bip85FeatureOptions) {
  const optionalElement = <T extends Element>(selector: string): T | null =>
    options.document.querySelector<T>(selector);
  const application = optionalElement<HTMLSelectElement>('#bip85-application');
  const wordsField = optionalElement<HTMLElement>('#bip85-words-field');
  const bytesField = optionalElement<HTMLElement>('#bip85-bytes-field');
  const wifField = optionalElement<HTMLElement>('#bip85-wif-field');
  const deriveButton = optionalElement<HTMLButtonElement>('#derive-bip85');
  const openWalletButton = optionalElement<HTMLButtonElement>('#open-bip85-wallet');
  const toggleSecretButton = optionalElement<HTMLButtonElement>('#toggle-bip85-secret');
  const togglePassphraseButton = optionalElement<HTMLButtonElement>('#toggle-bip85-child-passphrase');
  const recoverySourceMenu = optionalElement<HTMLElement>('#bip85-recovery-source-menu');
  let mnemonic: string | null = null;
  let sourceRevision = 0;
  let secretRevealed = false;
  let passphraseRevealed = false;
  let pendingRefresh: number | null = null;

  const childWallet = installBip85ChildWallet({
    ...options,
    mnemonic: () => mnemonic,
    ...(options.messageSigning === undefined ? {} : { messageSigning: options.messageSigning }),
  });

  function setSecretVisibility(revealed: boolean): void {
    secretRevealed = revealed;
    optionalElement<HTMLElement>('#bip85-result')?.classList.toggle('revealed', revealed);
    optionalElement<HTMLTextAreaElement>('#bip85-output')?.classList.toggle('concealed', !revealed);
    if (toggleSecretButton !== null) {
      toggleSecretButton.textContent = revealed ? 'Hide' : 'Reveal';
      toggleSecretButton.setAttribute('aria-pressed', String(revealed));
    }
  }

  function setPassphraseVisibility(revealed: boolean): void {
    passphraseRevealed = revealed;
    const input = optionalElement<HTMLInputElement>('#bip85-child-passphrase');
    if (input !== null) input.type = revealed ? 'text' : 'password';
    if (togglePassphraseButton !== null) {
      togglePassphraseButton.textContent = revealed ? 'Hide' : 'Show';
      togglePassphraseButton.setAttribute('aria-pressed', String(revealed));
    }
  }

  function syncControls(): void {
    const selected = application?.value;
    if (wordsField !== null) wordsField.hidden = selected !== 'bip39';
    if (bytesField !== null) bytesField.hidden = selected !== 'hex';
    if (wifField !== null) wifField.hidden = selected !== 'wif';
  }

  function clearDerivedWallet(): void {
    sourceRevision += 1;
    mnemonic = null;
    if (recoverySourceMenu !== null) recoverySourceMenu.hidden = true;
    childWallet.clear();
    if (childWallet.workspace !== null) childWallet.workspace.hidden = true;
    if (openWalletButton !== null) {
      openWalletButton.hidden = true;
      openWalletButton.textContent = 'Show derived wallet';
      openWalletButton.setAttribute('aria-expanded', 'false');
    }
  }

  async function derive(): Promise<void> {
    const index = optionalElement<HTMLInputElement>('#bip85-index');
    const words = optionalElement<HTMLSelectElement>('#bip85-words');
    const bytes = optionalElement<HTMLInputElement>('#bip85-bytes');
    const output = optionalElement<HTMLTextAreaElement>('#bip85-output');
    const path = optionalElement<HTMLElement>('#bip85-path');
    const result = optionalElement<HTMLElement>('#bip85-result');
    const error = optionalElement<HTMLElement>('#bip85-error');
    if (
      application === null ||
      deriveButton === null ||
      index === null ||
      words === null ||
      bytes === null ||
      output === null ||
      path === null ||
      result === null ||
      error === null
    )
      return;
    result.hidden = true;
    error.hidden = true;
    deriveButton.disabled = true;
    let seed: Uint8Array | null = null;
    let worker: DerivationWorkerClient | null = null;
    try {
      seed = options.mnemonicToSeed(options.parentMnemonic(), options.parentPassphrase());
      worker = options.createWorker();
      const wifVersionValue = optionalElement<HTMLSelectElement>('#bip85-wif-encoding')?.value;
      const wifVersion = wifVersionValue === undefined ? undefined : Number(wifVersionValue);
      if (wifVersion !== undefined && (!Number.isInteger(wifVersion) || wifVersion < 0 || wifVersion > 0xff)) {
        throw new Error('Unsupported BIP85 WIF encoding for the selected coin modules.');
      }
      const derived = await worker.deriveBip85(seed, {
        application: application.value as 'bip39' | 'wif' | 'xprv' | 'hex',
        index: Number(index.value),
        words: Number(words.value) as 12 | 15 | 18 | 21 | 24,
        bytes: Number(bytes.value),
        ...(wifVersion === undefined ? {} : { wifVersion }),
      });
      path.textContent = derived.path;
      let displayedValue = derived.value;
      if (derived.kind === 'bip39') {
        const entropy = hexToBytes(derived.value);
        try {
          displayedValue = entropyToEnglishMnemonic(entropy);
        } finally {
          wipe(entropy);
        }
      }
      output.value = displayedValue;
      setSecretVisibility(options.secretsRevealed() || secretRevealed);
      sourceRevision += 1;
      mnemonic = derived.kind === 'bip39' ? displayedValue : null;
      if (openWalletButton !== null) openWalletButton.hidden = mnemonic === null;
      if (recoverySourceMenu !== null) recoverySourceMenu.hidden = mnemonic === null;
      if (mnemonic === null) clearDerivedWallet();
      else if (childWallet.workspace?.hidden === false) await childWallet.derive();
      result.hidden = false;
    } catch (cause) {
      clearDerivedWallet();
      error.textContent = cause instanceof Error ? cause.message : String(cause);
      error.hidden = false;
    } finally {
      seed?.fill(0);
      worker?.terminate();
      deriveButton.disabled = false;
    }
  }

  function scheduleRefresh(): void {
    if (!options.isActive() || !options.mnemonicMayBeComplete() || deriveButton === null) return;
    if (pendingRefresh !== null) window.clearTimeout(pendingRefresh);
    pendingRefresh = window.setTimeout(() => {
      pendingRefresh = null;
      void derive();
    }, 300);
  }

  application?.addEventListener('change', () => {
    syncControls();
    scheduleRefresh();
  });
  toggleSecretButton?.addEventListener('click', () => setSecretVisibility(!secretRevealed));
  togglePassphraseButton?.addEventListener('click', () => setPassphraseVisibility(!passphraseRevealed));
  deriveButton?.addEventListener('click', () => void derive());
  openWalletButton?.addEventListener('click', () => {
    if (mnemonic === null) return;
    const showing = childWallet.workspace?.hidden !== false;
    childWallet.initialize();
    if (childWallet.workspace !== null) childWallet.workspace.hidden = !showing;
    openWalletButton.textContent = showing ? 'Hide derived wallet' : 'Show derived wallet';
    openWalletButton.setAttribute('aria-expanded', String(showing));
    if (showing && !childWallet.hasResults()) childWallet.scheduleRefresh();
  });
  for (const selector of ['#bip85-index', '#bip85-words', '#bip85-bytes', '#bip85-wif-encoding']) {
    const control = optionalElement<HTMLInputElement | HTMLSelectElement>(selector);
    control?.addEventListener('input', scheduleRefresh);
    control?.addEventListener('change', scheduleRefresh);
  }
  optionalElement<HTMLInputElement>('#bip85-child-passphrase')?.addEventListener('input', () => {
    sourceRevision += 1;
    childWallet.scheduleRefresh();
  });
  syncControls();

  return {
    derive,
    scheduleRefresh,
    childSource: () => ({
      adapter: childWallet.adapter(),
      controls: childWallet.controls(),
      mnemonic,
      passphrase: optionalElement<HTMLInputElement>('#bip85-child-passphrase')?.value ?? '',
    }),
    sourceReference(): RecoverySourceReference | null {
      if (mnemonic === null) return null;
      const revision = sourceRevision;
      const index = optionalElement<HTMLInputElement>('#bip85-index')?.value ?? '';
      return {
        label: `BIP85 child phrase${index === '' ? '' : ` · index ${index}`}`,
        read: () =>
          revision === sourceRevision && mnemonic !== null
            ? {
                mnemonic,
                passphrase: optionalElement<HTMLInputElement>('#bip85-child-passphrase')?.value ?? '',
              }
            : null,
      };
    },
    setSecretsVisible(revealed: boolean) {
      setSecretVisibility(revealed);
      setPassphraseVisibility(revealed);
      childWallet.setSecretsVisible(revealed);
    },
    reset() {
      if (pendingRefresh !== null) window.clearTimeout(pendingRefresh);
      pendingRefresh = null;
      childWallet.cancelScheduledRefresh();
      clearDerivedWallet();
      const output = optionalElement<HTMLTextAreaElement>('#bip85-output');
      if (output !== null) output.value = '';
      const passphrase = optionalElement<HTMLInputElement>('#bip85-child-passphrase');
      if (passphrase !== null) passphrase.value = '';
      optionalElement<HTMLElement>('#bip85-result')?.setAttribute('hidden', '');
      setPassphraseVisibility(false);
      setSecretVisibility(false);
    },
  };
}

import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult } from '@ckd/core/types.js';
import { readControls, type DerivationControls } from './inputs.js';
import { planResultBranches, type ResultBranch } from './result-branches.js';
import { DerivationCancelledError, type DerivationWorkerClient } from '../workers/derive-client.js';
import type { MessageSigningFormat } from '../workers/protocol.js';
import type { MessageSigningPolicy } from './message-signing-policy.js';

interface WalletSource {
  adapter: CoinAdapter | null;
  controls: DerivationControls | null;
  mnemonic: string | null;
  passphrase: string;
}

export interface MessageSigningInstallerOptions {
  document: Document;
  mainSource(): WalletSource;
  bip85Source(): WalletSource;
  mnemonicToSeed: typeof import('@ckd/core/bip39.js').mnemonicToSeed;
  createWorker(): DerivationWorkerClient;
  copy(button: HTMLButtonElement, text: string): void;
}

type SigningContext = {
  index: number;
  address: string;
  path: string;
  source: 'main' | 'bip85';
  resultId: string;
  resultBranch: ResultBranch;
};

export function createMessageSigningInstaller(policy: MessageSigningPolicy) {
  return (options: MessageSigningInstallerOptions) => installMessageSigningFeature(options, policy);
}

function installMessageSigningFeature(options: MessageSigningInstallerOptions, policy: MessageSigningPolicy) {
  const required = <T extends HTMLElement>(selector: string): T => {
    const element = options.document.querySelector<T>(selector);
    if (element === null) throw new Error(`Message-signing UI is missing ${selector}.`);
    return element;
  };
  const formatField = options.document.querySelector<HTMLElement>('#message-signer-format-field');
  const formatSelect = options.document.querySelector<HTMLSelectElement>('#message-signer-format-select');
  const formatOutput = required<HTMLElement>('#message-signer-format');
  const dialog = required<HTMLDialogElement>('#message-signer-dialog');
  const addressOutput = required<HTMLElement>('#message-signer-address');
  const pathOutput = required<HTMLElement>('#message-signer-path');
  const message = required<HTMLTextAreaElement>('#message-signer-message');
  const signButton = required<HTMLButtonElement>('#sign-message-button');
  const closeButton = required<HTMLButtonElement>('#close-message-signer');
  const error = required<HTMLElement>('#message-signer-error');
  const signatureResult = required<HTMLElement>('#message-signature-result');
  const signatureOutput = required<HTMLTextAreaElement>('#message-signature-output');
  const verification = required<HTMLElement>('#message-signature-verification');
  const copySignature = required<HTMLButtonElement>('#copy-message-signature');
  let context: SigningContext | null = null;
  let worker: DerivationWorkerClient | null = null;
  let revision = 0;

  const format = (resultId: string): MessageSigningFormat | null => {
    return policy.format(resultId);
  };
  const invalidate = (): void => {
    revision += 1;
    worker?.terminate(new DerivationCancelledError('Message-signing request superseded.'));
    worker = null;
    context = null;
  };
  const open = (
    result: DerivationResult,
    branch: ResultBranch,
    source: 'main' | 'bip85',
    index: number,
    address: string,
  ): void => {
    const signingFormat = format(result.id);
    const row = result.rows.find((candidate) => candidate.index === index);
    if (row === undefined || signingFormat === null) return;
    invalidate();
    context = { index, address, path: row.path, source, resultId: result.id, resultBranch: branch };
    const chooseLegacy = policy.allowsLegacyChoice(result.id) && formatField !== null;
    if (formatField !== null) formatField.hidden = !chooseLegacy;
    if (chooseLegacy && formatSelect !== null) formatSelect.value = signingFormat;
    addressOutput.textContent = address;
    pathOutput.textContent = row.path;
    formatOutput.textContent = policy.label(signingFormat);
    message.value = '';
    signatureOutput.value = '';
    error.textContent = '';
    error.hidden = true;
    signatureResult.hidden = true;
    signButton.disabled = false;
    signButton.textContent = 'Sign message';
    dialog.showModal();
    message.focus();
  };

  const close = (): void => {
    invalidate();
    message.value = '';
    signatureOutput.value = '';
    error.textContent = '';
    error.hidden = true;
    signatureResult.hidden = true;
    if (dialog.open) dialog.close();
  };
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', () => {
    invalidate();
    message.value = '';
    signatureOutput.value = '';
  });
  signButton.addEventListener('click', () => {
    const active = context;
    const defaultFormat = active === null ? null : format(active.resultId);
    const signingFormat =
      active !== null && policy.allowsLegacyChoice(active.resultId) && formatSelect !== null
        ? (formatSelect.value as MessageSigningFormat)
        : defaultFormat;
    if (active === null || signingFormat === null) {
      error.textContent = 'The selected address is no longer available for message signing.';
      error.hidden = false;
      signatureResult.hidden = true;
      return;
    }
    const messageText = message.value;
    if (messageText.length === 0) {
      error.textContent = 'Enter a message to sign.';
      error.hidden = false;
      signatureResult.hidden = true;
      return;
    }
    void (async () => {
      let seed: Uint8Array | null = null;
      worker?.terminate(new DerivationCancelledError('Message-signing request replaced.'));
      const requestRevision = ++revision;
      const nextWorker = options.createWorker();
      worker = nextWorker;
      signButton.disabled = true;
      signButton.textContent = 'Signing…';
      try {
        const source = active.source === 'bip85' ? options.bip85Source() : options.mainSource();
        if (source.adapter === null || source.controls === null || source.mnemonic === null)
          throw new Error('The selected wallet is no longer available for message signing.');
        const input = readControls(source.adapter, source.controls);
        const { includeChange, includeCoinJoin, ...baseInput } = input;
        const plan = planResultBranches(source.adapter, baseInput.branch, includeChange, includeCoinJoin).find(
          (candidate) => candidate.kind === active.resultBranch,
        );
        if (plan === undefined) throw new Error('The active address branch is no longer available.');
        seed = options.mnemonicToSeed(source.mnemonic, source.passphrase);
        const signed = await nextWorker.signMessage(
          plan.workerAdapterId ?? source.adapter.id,
          { ...baseInput, branch: plan.branch, start: active.index, count: 1, seed },
          active.address,
          messageText,
          signingFormat,
        );
        if (requestRevision !== revision || context !== active) return;
        if (!signed.verified) throw new Error('Generated signature failed local verification.');
        error.hidden = true;
        signatureOutput.value = signed.signature;
        signatureResult.hidden = false;
        verification.textContent = `Verified locally against the selected address · ${signed.format}`;
      } catch (cause) {
        if (requestRevision === revision && context === active) {
          error.textContent = cause instanceof Error ? cause.message : 'Message signing failed.';
          error.hidden = false;
          signatureResult.hidden = true;
        }
      } finally {
        nextWorker.terminate(new DerivationCancelledError('Message-signing worker released.'));
        seed?.fill(0);
        if (requestRevision === revision) {
          worker = null;
          signButton.disabled = false;
          signButton.textContent = 'Sign message';
        }
      }
    })();
  });
  formatSelect?.addEventListener('change', () => {
    if (formatOutput !== null) formatOutput.textContent = policy.label(formatSelect.value as MessageSigningFormat);
  });
  copySignature.addEventListener('click', () => {
    if (signatureOutput.value.length > 0) options.copy(copySignature, signatureOutput.value);
  });
  return { format, open, close, invalidate, isOpen: () => dialog.open, activeSource: () => context?.source ?? null };
}

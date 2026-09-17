import type { DerivationWorkerClient } from '../workers/derive-client.js';

interface SilentPaymentFeatureOptions {
  document: Document;
  mnemonic(): string;
  passphrase(): string;
  mnemonicToSeed: typeof import('@ckd/core/bip39.js').mnemonicToSeed;
  createWorker(): DerivationWorkerClient;
  isActive(): boolean;
  mnemonicMayBeComplete(): boolean;
}

function optionalElement<T extends Element>(document: Document, selector: string): T | null {
  return document.querySelector<T>(selector);
}

function parseLabels(raw: string): number[] {
  if (raw.trim() === '') return [];
  const labels = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const label = Number(part);
      if (!Number.isSafeInteger(label) || label < 1 || label > 0xffffffff)
        throw new Error(`"${part}" is not a valid label. Use whole numbers from 1 to 4294967295, separated by commas.`);
      return label;
    });
  return [...new Set(labels)].sort((left, right) => left - right);
}

export function installSilentPaymentFeature(options: SilentPaymentFeatureOptions) {
  const button = optionalElement<HTMLButtonElement>(options.document, '#derive-silent-payment');
  const network = optionalElement<HTMLSelectElement>(options.document, '#silent-payment-network');
  const account = optionalElement<HTMLInputElement>(options.document, '#silent-payment-account');
  const labelsInput = optionalElement<HTMLInputElement>(options.document, '#silent-payment-labels');
  const result = optionalElement<HTMLElement>(options.document, '#silent-payment-result');
  const error = optionalElement<HTMLElement>(options.document, '#silent-payment-error');
  const labeledList = optionalElement<HTMLElement>(options.document, '#silent-payment-labeled-list');
  let pendingRefresh: number | null = null;

  const cancelScheduledRefresh = (): void => {
    if (pendingRefresh !== null) window.clearTimeout(pendingRefresh);
    pendingRefresh = null;
  };
  const derive = (): void => {
    if (
      button === null ||
      network === null ||
      account === null ||
      labelsInput === null ||
      result === null ||
      error === null ||
      labeledList === null
    )
      return;
    error.hidden = true;
    result.hidden = true;
    let labels: number[];
    try {
      labels = parseLabels(labelsInput.value);
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : String(cause);
      error.hidden = false;
      return;
    }
    button.disabled = true;
    void (async () => {
      let seed: Uint8Array | null = null;
      let worker: DerivationWorkerClient | null = null;
      try {
        seed = options.mnemonicToSeed(options.mnemonic(), options.passphrase());
        worker = options.createWorker();
        const derived = await worker.deriveSilentPayment(
          seed,
          network.value === 'testnet' ? 'testnet' : 'mainnet',
          Number(account.value),
          labels,
        );
        const assign = (selector: string, value: string): void => {
          const output = optionalElement<HTMLElement>(options.document, selector);
          if (output !== null) output.textContent = value;
        };
        assign('#silent-payment-address', derived.address);
        assign('#silent-payment-change-address', derived.changeAddress);
        labeledList.replaceChildren(
          ...derived.labeledAddresses.map(({ label, address }) => {
            const row = options.document.createElement('div');
            row.className = 'row';
            const rowLabel = options.document.createElement('span');
            rowLabel.className = 'row-label';
            rowLabel.textContent = `Label ${label}`;
            const value = options.document.createElement('code');
            value.className = 'value';
            value.textContent = address;
            row.append(rowLabel, value);
            return row;
          }),
        );
        assign('#silent-payment-scan-path', derived.scanPath);
        assign('#silent-payment-scan-key', derived.scanPublicKey);
        assign('#silent-payment-spend-path', derived.spendPath);
        assign('#silent-payment-spend-key', derived.spendPublicKey);
        result.hidden = false;
      } catch (cause) {
        error.textContent = cause instanceof Error ? cause.message : String(cause);
        error.hidden = false;
      } finally {
        seed?.fill(0);
        worker?.terminate();
        button.disabled = false;
      }
    })();
  };
  const scheduleRefresh = (): void => {
    if (!options.isActive() || !options.mnemonicMayBeComplete() || button === null) return;
    cancelScheduledRefresh();
    pendingRefresh = window.setTimeout(() => {
      pendingRefresh = null;
      derive();
    }, 300);
  };
  button?.addEventListener('click', derive);
  network?.addEventListener('change', scheduleRefresh);
  account?.addEventListener('input', scheduleRefresh);
  labelsInput?.addEventListener('input', scheduleRefresh);
  return { derive, scheduleRefresh, cancelScheduledRefresh };
}

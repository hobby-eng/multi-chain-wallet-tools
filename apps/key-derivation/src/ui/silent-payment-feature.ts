import type { DerivationWorkerClient } from '../workers/derive-client.js';

interface SilentPaymentFeatureOptions {
  document: Document;
  /**
   * Prefix of every element ID of this Silent Payments panel: empty for the original wallet,
   * "bip85-wallet-" for the derived child wallet (see silentPaymentMarkup in tooling/profile-template.mjs).
   */
  idPrefix?: string;
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

/** Output fields filled after a derivation, by element ID without the prefix. */
const OUTPUT_IDS = [
  'silent-payment-address',
  'silent-payment-change-address',
  'silent-payment-scan-path',
  'silent-payment-scan-key',
  'silent-payment-spend-path',
  'silent-payment-spend-key',
] as const;

export function installSilentPaymentFeature(options: SilentPaymentFeatureOptions) {
  const idPrefix = options.idPrefix ?? '';
  const element = <T extends Element>(id: string): T | null =>
    optionalElement<T>(options.document, `#${idPrefix}${id}`);
  const button = element<HTMLButtonElement>('derive-silent-payment');
  const network = element<HTMLSelectElement>('silent-payment-network');
  const account = element<HTMLInputElement>('silent-payment-account');
  const labelsInput = element<HTMLInputElement>('silent-payment-labels');
  const result = element<HTMLElement>('silent-payment-result');
  const error = element<HTMLElement>('silent-payment-error');
  const labeledList = element<HTMLElement>('silent-payment-labeled-list');
  let pendingRefresh: number | null = null;
  // Each derivation gets a number; a slower earlier one must not overwrite a newer result or a reset.
  let revision = 0;

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
    revision += 1;
    const requestRevision = revision;
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
        if (requestRevision !== revision) return;
        const assign = (id: (typeof OUTPUT_IDS)[number], value: string): void => {
          const output = element<HTMLElement>(id);
          if (output !== null) output.textContent = value;
        };
        assign('silent-payment-address', derived.address);
        assign('silent-payment-change-address', derived.changeAddress);
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
        assign('silent-payment-scan-path', derived.scanPath);
        assign('silent-payment-scan-key', derived.scanPublicKey);
        assign('silent-payment-spend-path', derived.spendPath);
        assign('silent-payment-spend-key', derived.spendPublicKey);
        result.hidden = false;
      } catch (cause) {
        if (requestRevision !== revision) return;
        error.textContent = cause instanceof Error ? cause.message : String(cause);
        error.hidden = false;
      } finally {
        seed?.fill(0);
        worker?.terminate();
        if (requestRevision === revision) button.disabled = false;
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
  /** Hides and empties the result, for example when the phrase, passphrase or workspace changes. */
  const clear = (): void => {
    cancelScheduledRefresh();
    revision += 1;
    if (button !== null) button.disabled = false;
    result?.setAttribute('hidden', '');
    error?.setAttribute('hidden', '');
    labeledList?.replaceChildren();
    for (const id of OUTPUT_IDS) {
      const output = element<HTMLElement>(id);
      if (output !== null) output.textContent = '';
    }
  };
  /** Clears the result and the entered labels, as "Clear" does for the whole page. */
  const reset = (): void => {
    clear();
    if (labelsInput !== null) labelsInput.value = '';
  };
  const setSecretsVisible = (revealed: boolean): void => {
    result?.classList.toggle('revealed', revealed);
  };
  button?.addEventListener('click', derive);
  network?.addEventListener('change', scheduleRefresh);
  account?.addEventListener('input', scheduleRefresh);
  labelsInput?.addEventListener('input', scheduleRefresh);
  return { derive, scheduleRefresh, cancelScheduledRefresh, clear, reset, setSecretsVisible };
}

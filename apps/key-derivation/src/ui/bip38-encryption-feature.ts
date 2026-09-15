import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationResult } from '@ckd/core/types.js';
import { readControls, type DerivationControls } from './inputs.js';
import { planResultBranches, type ResultBranch } from './result-branches.js';
import { DerivationCancelledError, type DerivationWorkerClient } from '../workers/derive-client.js';

interface Bip38FeatureOptions {
  document: Document;
  controls: DerivationControls;
  adapter(): CoinAdapter;
  result(): DerivationResult | null;
  branch(): ResultBranch;
  mnemonic(): string;
  passphrase(): string;
  mnemonicToSeed: typeof import('@ckd/core/bip39.js').mnemonicToSeed;
  createWorker(): DerivationWorkerClient;
  render(): void;
}

function optional<T extends Element>(document: Document, selector: string): T | null {
  return document.querySelector<T>(selector);
}

export function createBip38EncryptionInstaller(resultIds: readonly string[]) {
  const supportedResultIds = new Set(resultIds);
  return (options: Bip38FeatureOptions) => installBip38EncryptionFeature(options, supportedResultIds);
}

function installBip38EncryptionFeature(options: Bip38FeatureOptions, supportedResultIds: ReadonlySet<string>) {
  const panel = optional<HTMLElement>(options.document, '#bulk-bip38-panel');
  const enabled = optional<HTMLInputElement>(options.document, '#enable-bulk-bip38');
  const fields = optional<HTMLElement>(options.document, '#bulk-bip38-fields');
  const password = optional<HTMLInputElement>(options.document, '#bulk-bip38-passphrase');
  const togglePassword = optional<HTMLButtonElement>(options.document, '#toggle-bulk-bip38-passphrase');
  const status = optional<HTMLElement>(options.document, '#bulk-bip38-status');
  const error = optional<HTMLElement>(options.document, '#bulk-bip38-error');
  const encryptedByBranch = new Map<ResultBranch, Map<number, string>>();
  const visibleRowsByBranch = new Map<ResultBranch, number>();
  let revision = 0;
  let worker: DerivationWorkerClient | null = null;

  const cancel = (message: string): void => {
    revision += 1;
    worker?.terminate(new DerivationCancelledError(message));
    worker = null;
  };
  const reset = (): void => {
    cancel('BIP38 encryption cancelled because results changed.');
    encryptedByBranch.clear();
    visibleRowsByBranch.clear();
    if (enabled !== null) {
      enabled.checked = false;
      enabled.disabled = false;
    }
    if (fields !== null) fields.hidden = true;
    if (password !== null) {
      password.disabled = false;
      password.value = '';
      password.type = 'password';
    }
    if (status !== null) status.textContent = '';
    if (error !== null) error.hidden = true;
  };
  const isReady = (): boolean => enabled?.checked === true && (password?.value.length ?? 0) > 0;
  const syncAvailability = (available: boolean): void => {
    if (panel !== null) panel.hidden = !available;
    if (!available && enabled !== null) enabled.checked = false;
    if (fields !== null) fields.hidden = !available || enabled?.checked !== true;
    if (!available) cancel('BIP38 encryption is unavailable for the selected result.');
  };
  const start = (): void => {
    const result = options.result();
    if (
      result === null ||
      password === null ||
      status === null ||
      error === null ||
      enabled?.checked !== true ||
      password.disabled ||
      password.value.length === 0
    )
      return;
    const adapter = options.adapter();
    const branch = options.branch();
    const encryptionPassword = password.value;
    const rows = result.rows.flatMap((row) => {
      const address = row.basic.find((field) => field.role === 'paymentAddress')?.value;
      return address === undefined ? [] : [{ index: row.index, address }];
    });
    const requestRevision = ++revision;
    error.hidden = true;
    const encrypted = new Map<number, string>();
    encryptedByBranch.set(branch, encrypted);
    visibleRowsByBranch.set(branch, 0);
    options.render();
    password.disabled = true;
    enabled.disabled = true;
    void (async () => {
      let seed: Uint8Array | null = null;
      const nextWorker = options.createWorker();
      worker?.terminate(new DerivationCancelledError('Superseded by a new BIP38 encryption request.'));
      worker = nextWorker;
      try {
        const input = readControls(adapter, options.controls);
        const { includeChange, includeCoinJoin, ...baseInput } = input;
        const plan = planResultBranches(adapter, baseInput.branch, includeChange, includeCoinJoin).find(
          (candidate) => candidate.kind === branch,
        );
        if (plan === undefined) throw new Error('The active address branch is no longer available.');
        seed = options.mnemonicToSeed(options.mnemonic(), options.passphrase());
        for (const [position, row] of rows.entries()) {
          if (requestRevision !== revision) return;
          status.textContent = `Encrypting ${position + 1} of ${rows.length}…`;
          const item = await nextWorker.encryptBip38(
            plan.workerAdapterId ?? adapter.id,
            { ...baseInput, branch: plan.branch, start: row.index, count: 1, seed },
            row.address,
            encryptionPassword,
          );
          encrypted.set(row.index, item.encryptedKey);
          visibleRowsByBranch.set(branch, position + 1);
          if (options.branch() === branch && options.result() === result) options.render();
        }
        if (requestRevision !== revision) return;
        status.textContent = `Encrypted ${encrypted.size} generated private keys. Reveal sensitive values to view or copy them.`;
        if (options.branch() === branch && options.result() === result) options.render();
      } catch (cause) {
        if (requestRevision !== revision) return;
        error.textContent = cause instanceof Error ? cause.message : 'BIP38 encryption failed.';
        error.hidden = false;
        status.textContent = '';
      } finally {
        if (worker === nextWorker) worker = null;
        nextWorker.terminate(new DerivationCancelledError('BIP38 worker released.'));
        seed?.fill(0);
        if (requestRevision === revision) {
          password.disabled = false;
          enabled.disabled = false;
        }
      }
    })();
  };

  togglePassword?.addEventListener('click', () => {
    if (password === null || togglePassword === null) return;
    const reveal = password.type === 'password';
    password.type = reveal ? 'text' : 'password';
    togglePassword.textContent = reveal ? 'Hide' : 'Show';
    togglePassword.setAttribute('aria-pressed', String(reveal));
  });
  enabled?.addEventListener('change', () => {
    if (fields !== null) fields.hidden = !enabled.checked;
    if (enabled.checked) {
      password?.focus();
      start();
      return;
    }
    cancel('BIP38 encryption disabled.');
    encryptedByBranch.delete(options.branch());
    visibleRowsByBranch.delete(options.branch());
    if (password !== null) {
      password.disabled = false;
      password.value = '';
    }
    if (status !== null) status.textContent = '';
    if (error !== null) error.hidden = true;
    options.render();
  });
  password?.addEventListener('change', start);
  password?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      start();
    }
  });

  return {
    encryptedByBranch,
    visibleRowsByBranch,
    isReady,
    start,
    reset,
    syncAvailability,
    cancel,
    supportsResult: (resultId: string) => supportedResultIds.has(resultId),
  };
}

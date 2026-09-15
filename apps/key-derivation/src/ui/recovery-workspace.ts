import type { CoinRegistry } from '@ckd/coins/registry-base.js';
import type { WalletMatcherTargetDetector } from '@ckd/recovery/matcher-types.js';
import type { RecoverySourceReceiver, RecoverySourceReference, RecoverySourceTarget } from './recovery-source-link.js';
import { installSelectedRecoveryFeatures, selectedRecoveryTargets } from './recovery-feature-selection.js';
import { installTabs, required } from './recovery-workspace-shared.js';
interface RecoveryWorkspaceOptions {
  readonly registry: CoinRegistry;
  readonly detectTargets: WalletMatcherTargetDetector;
  readonly mnemonicToSeed: (mnemonic: string, passphrase: string) => Uint8Array;
  readonly writeClipboard: (value: string) => Promise<void>;
  readonly useMnemonicInDeriver: (mnemonic: string) => void;
}
export function installRecoveryWorkspace(options: RecoveryWorkspaceOptions): RecoverySourceReceiver {
  const cryptoActions = [...document.querySelectorAll<HTMLButtonElement>('#recovery-workspace button.primary')];
  const setCryptoEnabled = (enabled: boolean): void => {
    for (const action of cryptoActions) action.disabled = !enabled;
  };
  setCryptoEnabled(false);
  installTabs(document, '[data-recovery-tab]', '[data-recovery-panel]');
  for (const method of document.querySelectorAll<HTMLElement>('.backup-method')) {
    installTabs(method, '[data-operation-tab]', '[data-operation-panel]');
  }

  const linkedSources = new Map<RecoverySourceTarget, RecoverySourceReference>();
  const targetPanels: Readonly<Record<RecoverySourceTarget, string>> = {
    matcher: 'wallet-matcher-panel',
    seedqr: 'seedqr-panel',
    slip39: 'slip39-panel',
    'shamir-raw': 'shamir-raw-panel',
    'shamir-words': 'shamir-words-panel',
    codex32: 'codex32-panel',
  };
  const sourceSelectors: Readonly<Record<Exclude<RecoverySourceTarget, 'matcher'>, string>> = {
    seedqr: '#seedqr-source',
    slip39: '#slip39-source-mnemonic',
    'shamir-raw': '#shamir-raw-source',
    'shamir-words': '#shamir-words-source',
    codex32: '#codex32-source',
  };

  function manualSourceElements(target: RecoverySourceTarget): HTMLElement[] {
    if (target === 'matcher') {
      const grid = document.querySelector<HTMLElement>('.matcher-input-grid');
      return grid === null ? [] : [grid];
    }
    const input = required<HTMLTextAreaElement>(sourceSelectors[target]);
    const heading = input.previousElementSibling instanceof HTMLElement ? input.previousElementSibling : null;
    const elements = heading === null ? [input] : [heading, input];
    if (target === 'codex32') {
      const passphrase = required<HTMLInputElement>('#codex32-passphrase');
      const label = document.querySelector<HTMLElement>('label[for="codex32-passphrase"]');
      if (label !== null) elements.push(label);
      elements.push(passphrase);
    }
    return elements;
  }

  function unlinkSource(target: RecoverySourceTarget): void {
    linkedSources.delete(target);
    document.querySelector<HTMLElement>(`[data-linked-source-for="${target}"]`)?.remove();
    for (const element of manualSourceElements(target)) element.hidden = false;
  }

  function useSource(reference: RecoverySourceReference, target: RecoverySourceTarget): void {
    if (!selectedRecoveryTargets.has(target))
      throw new Error(`Recovery feature "${target}" is not included in this build.`);
    unlinkSource(target);
    const manualElements = manualSourceElements(target);
    for (const element of manualElements) element.hidden = true;
    if (target === 'matcher') {
      required<HTMLTextAreaElement>('#matcher-seeds').value = '';
      required<HTMLTextAreaElement>('#matcher-passphrases').value = '';
    } else {
      required<HTMLTextAreaElement>(sourceSelectors[target]).value = '';
      if (target === 'codex32') required<HTMLInputElement>('#codex32-passphrase').value = '';
    }
    linkedSources.set(target, reference);
    const badge = document.createElement('div');
    badge.className = 'linked-recovery-source';
    badge.dataset.linkedSourceFor = target;
    const description = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `Linked source: ${reference.label}`;
    const note = document.createElement('span');
    note.textContent =
      target === 'codex32'
        ? 'The mnemonic will be read only when Codex32 creation starts. Its BIP39 passphrase is used only in BIP32 master-seed mode.'
        : target === 'matcher'
          ? 'The mnemonic and its matching BIP39 passphrase will be read only when the search starts.'
          : 'Only BIP39 mnemonic entropy is backed up here; its separate BIP39 passphrase is not included.';
    description.append(title, note);
    const unlink = document.createElement('button');
    unlink.type = 'button';
    unlink.className = 'secondary compact';
    unlink.textContent = 'Use manual input';
    unlink.addEventListener('click', () => unlinkSource(target));
    badge.append(description, unlink);
    const panel = required<HTMLElement>(`#${targetPanels[target]}`);
    const anchor = manualElements[0] ?? panel.firstElementChild;
    if (anchor === null) panel.append(badge);
    else anchor.before(badge);
    document.querySelector<HTMLButtonElement>(`[data-recovery-tab][aria-controls="${targetPanels[target]}"]`)?.click();
    if (target !== 'matcher') {
      document
        .querySelector<HTMLButtonElement>(
          `#${targetPanels[target]} [data-operation-tab][aria-controls="${target}-create-panel"]`,
        )
        ?.click();
    }
  }

  function linkedValue(target: RecoverySourceTarget): { mnemonic: string; passphrase: string } | null {
    const reference = linkedSources.get(target);
    if (reference === undefined) return null;
    const value = reference.read();
    if (value === null)
      throw new Error('The linked source changed or was cleared. Choose it again from Derive & Generate.');
    return value;
  }

  function readMnemonic(target: RecoverySourceTarget, selector: string): string {
    return linkedValue(target)?.mnemonic ?? required<HTMLTextAreaElement>(selector).value;
  }
  installSelectedRecoveryFeatures({ ...options, readMnemonic, linkedValue });
  return { useSource, setCryptoEnabled };
}

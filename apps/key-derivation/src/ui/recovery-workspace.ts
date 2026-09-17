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
  readonly useMnemonicInDeriver: (mnemonic: string, passphrase?: string) => void;
}
export function installRecoveryWorkspace(options: RecoveryWorkspaceOptions): RecoverySourceReceiver {
  const helpSelector = '.recovery-help, .linked-source-help, .threshold-group-help';
  const pinnedHelp = new WeakSet<HTMLDetailsElement>();
  const suppressedUntilPointerLeaves = new WeakSet<HTMLDetailsElement>();
  const helpFromEvent = (event: Event): HTMLDetailsElement | null =>
    event.target instanceof Element ? event.target.closest<HTMLDetailsElement>(helpSelector) : null;
  const cryptoActions = [...document.querySelectorAll<HTMLButtonElement>('#recovery-workspace button.primary')];
  const setCryptoEnabled = (enabled: boolean): void => {
    for (const action of cryptoActions) action.disabled = !enabled;
  };
  setCryptoEnabled(false);
  installTabs(document, '[data-recovery-tab]', '[data-recovery-panel]');
  document.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    const help = helpFromEvent(event);
    if (help === null || (event.relatedTarget instanceof Node && help.contains(event.relatedTarget))) return;
    if (!suppressedUntilPointerLeaves.has(help)) help.open = true;
  });
  document.addEventListener('pointerout', (event) => {
    if (event.pointerType === 'touch') return;
    const help = helpFromEvent(event);
    if (help === null || (event.relatedTarget instanceof Node && help.contains(event.relatedTarget))) return;
    suppressedUntilPointerLeaves.delete(help);
    if (!pinnedHelp.has(help)) help.open = false;
  });
  document.addEventListener('click', (event) => {
    const summary = event.target instanceof Element ? event.target.closest<HTMLElement>('summary') : null;
    if (summary === null) return;
    const help = summary.parentElement;
    if (!(help instanceof HTMLDetailsElement) || !help.matches(helpSelector)) return;
    event.preventDefault();
    if (pinnedHelp.has(help)) {
      pinnedHelp.delete(help);
      suppressedUntilPointerLeaves.add(help);
      help.open = false;
    } else {
      pinnedHelp.add(help);
      suppressedUntilPointerLeaves.delete(help);
      help.open = true;
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Node)) return;
    for (const help of document.querySelectorAll<HTMLDetailsElement>(
      '.recovery-help[open], .linked-source-help[open], .threshold-group-help[open]',
    )) {
      if (!help.contains(event.target)) {
        pinnedHelp.delete(help);
        suppressedUntilPointerLeaves.delete(help);
        help.open = false;
      }
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      for (const help of document.querySelectorAll<HTMLDetailsElement>(
        '.recovery-help[open], .linked-source-help[open], .threshold-group-help[open]',
      )) {
        pinnedHelp.delete(help);
        suppressedUntilPointerLeaves.delete(help);
        help.open = false;
      }
    }
  });
  for (const method of document.querySelectorAll<HTMLElement>('.backup-method')) {
    installTabs(method, '[data-operation-tab]', '[data-operation-panel]');
  }

  const linkedSources = new Map<RecoverySourceTarget, RecoverySourceReference>();
  const targetPanels: Readonly<Record<RecoverySourceTarget, string>> = {
    matcher: 'wallet-matcher-panel',
    seedqr: 'seedqr-panel',
    slip39: 'slip39-panel',
    shamir: 'shamir-panel',
    codex32: 'codex32-panel',
    sskr: 'sskr-panel',
    'gordian-envelope': 'gordian-envelope-panel',
  };
  const sourceSelectors: Readonly<Record<Exclude<RecoverySourceTarget, 'matcher'>, string>> = {
    seedqr: '#seedqr-source',
    slip39: '#slip39-source-mnemonic',
    shamir: '#shamir-source',
    codex32: '#codex32-source',
    sskr: '#sskr-source',
    'gordian-envelope': '#envelope-source',
  };

  function manualSourceElements(target: RecoverySourceTarget): HTMLElement[] {
    if (target === 'matcher') {
      const grid = document.querySelector<HTMLElement>('.matcher-input-grid');
      return grid === null ? [] : [grid];
    }
    const input = required<HTMLTextAreaElement>(sourceSelectors[target]);
    const heading = input.previousElementSibling instanceof HTMLElement ? input.previousElementSibling : null;
    const elements = heading === null ? [input] : [heading, input];
    if (target === 'codex32' || target === 'gordian-envelope') {
      const passphraseSelector = target === 'codex32' ? '#codex32-passphrase' : '#envelope-bip39-passphrase';
      const passphrase = required<HTMLInputElement>(passphraseSelector);
      const label = document.querySelector<HTMLElement>(`label[for="${passphrase.id}"]`);
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
      if (target === 'gordian-envelope') required<HTMLInputElement>('#envelope-bip39-passphrase').value = '';
    }
    linkedSources.set(target, reference);
    const badge = document.createElement('div');
    badge.className = 'linked-recovery-source';
    badge.dataset.linkedSourceFor = target;
    const description = document.createElement('div');
    description.className = 'linked-source-description';
    const heading = document.createElement('div');
    heading.className = 'linked-source-heading';
    const title = document.createElement('strong');
    const sourceLabel = `${reference.label.slice(0, 1).toLowerCase()}${reference.label.slice(1)}`;
    title.textContent = `Using ${sourceLabel}`;
    const help = document.createElement('details');
    help.className = 'linked-source-help';
    const helpSummary = document.createElement('summary');
    helpSummary.textContent = '?';
    helpSummary.setAttribute('aria-label', 'How the linked phrase is protected');
    const helpPopover = document.createElement('div');
    helpPopover.className = 'linked-source-help-popover';
    const helpTitle = document.createElement('strong');
    helpTitle.textContent = 'Kept inside this offline workspace';
    const helpText = document.createElement('p');
    helpText.textContent =
      'This tab receives only a temporary in-memory reference. The recovery phrase and passphrase remain inside this offline page and are read only when this operation starts. They are not copied to the OS clipboard or sent over the network.';
    helpPopover.append(helpTitle, helpText);
    help.append(helpSummary, helpPopover);
    heading.append(title, help);
    const origin = document.createElement('span');
    origin.textContent = 'Selected in Generate & Derive.';
    const note = document.createElement('span');
    note.textContent =
      target === 'codex32'
        ? 'The BIP39 passphrase is included only in BIP32 master-seed mode.'
        : target === 'matcher'
          ? 'The matching BIP39 passphrase will be used when the search starts.'
          : 'Only mnemonic entropy is backed up; the separate BIP39 passphrase is not included.';
    description.append(heading, origin, note);
    const unlink = document.createElement('button');
    unlink.type = 'button';
    unlink.className = 'secondary compact';
    unlink.textContent = 'Enter another phrase';
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
      throw new Error('The linked source changed or was cleared. Choose it again from Generate & Derive.');
    return value;
  }

  function readMnemonic(target: RecoverySourceTarget, selector: string): string {
    return linkedValue(target)?.mnemonic ?? required<HTMLTextAreaElement>(selector).value;
  }
  installSelectedRecoveryFeatures({ ...options, readMnemonic, linkedValue });
  return { useSource, setCryptoEnabled };
}

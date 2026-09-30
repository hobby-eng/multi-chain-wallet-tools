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
  readonly downloadText: (text: string, fileName: string, mimeType: string) => void;
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
  /** Linked phrases the user chose to show; hidden phrases are not kept in the DOM. */
  const revealedLinkedSources = new Map<RecoverySourceTarget, () => void>();
  const targetPanels: Readonly<Record<RecoverySourceTarget, string>> = {
    matcher: 'wallet-matcher-panel',
    seedqr: 'seedqr-panel',
    mnemocode: 'mnemocode-panel',
    mhfe: 'mhfe-panel',
    slip39: 'slip39-panel',
    codex32: 'codex32-panel',
    sskr: 'sskr-panel',
    'gordian-envelope': 'gordian-envelope-panel',
  };
  const sourceSelectors: Readonly<Record<Exclude<RecoverySourceTarget, 'matcher'>, string>> = {
    seedqr: '#seedqr-source',
    mnemocode: '#mnemocode-source',
    mhfe: '#mhfe-source',
    slip39: '#slip39-source-mnemonic',
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
    revealedLinkedSources.delete(target);
    document.querySelector<HTMLElement>(`[data-linked-source-for="${target}"]`)?.remove();
    for (const element of manualSourceElements(target)) element.hidden = false;
    document.dispatchEvent(new CustomEvent('recovery-source-change', { detail: target }));
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
    document.dispatchEvent(new CustomEvent('recovery-source-change', { detail: target }));
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
    const summary = document.createElement('div');
    summary.className = 'linked-source-summary';
    const actions = document.createElement('div');
    actions.className = 'linked-source-actions';
    const phraseView = createLinkedPhraseView(target, reference);
    actions.append(phraseView.toggle, unlink);
    summary.append(description, actions);
    badge.append(summary, phraseView.phrase, phraseView.problem);
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

  /**
   * Show/Hide for the linked phrase. Showing reads the in-memory reference and places the words in a read-only
   * field inside the card; hiding removes them from the DOM again. Like the phrase field in Generate & Derive,
   * the words are hidden again when the window loses focus or the user leaves Recover & Back Up.
   */
  function createLinkedPhraseView(
    target: RecoverySourceTarget,
    reference: RecoverySourceReference,
  ): { toggle: HTMLButtonElement; phrase: HTMLTextAreaElement; problem: HTMLElement } {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'danger-outline compact';
    const phrase = document.createElement('textarea');
    phrase.className = 'linked-source-phrase';
    phrase.rows = 3;
    phrase.readOnly = true;
    phrase.setAttribute('aria-label', `${reference.label} (read-only)`);
    const problem = document.createElement('p');
    problem.className = 'error';
    problem.setAttribute('role', 'alert');
    const render = (revealed: boolean): void => {
      toggle.textContent = revealed ? 'Hide phrase' : 'Show phrase';
      toggle.setAttribute('aria-pressed', String(revealed));
      phrase.hidden = !revealed;
      if (!revealed) phrase.value = '';
    };
    const conceal = (): void => {
      if (!revealedLinkedSources.has(target)) return;
      revealedLinkedSources.delete(target);
      render(false);
      document.dispatchEvent(new CustomEvent('recovery-source-visibility', { detail: target }));
    };
    toggle.addEventListener('click', () => {
      problem.hidden = true;
      if (revealedLinkedSources.has(target)) {
        conceal();
        return;
      }
      const value = reference.read();
      if (value === null) {
        problem.textContent = 'The linked source changed or was cleared. Choose it again from Generate & Derive.';
        problem.hidden = false;
        return;
      }
      phrase.value = value.mnemonic;
      revealedLinkedSources.set(target, conceal);
      render(true);
      document.dispatchEvent(new CustomEvent('recovery-source-visibility', { detail: target }));
    });
    problem.hidden = true;
    render(false);
    return { toggle, phrase, problem };
  }

  const concealLinkedSources = (): void => {
    for (const conceal of [...revealedLinkedSources.values()]) conceal();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') concealLinkedSources();
  });
  window.addEventListener('blur', concealLinkedSources);
  document.querySelector('#derive-generate-mode')?.addEventListener('click', concealLinkedSources);

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
  const linkedSourceRevealed = (target: RecoverySourceTarget): boolean => revealedLinkedSources.has(target);
  installSelectedRecoveryFeatures({ ...options, readMnemonic, linkedValue, linkedSourceRevealed });
  return { useSource, setCryptoEnabled };
}

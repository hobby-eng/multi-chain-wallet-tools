import { afterEach, describe, expect, it, vi } from 'vitest';
import { installTopLevelModes } from '../src/ui/top-level-modes.js';

class TestClassList {
  readonly values = new Set<string>();
  toggle(name: string, force: boolean): void {
    if (force) this.values.add(name);
    else this.values.delete(name);
  }
}

class TestElement extends EventTarget {
  hidden: boolean;
  readonly dataset: Record<string, string | undefined> = {};
  readonly classList = new TestClassList();
  readonly attributes = new Map<string, string>();

  constructor(hidden = false) {
    super();
    this.hidden = hidden;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  click(): void {
    this.dispatchEvent(new Event('click'));
  }
}

describe('top-level Key Derivation modes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('restores the original Generate panels after Recovery is activated repeatedly', () => {
    vi.stubGlobal('__CKD_HAS_RECOVERY__', true);
    const deriveTab = new TestElement();
    const recoveryTab = new TestElement();
    const form = new TestElement(false);
    const results = new TestElement(true);
    const recovery = new TestElement(true);
    const body = new TestElement();
    vi.stubGlobal('document', {
      body,
      querySelector(selector: string) {
        if (selector === '#derive-generate-mode') return deriveTab;
        if (selector === '#recovery-backup-mode') return recoveryTab;
        return null;
      },
      querySelectorAll(selector: string) {
        if (selector === '.derive-only') return [form, results];
        if (selector === '.recovery-only') return [recovery];
        return [];
      },
    });

    const modes = installTopLevelModes();
    modes.setMode('recovery');
    modes.setMode('recovery');
    modes.setMode('derive');

    expect(form.hidden).toBe(false);
    expect(results.hidden).toBe(true);
    expect(recovery.hidden).toBe(true);
    expect(form.dataset.hiddenBeforeRecovery).toBeUndefined();
    expect(deriveTab.attributes.get('aria-selected')).toBe('true');
  });
});

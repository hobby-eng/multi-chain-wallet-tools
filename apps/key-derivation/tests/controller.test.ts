import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKeyDerivationController } from '../src/ui/controller.js';
import type { KeyDerivationView } from '../src/ui/view.js';

class TestControl extends EventTarget {
  disabled = false;
  hidden = false;
  checked = false;
  value = '';
  textContent = '';
  readonly listeners = new Map<string, number>();

  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
    this.listeners.set(type, (this.listeners.get(type) ?? 0) + 1);
    super.addEventListener(type, callback, options);
  }

  click(): void {
    this.dispatchEvent(new Event('click'));
  }
}

class TestForm extends TestControl {
  submit(): void {
    this.dispatchEvent(new Event('submit', { cancelable: true }));
  }
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('Key Derivation controller', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('registers once, gates derivation on startup self-test, and handles mode transitions', async () => {
    const windowEvents = new TestControl();
    vi.stubGlobal('window', {
      addEventListener: windowEvents.addEventListener.bind(windowEvents),
      setTimeout(callback: () => void): number {
        return globalThis.setTimeout(callback, 0) as unknown as number;
      },
      clearTimeout(id: number): void {
        globalThis.clearTimeout(id);
      },
    });
    const document = new TestControl();
    const form = new TestForm();
    const controls = {
      coin: new TestControl(),
      protocolTabs: new TestControl(),
      network: new TestControl(),
      account: new TestControl(),
      branchInput: new TestControl(),
      branchSelect: new TestControl(),
      includeChange: new TestControl(),
      start: new TestControl(),
      count: new TestControl(),
    };
    const modeBasic = new TestControl();
    const modeAdvanced = new TestControl();
    let resolveWorkerSelfTest!: (value: { passed: boolean; checks: string[]; durationMs: number }) => void;
    const workerSelfTest = new Promise<{ passed: boolean; checks: string[]; durationMs: number }>((resolve) => {
      resolveWorkerSelfTest = resolve;
    });
    const startupWorker = {
      selfTest: vi.fn(() => workerSelfTest),
      terminate: vi.fn(),
    };
    const view = {
      document,
      controls,
      form,
      mnemonic: new TestControl(),
      passphrase: new TestControl(),
      exportFormat: new TestControl(),
      modeBasic,
      modeAdvanced,
      resultReceiveTab: new TestControl(),
      resultChangeTab: new TestControl(),
      toggleSensitiveValues: new TestControl(),
      copyMnemonicButton: new TestControl(),
      copyWatchOnlyButton: new TestControl(),
      downloadWatchOnlyButton: new TestControl(),
      cancelDerivationButton: new TestControl(),
      expectedAddress: new TestControl(),
      searchStart: new TestControl(),
      searchCount: new TestControl(),
      searchAddressButton: new TestControl(),
      generate12Button: new TestControl(),
      generate24Button: new TestControl(),
      clearAllButton: new TestControl(),
      selectAllButton: new TestControl(),
      selectNoneButton: new TestControl(),
      selectInvertButton: new TestControl(),
      showError: vi.fn(),
      showStatus: vi.fn(),
      clearMessages: vi.fn(),
      populateCoinSelect: vi.fn(),
      configureControls: vi.fn(),
      updateWordCount: vi.fn(),
      updateMode: vi.fn(),
      updateBulkActions: vi.fn(),
      populateBuildPassport: vi.fn(),
      setCryptoControlsEnabled: vi.fn(),
      showCryptoSelfTestPassed: vi.fn(),
      showCryptoSelfTestFailed: vi.fn(),
      resetDeriveAction: vi.fn(),
      hideSearchResult: vi.fn(),
      documentActionFrom: vi.fn(() => null),
    } as unknown as KeyDerivationView;
    const adapter = {
      id: 'bitcoin-bip44',
      label: 'Bitcoin',
      variantLabel: 'BIP44',
      defaults: {},
    };
    const createWorker = vi.fn(() => startupWorker);
    const dependencies = {
      coinFamilies: [{ id: 'bitcoin', label: 'Bitcoin' }],
      getAdapterFamilyId: () => 'bitcoin',
      getCoinAdapter: () => adapter,
      getDefaultCoinAdapter: () => adapter,
      buildInfo: {},
      generateMnemonic: vi.fn(),
      mnemonicToSeed: vi.fn(),
      runBip39SelfTest: () => ({ passed: true, checks: ['fixture'], durationMs: 1 }),
      writeClipboard: vi.fn(),
      downloadBlob: vi.fn(),
      downloadText: vi.fn(),
      createWorker,
    } as unknown as Parameters<typeof createKeyDerivationController>[1];
    const controller = createKeyDerivationController(view, dependencies);

    controller.start();
    controller.start();
    form.submit();
    expect(view.showError).toHaveBeenCalledWith(expect.stringContaining('self-test has not completed'));
    expect(form.listeners.get('submit')).toBe(1);
    expect(createWorker).toHaveBeenCalledOnce();

    resolveWorkerSelfTest({ passed: true, checks: ['worker fixture'], durationMs: 1 });
    await settle();
    expect(view.setCryptoControlsEnabled).toHaveBeenLastCalledWith(true);

    modeAdvanced.click();
    modeBasic.click();
    expect(view.updateMode).toHaveBeenNthCalledWith(2, 'advanced');
    expect(view.updateMode).toHaveBeenNthCalledWith(3, 'basic');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKeyDerivationController } from '../src/ui/controller.js';
import type { KeyDerivationView } from '../src/ui/view.js';
import { createBitcoinAddressSearchRunner } from '../src/ui/address-search-feature.js';

class Control extends EventTarget {
  value = '';
  checked = false;
  disabled = false;
  querySelectorAll(): Control[] {
    return [];
  }
  click(): void {
    this.dispatchEvent(new Event('click'));
  }
  input(): void {
    this.dispatchEvent(new Event('input'));
  }
}

function fixture() {
  vi.stubGlobal('window', { addEventListener: vi.fn(), setTimeout: vi.fn(() => 0), clearTimeout: vi.fn() });
  const names = [
    'document',
    'form',
    'mnemonic',
    'passphrase',
    'exportFormat',
    'modeBasic',
    'modeAdvanced',
    'resultReceiveTab',
    'resultChangeTab',
    'resultCoinJoinTab',
    'resultCoinJoinExternalTab',
    'resultCoinJoinInternalTab',
    'toggleSensitiveValues',
    'toggleResultSecrets',
    'copyMnemonicButton',
    'copyWatchOnlyButton',
    'downloadWatchOnlyButton',
    'cancelDerivationButton',
    'expectedAddress',
    'searchStart',
    'searchCount',
    'searchAddressButton',
    'generate12Button',
    'generate15Button',
    'generate18Button',
    'generate21Button',
    'generate24Button',
    'clearAllButton',
    'selectAllButton',
    'selectNoneButton',
    'selectInvertButton',
  ];
  const fields = Object.fromEntries(names.map((name) => [name, new Control()]));
  const controls = Object.fromEntries(
    [
      'coin',
      'protocolTabs',
      'network',
      'account',
      'branchInput',
      'branchSelect',
      'includeChange',
      'includeCoinJoin',
      'includeLegacyMobile',
      'start',
      'count',
    ].map((name) => [name, new Control()]),
  );
  controls.network!.value = 'mainnet';
  controls.account!.value = '0';
  controls.start!.value = '0';
  controls.count!.value = '1';
  controls.includeChange!.checked = true;
  fields.mnemonic!.value = 'public synthetic phrase';
  fields.expectedAddress!.value = '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA';
  fields.searchStart!.value = '0';
  fields.searchCount!.value = '5000';
  const methods = new Map<string, ReturnType<typeof vi.fn>>();
  const method = (key: string) => {
    if (!methods.has(key)) methods.set(key, vi.fn());
    return methods.get(key)!;
  };
  const addressSearch = {
    panel: new Control(),
    button: fields.searchAddressButton,
    expectedAddress: fields.expectedAddress,
    searchStart: fields.searchStart,
    searchCount: fields.searchCount,
    result: new Control(),
  };
  const view = new Proxy(
    { ...fields, controls, addressSearch, descriptorButtons: {} },
    {
      get(target, key: string) {
        return key in target ? target[key as keyof typeof target] : method(key);
      },
    },
  ) as unknown as KeyDerivationView;
  const seed = new Uint8Array(64).fill(7);
  type Match = { index: number; path: string; address: string } | null;
  let resolve!: (value: Match) => void;
  let reject!: (cause: Error) => void;
  const pending = new Promise<Match>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Intentionally ignore terminate: obsolete completions must be guarded too.
  const worker = { search: vi.fn(() => pending), terminate: vi.fn() };
  const startup = { selfTest: async () => ({ passed: true, checks: [], durationMs: 0 }), terminate: vi.fn() };
  const createWorker = vi
    .fn()
    .mockReturnValueOnce(startup)
    .mockReturnValueOnce(worker)
    .mockImplementation(() => ({ derive: () => new Promise(() => {}), terminate: vi.fn() }));
  const adapter = {
    id: 'bitcoin-bip44',
    variantLabel: 'BIP44',
    defaults: { branch: 0 },
    addressBranches: { receive: 0, change: 1 },
    fieldRoles: { addresses: ['address'], publicKeys: [], privateKeys: [] },
  };
  const mnemonicToSeed = vi
    .fn()
    .mockReturnValueOnce(seed)
    .mockImplementation(() => new Uint8Array(64).fill(9));
  const dependencies = {
    coinFamilies: [{ id: 'bitcoin', label: 'Bitcoin' }],
    getAdapterFamilyId: () => 'bitcoin',
    getCoinAdapter: () => adapter,
    getDefaultCoinAdapter: () => adapter,
    buildInfo: {},
    generateMnemonic: vi.fn(() => 'replacement phrase'),
    mnemonicToSeed,
    runBip39SelfTest: () => ({ passed: true, checks: [], durationMs: 0 }),
    writeClipboard: vi.fn(),
    downloadBlob: vi.fn(),
    downloadText: vi.fn(),
    createWorker,
    addressSearch: createBitcoinAddressSearchRunner(),
  } as unknown as Parameters<typeof createKeyDerivationController>[1];
  createKeyDerivationController(view, dependencies).start();
  return { fields, controls, method, worker, resolve, reject, seed, createWorker, mnemonicToSeed };
}

describe('known-address search lifecycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('passes the mnemonic and Unicode BIP39 passphrase to seed derivation verbatim', async () => {
    const f = fixture();
    await Promise.resolve();
    await Promise.resolve();
    const mnemonic =
      '  abandon   abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about  ';
    const passphrase = ' кириллица 中文 "quotes" \\ \n\t 🔑 ';
    f.fields.mnemonic!.value = mnemonic;
    f.fields.passphrase!.value = passphrase;
    f.fields.searchAddressButton!.click();
    expect(f.mnemonicToSeed).toHaveBeenCalledWith(mnemonic, passphrase);
  });

  it.each([
    'clearAllButton',
    'generate12Button',
    'generate15Button',
    'generate18Button',
    'generate21Button',
    'generate24Button',
    'mnemonic',
    'passphrase',
    'expectedAddress',
    'searchStart',
    'searchCount',
    'network',
    'account',
    'includeChange',
    'includeCoinJoin',
  ])('releases seed and rejects stale matches after %s', async (name) => {
    const f = fixture();
    await Promise.resolve();
    await Promise.resolve();
    f.fields.searchAddressButton!.click();
    expect(f.worker.search).toHaveBeenCalledOnce();
    const control = f.fields[name] ?? f.controls[name]!;
    if (name.endsWith('Button')) control.click();
    else control.input();
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    expect(f.seed.every((byte) => byte === 0)).toBe(true);
    f.method('showSearchResult').mockClear();
    f.method('showError').mockClear();
    f.resolve({ index: 1, path: 'old/path', address: 'original-address' });
    await Promise.resolve();
    await Promise.resolve();
    expect(f.worker.search).toHaveBeenCalledOnce();
    expect(f.method('showSearchResult')).not.toHaveBeenCalled();
    expect(f.method('showError')).not.toHaveBeenCalled();
  });

  it('does not surface an obsolete worker rejection after Clear All', async () => {
    const f = fixture();
    await Promise.resolve();
    await Promise.resolve();
    f.fields.searchAddressButton!.click();
    f.fields.clearAllButton!.click();
    f.method('showError').mockClear();
    f.reject(new Error('late worker failure'));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.method('showError')).not.toHaveBeenCalled();
    expect(f.seed.every((byte) => byte === 0)).toBe(true);
  });

  it('uses the original address and account snapshot for both branches', async () => {
    const f = fixture();
    await Promise.resolve();
    await Promise.resolve();
    f.fields.searchAddressButton!.click();
    f.fields.expectedAddress!.value = 'another-address';
    f.controls.account!.value = '9';
    f.resolve(null);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.worker.search).toHaveBeenCalledWith(
      'bitcoin-legacy',
      expect.objectContaining({ account: 0, network: 'mainnet', branch: 0 }),
      '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA',
      0,
      5000,
    );
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    expect(f.seed.every((byte) => byte === 0)).toBe(true);
  });
});

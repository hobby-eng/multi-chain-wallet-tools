import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKeyDerivationController } from '../src/ui/controller.js';
import type { KeyDerivationView } from '../src/ui/view.js';
import type { ResultsRenderOptions } from '../src/ui/results.js';

class Control extends EventTarget {
  value = '';
  checked = false;
  disabled = false;
  open = false;
  querySelectorAll(): Control[] { return []; }
  click(): void { this.dispatchEvent(new Event('click')); }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function fixture() {
  vi.stubGlobal('window', { addEventListener: vi.fn(), setTimeout: vi.fn(() => 0), clearTimeout: vi.fn() });
  const names = ['document', 'form', 'mnemonic', 'passphrase', 'exportFormat', 'modeBasic', 'modeAdvanced',
    'resultReceiveTab', 'resultChangeTab', 'resultCoinJoinTab', 'resultCoinJoinExternalTab', 'resultCoinJoinInternalTab',
    'toggleSensitiveValues', 'copyMnemonicButton', 'copyWatchOnlyButton', 'downloadWatchOnlyButton', 'cancelDerivationButton',
    'expectedAddress', 'searchStart', 'searchCount', 'searchAddressButton', 'generate12Button', 'generate24Button',
    'clearAllButton', 'selectAllButton', 'selectNoneButton', 'selectInvertButton', 'messageSignerDialog',
    'messageSignerMessage', 'signMessageButton', 'closeMessageSignerButton', 'messageSignatureOutput', 'copyMessageSignature'];
  const fields = Object.fromEntries(names.map((name) => [name, new Control()]));
  const controls = Object.fromEntries(['coin', 'protocolTabs', 'network', 'account', 'branchInput', 'branchSelect',
    'includeChange', 'includeCoinJoin', 'includeLegacyMobile', 'start', 'count'].map((name) => [name, new Control()]));
  controls.network!.value = 'mainnet';
  controls.account!.value = controls.start!.value = '0';
  controls.count!.value = '1';
  const methods = new Map<string, ReturnType<typeof vi.fn>>();
  const method = (key: string) => {
    if (!methods.has(key)) methods.set(key, vi.fn());
    return methods.get(key)!;
  };
  const view = new Proxy({ ...fields, controls, descriptorButtons: {} }, {
    get(target, key: string) { return key in target ? target[key as keyof typeof target] : method(key); },
  }) as unknown as KeyDerivationView;
  let resolve!: (value: { signature: string; format: string; verified: boolean }) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<{ signature: string; format: string; verified: boolean }>((yes, no) => { resolve = yes; reject = no; });
  const worker = { signMessage: vi.fn(() => pending), terminate: vi.fn() };
  const result = { id: 'bitcoin-taproot', rows: [{ index: 0, path: "m/86'/0'/0'/0/0", basic: [], advanced: [] }], summary: [], basicSummary: [], notices: [] };
  const startup = { selfTest: async () => ({ passed: true, checks: [], durationMs: 0 }), terminate: vi.fn() };
  const derive = { ready: vi.fn(async () => {}), derive: async () => result, terminate: vi.fn() };
  const createWorker = vi.fn().mockReturnValueOnce(startup).mockReturnValueOnce(derive).mockReturnValue(worker);
  const adapter = { id: 'bitcoin-taproot', variantLabel: 'BIP86', defaults: { branch: 0 },
    addressBranches: { receive: 0, change: 1 }, fieldRoles: { addresses: ['address'], publicKeys: [], privateKeys: [] } };
  const seeds: Uint8Array[] = [];
  const dependencies = {
    coinFamilies: [{ id: 'bitcoin', label: 'Bitcoin' }], getAdapterFamilyId: () => 'bitcoin',
    getCoinAdapter: () => adapter, getDefaultCoinAdapter: () => adapter, buildInfo: {},
    generateMnemonic: vi.fn(), mnemonicToSeed: () => { const seed = new Uint8Array(64).fill(7); seeds.push(seed); return seed; },
    runBip39SelfTest: () => ({ passed: true, checks: [], durationMs: 0 }),
    writeClipboard: vi.fn(), downloadBlob: vi.fn(), downloadText: vi.fn(), createWorker,
  } as unknown as Parameters<typeof createKeyDerivationController>[1];
  createKeyDerivationController(view, dependencies).start();
  await settle();
  fields.form!.dispatchEvent(new Event('submit', { cancelable: true }));
  await settle();
  const options = method('renderCurrent').mock.lastCall?.[1] as ResultsRenderOptions;
  expect(options.canSignMessages).toBe(true);
  options.onSignMessage(0, 'public-test-address');
  fields.messageSignerDialog!.open = true;
  fields.messageSignerMessage!.value = 'Public message signing lifecycle fixture';
  fields.signMessageButton!.click();
  expect(worker.signMessage).toHaveBeenCalledOnce();
  return { fields, method, worker, resolve, reject, seeds, options };
}

describe('message signing request lifecycle', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each(['close', 'cancel', 'clear', 'replace'] as const)('discards an obsolete success after %s', async (action) => {
    const f = await fixture();
    if (action === 'close') f.fields.closeMessageSignerButton!.click();
    if (action === 'cancel') f.fields.messageSignerDialog!.dispatchEvent(new Event('cancel'));
    if (action === 'clear') f.fields.clearAllButton!.click();
    if (action === 'replace') f.options.onSignMessage(0, 'another-public-test-address');
    expect(f.worker.terminate).toHaveBeenCalled();
    f.resolve({ signature: 'stale-signature', format: 'BIP-322', verified: true });
    await settle();
    expect(f.method('showMessageSignature')).not.toHaveBeenCalled();
    expect(f.seeds.every((seed) => seed.every((byte) => byte === 0))).toBe(true);
  });

  it('does not surface an obsolete failure in a replacement dialog', async () => {
    const f = await fixture();
    f.fields.closeMessageSignerButton!.click();
    f.options.onSignMessage(0, 'another-public-test-address');
    f.reject(new Error('Obsolete worker error'));
    await settle();
    expect(f.method('showMessageSignerError')).not.toHaveBeenCalled();
  });

  it('shows a verified signature for the current request', async () => {
    const f = await fixture();
    f.resolve({ signature: 'current-signature', format: 'BIP-322', verified: true });
    await settle();
    expect(f.method('showMessageSignature')).toHaveBeenCalledWith('current-signature', 'BIP-322');
    expect(f.seeds.every((seed) => seed.every((byte) => byte === 0))).toBe(true);
  });
});

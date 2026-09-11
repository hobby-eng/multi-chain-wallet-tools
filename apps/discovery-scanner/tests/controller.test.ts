import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecoveryConcurrencyLimiter, mapRecoveryTasks } from '../src/concurrency.js';
import { createDiscoveryScannerController } from '../src/controller.js';
import { SecretEgressGuard } from '../src/secret-guard.js';
import type { RecoveryInputSnapshot, DiscoveryScannerView } from '../src/view.js';
import type { RecoveryWalletResult } from '../src/types.js';

class TestControl extends EventTarget {
  disabled = false;
  dataset: Record<string, string> = {};

  click(): void {
    this.dispatchEvent(new Event('click'));
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function snapshot(): RecoveryInputSnapshot {
  return {
    coinId: 'dash',
    sourceMode: 'seed',
    watchOnlyKeys: '',
    watchOnlyMinimumCount: '100',
    network: 'mainnet',
    account: '0',
    singleMnemonic: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu',
    singlePassphrase: 'registered passphrase',
    batchMnemonics: '',
    batchPassphrases: '',
    batchConcurrency: '1',
    requestConcurrency: '1',
    clearInputOnStart: false,
    scanCore: true,
    coreReceiveCount: '1',
    coreChangeCount: '1',
    scanCustomPath: false,
    customPathTemplate: '',
    scanCustomRange: false,
    customPathRangeEnd: '',
    customPathFormat: '',
    customPathCount: '100',
    scanLegacyCore: false,
    legacyCoreCount: '0',
    scanCoinJoin: false,
    coinJoinExternalCount: '0',
    coinJoinInternalCount: '0',
    scanIdentityFunding: false,
    identityFundingCount: '0',
    identityTopUpIdentityCount: '0',
    identityTopUpCount: '0',
    scanProviderCollateral: false,
    providerCollateralCount: '0',
    scanPlatformAddresses: false,
    platformAddressCount: '0',
    scanPlatformIdentities: false,
    identityStartIndex: '0',
    identityGapLimit: '1',
    identityScanLimit: '1',
    includeUsedZeroBalance: false,
    scanShieldedPool: false,
  };
}

function result(): RecoveryWalletResult {
  return {
    inputId: 'seed-1',
    label: 'Seed phrase #1',
    coinId: 'dash',
    coinLabel: 'Dash',
    network: 'mainnet',
    startedAt: '2026-09-05T00:00:00.000Z',
    completedAt: '2026-09-05T00:00:01.000Z',
    overview: [],
    sections: [],
    warnings: [],
  };
}

function testView() {
  const startButton = new TestControl();
  const singleMode = new TestControl();
  singleMode.dataset.inputMode = 'single';
  const batchMode = new TestControl();
  batchMode.dataset.inputMode = 'batch';
  const revealButton = new TestControl();
  const cancelButton = new TestControl();
  const clearButton = new TestControl();
  const exportCsvButton = new TestControl();
  const exportJsonButton = new TestControl();
  const estimateInput = new TestControl();
  const view = {
    startButton,
    modeButtons: [singleMode, batchMode],
    revealButton,
    cancelButton,
    clearButton,
    exportCsvButton,
    exportJsonButton,
    estimateInputs: [estimateInput],
    readInputs: vi.fn(snapshot),
    populateCoins: vi.fn(),
    setBuildInfo: vi.fn(),
    resetResults: vi.fn(),
    setMode: vi.fn(),
    setRevealed: vi.fn(),
    clearVisibleSecrets: vi.fn(),
    setRunning: vi.fn(),
    updateEstimate: vi.fn(),
    clearError: vi.fn(),
    showError: vi.fn(),
    hideStatus: vi.fn(),
    setStatus: vi.fn(),
    showProgress: vi.fn(),
    renderWalletProgress: vi.fn(),
    progressSectionLabel: vi.fn(() => 'Preparing'),
    renderLiveFinding: vi.fn(),
    renderResults: vi.fn(),
    showSelfTestPassed: vi.fn(),
    showSelfTestFailed: vi.fn(),
  } as unknown as DiscoveryScannerView;
  return {
    view,
    controls: { startButton, singleMode, batchMode, revealButton, cancelButton, clearButton, exportCsvButton, exportJsonButton },
  };
}

describe('Discovery Scanner controller', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('blocks a registered mnemonic before export and never calls the shell export broker', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const { view, controls } = testView();
    const ordering: string[] = [];
    const originalAssertPublic = SecretEgressGuard.prototype.assertPublic;
    vi.spyOn(SecretEgressGuard.prototype, 'assertPublic').mockImplementation(function (
      this: SecretEgressGuard,
      value,
      context,
    ) {
      ordering.push(`tripwire:${context}`);
      originalAssertPublic.call(this, value, context);
    });
    const requestRecoveryExport = vi.fn(async (_text: string, _format: 'csv' | 'json') => 'report.csv');
    const dependencies = {
      RecoveryConcurrencyLimiter,
      SecretEgressGuard,
      assertValidMnemonic: (value: string) => value.trim(),
      createRecoveryExport: vi.fn((_results, format: 'csv' | 'json') => {
        ordering.push(`create:${format}`);
        return {
          filename: `report.${format}`,
          mimeType: format === 'csv' ? 'text/csv' as const : 'application/json' as const,
          text: `public heading,alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu`,
        };
      }),
      describeUnknownError: (cause: unknown) => cause instanceof Error ? cause.message : String(cause),
      getRecoveryCoin: () => ({
        id: 'dash',
        label: 'Dash',
        networks: ['mainnet', 'testnet'] as const,
        scan: vi.fn(async (input, _config, context) => {
          context.sessionSecretGuard?.registerString('BIP39 mnemonic', input.mnemonic);
          return result();
        }),
      }),
      listRecoveryCoins: () => [],
      mapRecoveryTasks,
      recoveryNetworkApi: async () => ({ ping: async () => 'isolated-network-worker-v1' }),
      requestRecoveryExport,
      runRecoverySelfTest: async () => ({ checks: ['fixture'], durationMs: 1 }),
    } as unknown as Parameters<typeof createDiscoveryScannerController>[1];

    const controller = createDiscoveryScannerController(view, dependencies);
    controller.start();
    await settle();
    controls.startButton.click();
    await vi.waitFor(() => {
      expect(view.showError).toHaveBeenCalledWith(expect.stringContaining('Blocked recovery CSV report export'));
    });

    expect(ordering).toEqual([
      'create:csv',
      'tripwire:recovery CSV report export',
    ]);
    const lastRender = vi.mocked(view.renderResults).mock.calls.at(-1);
    expect(lastRender?.[2]).toEqual(new Set());

    controls.exportCsvButton.click();
    await settle();
    expect(requestRecoveryExport).not.toHaveBeenCalled();
    expect(view.showError).toHaveBeenCalledWith('Run and complete a fresh recovery scan before exporting.');
  });

  it('gates startup, resets reveal state on mode changes, and registers listeners once', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const { view, controls } = testView();
    const selfTest = deferred<{ checks: string[]; durationMs: number }>();
    const scan = vi.fn(async () => result());
    const runRecoverySelfTest = vi.fn(() => selfTest.promise);
    const dependencies = {
      RecoveryConcurrencyLimiter,
      SecretEgressGuard,
      assertValidMnemonic: (value: string) => value.trim(),
      createRecoveryExport: (_results: RecoveryWalletResult[], format: 'csv' | 'json') => ({
        filename: `report.${format}`,
        mimeType: format === 'csv' ? 'text/csv' as const : 'application/json' as const,
        text: 'public report',
      }),
      describeUnknownError: (cause: unknown) => cause instanceof Error ? cause.message : String(cause),
      getRecoveryCoin: () => ({
        id: 'dash',
        label: 'Dash',
        networks: ['mainnet', 'testnet'] as const,
        scan,
      }),
      listRecoveryCoins: () => [],
      mapRecoveryTasks,
      recoveryNetworkApi: async () => ({ ping: async () => 'isolated-network-worker-v1' }),
      requestRecoveryExport: vi.fn(async () => 'report.csv'),
      runRecoverySelfTest,
    } as unknown as Parameters<typeof createDiscoveryScannerController>[1];

    const controller = createDiscoveryScannerController(view, dependencies);
    controller.start();
    controller.start();
    controls.startButton.click();
    expect(scan).not.toHaveBeenCalled();
    expect(view.showError).toHaveBeenCalledWith(expect.stringContaining('self-test has not passed'));

    controls.revealButton.click();
    controls.batchMode.click();
    expect(view.setMode).toHaveBeenLastCalledWith('batch');
    expect(view.setRevealed).toHaveBeenLastCalledWith(false);

    selfTest.resolve({ checks: ['fixture'], durationMs: 1 });
    await settle();
    controls.singleMode.click();
    controls.startButton.click();
    await vi.waitFor(() => expect(scan).toHaveBeenCalledOnce());
    expect(runRecoverySelfTest).toHaveBeenCalledOnce();
  });

  it('cancels and restarts scans while clearing each run input on cancel, failure, and success', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const { view, controls } = testView();
    const capturedInputs: Array<{ mnemonic: string; passphrase: string }> = [];
    let call = 0;
    const scan = vi.fn(async (input, _config, context) => {
      capturedInputs.push(input);
      call += 1;
      if (call === 1) {
        await new Promise<never>((_resolve, reject) => {
          context.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
        });
      }
      if (call === 2) throw new Error('fixture scan failure');
      return result();
    });
    const dependencies = {
      RecoveryConcurrencyLimiter,
      SecretEgressGuard,
      assertValidMnemonic: (value: string) => value.trim(),
      createRecoveryExport: (_results: RecoveryWalletResult[], format: 'csv' | 'json') => ({
        filename: `report.${format}`,
        mimeType: format === 'csv' ? 'text/csv' as const : 'application/json' as const,
        text: 'public report',
      }),
      describeUnknownError: (cause: unknown) => cause instanceof Error ? cause.message : String(cause),
      getRecoveryCoin: () => ({
        id: 'dash',
        label: 'Dash',
        networks: ['mainnet', 'testnet'] as const,
        scan,
      }),
      listRecoveryCoins: () => [],
      mapRecoveryTasks,
      recoveryNetworkApi: async () => ({ ping: async () => 'isolated-network-worker-v1' }),
      requestRecoveryExport: vi.fn(async () => 'report.csv'),
      runRecoverySelfTest: async () => ({ checks: ['fixture'], durationMs: 1 }),
    } as unknown as Parameters<typeof createDiscoveryScannerController>[1];
    createDiscoveryScannerController(view, dependencies).start();
    await settle();

    controls.startButton.click();
    await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    controls.cancelButton.click();
    await vi.waitFor(() => expect(capturedInputs[0]).toEqual(expect.objectContaining({
      mnemonic: '',
      passphrase: '',
    })));

    controls.startButton.click();
    await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(capturedInputs[1]).toEqual(expect.objectContaining({
      mnemonic: '',
      passphrase: '',
    })));
    expect(view.showError).toHaveBeenCalledWith('fixture scan failure');

    controls.startButton.click();
    await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(capturedInputs[2]).toEqual(expect.objectContaining({
      mnemonic: '',
      passphrase: '',
    })));
    expect(view.setStatus).toHaveBeenCalledWith(
      'Recovery scan complete. Review and export the standard-wallet handoff report.',
    );
  });
});

// The selected source determines the scan; hidden field contents never override it.
import { assertWatchOnlyBatchInput, parseWatchOnlyLines, resolveWatchOnlyTargets } from '../src/watch-only.js';
import type { RecoveryCoinAdapter, RecoveryWatchOnlyInput, RecoveryWatchOnlyScanConfig, RecoveryScanContext } from '../src/types.js';
import { createRecoveryExport } from '../src/export.js';

const PUBLIC_KEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
function publicHarness(scan?: (coin: string, input: RecoveryWatchOnlyInput, config: RecoveryWatchOnlyScanConfig, context: RecoveryScanContext) => Promise<RecoveryWalletResult>) {
  const { view, controls } = testView();
  const scanSeed = vi.fn(async (input, _config: import('../src/types.js').RecoveryScanConfig) => ({ ...result(), inputId: input.id, label: input.label }));
  const scanKey = vi.fn(async (coin: string, input: RecoveryWatchOnlyInput, config: RecoveryWatchOnlyScanConfig, context: RecoveryScanContext) => scan
    ? scan(coin, input, config, context)
    : { ...result(), inputId: input.id, label: input.label, coinId: coin, coinLabel: coin, network: config.network });
  const adapters: RecoveryCoinAdapter[] = ['bitcoin', 'ethereum', 'dash'].map((id) => ({
    id, label: id, networks: ['mainnet', 'testnet'], scan: scanSeed,
    detectWatchOnly: (value) => ({ coinId: id, kind: 'public-key', value }),
    scanWatchOnly: (input, config, context) => scanKey(id, input, config, context),
  }));
  const getRecoveryCoin = (id: string) => adapters.find((adapter) => adapter.id === id)!;
  const assertValidMnemonic = vi.fn((value: string) => value);
  const requestRecoveryExport = vi.fn(async (_text: string, _format: 'csv' | 'json') => 'report.csv');
  const recoveryNetworkApi = vi.fn(async () => ({ ping: async () => 'isolated-network-worker-v1' as const } as RecoveryScanContext['networkApi']));
  vi.mocked(view.readInputs).mockImplementation(() => ({ ...snapshot(), sourceMode: 'public', watchOnlyKeys: PUBLIC_KEY, watchOnlyMinimumCount: '1', requestConcurrency: '1' }));
  const controller = createDiscoveryScannerController(view, {
    RecoveryConcurrencyLimiter, SecretEgressGuard, assertValidMnemonic, assertWatchOnlyBatchInput,
    parseWatchOnlyLines, resolveWatchOnlyTargets, createRecoveryExport,
    describeUnknownError: (cause) => cause instanceof Error ? cause.message : String(cause),
    getRecoveryCoin, listRecoveryCoins: () => adapters, mapRecoveryTasks, recoveryNetworkApi,
    requestRecoveryExport, runRecoverySelfTest: async () => ({ passed: true, checks: [], durationMs: 0 }),
  });
  return { controller, view, controls, scanSeed, scanKey, assertValidMnemonic, requestRecoveryExport, recoveryNetworkApi };
}

describe('public-key source integration', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('scans only the coin selected for public input and ignores the hidden phrase', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const h = publicHarness();
    h.controller.start(); await settle(); h.controls.startButton.click();
    await vi.waitFor(() => expect(h.view.setStatus).toHaveBeenCalledWith(expect.stringContaining('Public-key scan complete')));
    expect(h.scanKey.mock.calls.map(([coin]) => coin)).toEqual(['dash']);
    expect(h.scanSeed).not.toHaveBeenCalled();
    expect(h.assertValidMnemonic).not.toHaveBeenCalled();
    expect(h.scanKey.mock.calls.every(([, input]) => input.value === '')).toBe(true);
    h.controls.exportJsonButton.click(); await settle();
    expect(h.requestRecoveryExport).toHaveBeenCalledOnce();
    expect(h.requestRecoveryExport.mock.calls[0]?.[0]).not.toContain(snapshot().singleMnemonic);
  });
  it('requires a coin choice when Auto-detect finds more than one compatible adapter', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const h = publicHarness();
    vi.mocked(h.view.readInputs).mockReturnValue({ ...snapshot(), coinId: 'auto', sourceMode: 'public', watchOnlyKeys: PUBLIC_KEY });
    h.controller.start(); await settle(); h.controls.startButton.click(); await settle();
    expect(h.scanKey).not.toHaveBeenCalled();
    expect(h.view.showError).toHaveBeenCalledWith(expect.stringContaining('Select Coin'));
  });
  it('allows Auto-detect when an explicit format identifies exactly one coin', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const h = publicHarness();
    vi.mocked(h.view.readInputs).mockReturnValue({ ...snapshot(), coinId: 'auto', sourceMode: 'public', watchOnlyKeys: `dash-core-xpub:${PUBLIC_KEY}` });
    h.controller.start(); await settle(); h.controls.startButton.click();
    await vi.waitFor(() => expect(h.view.setStatus).toHaveBeenCalledWith(expect.stringContaining('Public-key scan complete')));
    expect(h.scanKey.mock.calls.map(([coin]) => coin)).toEqual(['dash']);
  });
  it('rejects a mixed public/private batch before invoking a scan and erases the input', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const h = publicHarness();
    vi.mocked(h.view.readInputs).mockReturnValue({ ...snapshot(), sourceMode: 'public', watchOnlyKeys: `${PUBLIC_KEY}\n${'11'.repeat(32)}` });
    h.controller.start(); await settle(); h.controls.startButton.click(); await settle();
    expect(h.scanKey).not.toHaveBeenCalled();
    expect(h.view.clearVisibleSecrets).toHaveBeenCalled();
    expect(h.view.showError).toHaveBeenCalledWith(expect.stringContaining('Private'));
  });
  it('stops at cancellation and keeps only completed coin reports exportable', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const pending = deferred<RecoveryWalletResult>();
    const h = publicHarness(async (coin, input, config, context) => {
      if (input.id === 'watch-2-dash') {
        await pending.promise;
        if (context.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      }
      return { ...result(), inputId: input.id, coinId: coin, label: input.label, network: config.network };
    });
    vi.mocked(h.view.readInputs).mockReturnValue({ ...snapshot(), coinId: 'dash', sourceMode: 'public', watchOnlyKeys: `${PUBLIC_KEY}\n${PUBLIC_KEY}`, requestConcurrency: '1' });
    h.controller.start(); await settle(); h.controls.startButton.click();
    await vi.waitFor(() => expect(h.scanKey).toHaveBeenCalledTimes(2));
    h.controls.cancelButton.click(); pending.resolve(result());
    await vi.waitFor(() => expect(h.view.setStatus).toHaveBeenCalledWith(expect.stringContaining('Scan cancelled')));
    expect(h.scanKey).toHaveBeenCalledTimes(2);
    h.controls.exportJsonButton.click(); await settle();
    expect(h.requestRecoveryExport.mock.calls[0]?.[0]).toContain('watch-1-dash');
    expect(h.requestRecoveryExport.mock.calls[0]?.[0]).not.toContain('watch-2-dash');
  });
});


describe('explicit source selection and both batch modes', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('scans the seed tab even when a public key remains in the hidden tab', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const h = publicHarness();
    vi.mocked(h.view.readInputs).mockReturnValue({ ...snapshot(), sourceMode: 'seed', watchOnlyKeys: PUBLIC_KEY });
    h.controller.start(); await settle(); h.controls.startButton.click();
    await vi.waitFor(() => expect(h.scanSeed).toHaveBeenCalledOnce());
    expect(h.scanKey).not.toHaveBeenCalled();
    expect(h.assertValidMnemonic).toHaveBeenCalled();
  });
  it('requires a public key on the public tab even when a seed is present', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const h = publicHarness();
    vi.mocked(h.view.readInputs).mockReturnValue({ ...snapshot(), sourceMode: 'public', watchOnlyKeys: '' });
    h.controller.start(); await settle(); h.controls.startButton.click(); await settle();
    expect(h.scanSeed).not.toHaveBeenCalled(); expect(h.scanKey).not.toHaveBeenCalled();
    expect(h.view.showError).toHaveBeenCalledWith(expect.stringContaining('Enter at least one public key'));
  });
  it('keeps seed batches and ignores hidden public-key contents', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const h = publicHarness();
    vi.mocked(h.view.readInputs).mockImplementation(() => ({ ...snapshot(), sourceMode: 'seed', watchOnlyKeys: PUBLIC_KEY,
      batchMnemonics: `${snapshot().singleMnemonic}\n${snapshot().singleMnemonic}`, batchPassphrases: '\n' }));
    h.controller.start(); await settle(); h.controls.batchMode.click(); h.controls.startButton.click();
    await vi.waitFor(() => expect(h.scanSeed).toHaveBeenCalledTimes(2));
    expect(h.scanKey).not.toHaveBeenCalled();
  });
  it('scans every public-key batch line independently of the seed single/batch selector', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const h = publicHarness();
    vi.mocked(h.view.readInputs).mockImplementation(() => ({ ...snapshot(), sourceMode: 'public', watchOnlyKeys: `${PUBLIC_KEY}\n${PUBLIC_KEY}` }));
    h.controller.start(); await settle(); h.controls.batchMode.click(); h.controls.startButton.click();
    await vi.waitFor(() => expect(h.scanKey).toHaveBeenCalledTimes(2));
    expect(h.scanSeed).not.toHaveBeenCalled();
    expect(h.scanKey.mock.calls.map(([, input]) => input.id)).toEqual(['watch-1-dash', 'watch-2-dash']);
  });
});

for (const sourceMode of ['seed', 'public'] as const) it(`reports a partial ${sourceMode} scan as incomplete and keeps its public report exportable`, async () => {
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  const partial = { ...result(), sections: [{
    id: 'shielded' as const, title: 'Orchard', description: 'fixture', state: 'partial' as const,
    balanceAvailable: false, metrics: [], findings: [], scanned: 1n, source: 'fixture', proof: 'prefix', warning: 'Incomplete stream',
  }] };
  const h = publicHarness(async () => partial);
  h.scanSeed.mockResolvedValue(partial);
  vi.mocked(h.view.readInputs).mockReturnValue({ ...snapshot(), sourceMode, watchOnlyKeys: PUBLIC_KEY });
  h.controller.start(); await settle(); h.controls.startButton.click();
  await vi.waitFor(() => expect(h.view.setStatus).toHaveBeenCalledWith(expect.stringMatching(/scan incomplete/iu)));
  h.controls.exportJsonButton.click(); await settle();
  expect(h.requestRecoveryExport).toHaveBeenCalledOnce();
  const exported = JSON.parse(h.requestRecoveryExport.mock.calls[0]![0]);
  expect(exported.results[0].sections[0].state).toBe('partial');
  expect(exported.results[0].warnings.join(' ')).toMatch(/incomplete/u);
  vi.unstubAllGlobals();
});


describe('custom account range controller', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('passes one custom range per seed while leaving the standard Account setting unchanged', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const h = publicHarness();
    vi.mocked(h.view.readInputs).mockImplementation(() => ({ ...snapshot(), account:'3', scanCustomPath:true, scanCustomRange:true, customPathTemplate:"m/44'/5'/7'/0/{index}", customPathRangeEnd:"m/44'/5'/9'/0/{index}", batchMnemonics:'phrase one\nphrase two' }));
    h.controller.start();await settle();h.controls.batchMode.click();h.controls.startButton.click();
    await vi.waitFor(() => expect(h.view.setStatus).toHaveBeenCalledWith(expect.stringContaining('Recovery scan complete')));
    expect(h.scanSeed).toHaveBeenCalledTimes(2);
    for(const [,cfg] of h.scanSeed.mock.calls) expect(cfg).toMatchObject({account:3,customPathTemplate:"m/44'/5'/7'/0/{index}",customPathRangeEnd:"m/44'/5'/9'/0/{index}"});
  });
  it('rejects a branch mismatch before starting network queries', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const h = publicHarness();
    vi.mocked(h.view.readInputs).mockImplementation(() => ({ ...snapshot(), scanCustomPath:true, scanCustomRange:true, customPathTemplate:"m/44'/5'/0'/0/{index}", customPathRangeEnd:"m/44'/5'/1'/1/{index}" }));
    h.controller.start();await settle();h.recoveryNetworkApi.mockClear();h.controls.startButton.click();
    expect(h.view.showError).toHaveBeenCalledWith(expect.stringContaining('differ only'));
    expect(h.recoveryNetworkApi).not.toHaveBeenCalled();
  });
  it('ignores a stale Finish path when range mode is off and accepts a fully custom single path', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const h = publicHarness();
    vi.mocked(h.view.readInputs).mockImplementation(() => ({ ...snapshot(), scanCustomPath:true, scanCustomRange:false, customPathTemplate:"m/123'/4/{index}'/8", customPathRangeEnd:'bad' }));
    h.controller.start();await settle();h.controls.startButton.click();
    await vi.waitFor(() => expect(h.scanSeed).toHaveBeenCalledTimes(1));
    expect(h.scanSeed.mock.calls[0]![1].customPathRangeEnd).toBeUndefined();
  });
});

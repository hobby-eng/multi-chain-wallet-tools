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
    controls: { startButton, singleMode, batchMode, revealButton, cancelButton, clearButton, exportCsvButton },
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
    const requestRecoveryExport = vi.fn(async () => 'report.csv');
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

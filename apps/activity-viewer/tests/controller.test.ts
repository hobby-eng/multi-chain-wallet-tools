import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActivityViewerController } from '../src/controller.js';
import type { ActivityViewerView } from '../src/view.js';
import type { NormalizedViewingKey } from '@ckd/dash-network/viewing-key.js';
import { assertPublicBatchLookupInput, PrivateMaterialError } from '@ckd/dash-network/private-material.js';
import { assertAutoViewerBatchInput, detectViewerInput } from '../src/detection.js';

class TestControl extends EventTarget {
  disabled = false;
  hidden = false;
  value = '';
  dataset: Record<string, string> = {};

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

function testWindow() {
  return {
    addEventListener: vi.fn(),
    setTimeout(callback: () => void): number {
      return globalThis.setTimeout(callback, 0) as unknown as number;
    },
  };
}

function testView() {
  const form = new TestForm();
  const cancelButton = new TestControl();
  const clearButton = new TestControl();
  const revealButton = new TestControl();
  const revealBatchButton = new TestControl();
  const exportCsvButton = new TestControl();
  const exportJsonButton = new TestControl();
  const coreMode = new TestControl();
  coreMode.dataset.viewerMode = 'core';
  const shieldedMode = new TestControl();
  shieldedMode.dataset.viewerMode = 'shielded';
  const identityMode = new TestControl();
  identityMode.dataset.viewerMode = 'identity';
  const singleQueryMode = new TestControl();
  singleQueryMode.dataset.queryMode = 'single';
  const batchQueryMode = new TestControl();
  batchQueryMode.dataset.queryMode = 'batch';
  const autoDetectionMode = new TestControl();
  autoDetectionMode.dataset.detectionMode = 'auto';
  const advancedDetectionMode = new TestControl();
  advancedDetectionMode.dataset.detectionMode = 'advanced';
  const viewingKeyInput = new TestControl();
  viewingKeyInput.value = 'viewing-key';
  const batchInput = new TestControl();
  const batchConcurrencyInput = new TestControl();
  batchConcurrencyInput.value = '2';
  const keyCapabilityInput = new TestControl();
  keyCapabilityInput.value = 'full';
  const networkInput = new TestControl();
  networkInput.value = 'mainnet';
  const historyLimitInput = new TestControl();
  historyLimitInput.value = '10';
  const view = {
    form,
    cancelButton,
    clearButton,
    revealButton,
    revealBatchButton,
    exportCsvButton,
    exportJsonButton,
    modeButtons: [coreMode, identityMode, shieldedMode],
    queryModeButtons: [singleQueryMode, batchQueryMode],
    detectionModeButtons: [autoDetectionMode, advancedDetectionMode],
    viewingKeyInput,
    batchInput,
    batchConcurrencyInput,
    keyCapabilityInput,
    networkInput,
    historyLimitInput,
    setRunning: vi.fn(),
    setExportAvailable: vi.fn(),
    showError: vi.fn(),
    setStatus: vi.fn(),
    clearMessages: vi.fn(),
    clearResults: vi.fn(),
    renderBatchResults: vi.fn(),
    hideBatchResults: vi.fn(),
    renderShielded: vi.fn(),
    renderCore: vi.fn(),
    renderPlatform: vi.fn(),
    renderIdentity: vi.fn(),
    setDiagnosticDetail: vi.fn(),
    addRemoteDuration: vi.fn(),
    recordRequest: vi.fn(),
    recordRequests: vi.fn(),
    setDiagnosticProof: vi.fn(),
    setDiagnosticRemoteTime: vi.fn(),
    addLocalDuration: vi.fn(),
    updateTiming: vi.fn(),
    finishDiagnostics: vi.fn(),
    failDiagnostics: vi.fn(),
    setRequestCount: vi.fn(),
    setDiagnosticSource: vi.fn(),
    startDiagnostics: vi.fn(),
    showCancellationRequested: vi.fn(),
    resetViewer: vi.fn(),
    setViewerMode: vi.fn(),
    setDetectionMode: vi.fn(),
    setDiagnosticMode: vi.fn(),
    setQueryMode: vi.fn(),
    showSelfTestPassed: vi.fn(),
    showSelfTestFailed: vi.fn(),
    toggleViewingKeyReveal: vi.fn(),
    updateInputMode: vi.fn(),
    clearQueryInput: vi.fn(() => { viewingKeyInput.value = ''; }),
  } as unknown as ActivityViewerView;
  return {
    view,
    controls: {
      form,
      cancelButton,
      identityMode,
      shieldedMode,
      batchQueryMode,
      autoDetectionMode,
      advancedDetectionMode,
      viewingKeyInput,
      batchInput,
      exportJsonButton,
    },
  };
}

function testDependencies(
  viewingKey: NormalizedViewingKey,
  stream: (options: { isCancelled(): boolean }) => Promise<{ complete: boolean; terminalPosition: bigint }>,
  connect: () => Promise<void> = async () => {},
  overrides: Record<string, unknown> = {},
) {
  class Ledger {
    readonly #kind: NormalizedViewingKey['kind'];

    constructor(kind: NormalizedViewingKey['kind']) {
      this.#kind = kind;
    }

    snapshot() {
      return {
        records: [],
        scannedNotes: 0n,
        balance: 0n,
        receivedExternal: 0n,
        sentExternal: 0n,
        selfOrChange: 0n,
        proofHeight: 0n,
        protocolVersion: 0,
        complete: true,
        keyKind: this.#kind,
      };
    }

    applyPage(): void {}
  }
  class Source {
    async connect(): Promise<void> {
      await connect();
    }
    async fetchPage(): Promise<never> {
      throw new Error('not used');
    }
  }
  return {
    ShieldedActivityLedger: Ledger,
    DashEvoShieldedSource: Source,
    DashPlatformAddressSource: class {},
    DashPlatformIdentitySource: class {},
    assertCanonicalViewingKey: vi.fn(),
    assertAutoViewerBatchInput: vi.fn(),
    assertPublicBatchLookupInput: vi.fn(),
    assertPublicLookupInput: vi.fn(),
    createViewerExport: vi.fn(),
    detectViewerInput: vi.fn((value) => ({
      mode: 'core',
      value,
      viewingKeyMode: 'automatic',
      explicit: false,
    })),
    looksLikeAutoOrchardInput: vi.fn(() => false),
    downloadText: vi.fn(),
    normalizeViewingKey: vi.fn(() => viewingKey),
    normalizeIdentityLookupInput: vi.fn(),
    queryCoreAddress: vi.fn(),
    queryPlatformAddressHistory: vi.fn(),
    queryPlatformIdentityHistory: vi.fn(),
    runBlobWorkerSelfTest: vi.fn(async () => 1),
    runOrchardRuntimeSelfTest: vi.fn(() => ({ passed: true, checks: ['fixture'], durationMs: 1 })),
    runShieldedPageStream: vi.fn(stream),
    scanEncryptedPage: vi.fn(),
    shieldedEmptyConfirmations: 2,
    shieldedMaxPagesPerScan: 4096,
    shieldedPageSize: 2048,
    ...overrides,
  } as unknown as Parameters<typeof createActivityViewerController>[1];
}

describe('Activity Viewer controller', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('gates queries until startup checks pass and registers listeners only once', async () => {
    vi.stubGlobal('window', testWindow());
    const { view, controls } = testView();
    let releaseSelfTest!: () => void;
    const selfTest = new Promise<void>((resolve) => { releaseSelfTest = resolve; });
    const key: NormalizedViewingKey = { kind: 'full', hex: 'aa'.repeat(96) };
    const dependencies = testDependencies(key, async () => ({ complete: true, terminalPosition: 0n }));
    vi.mocked(dependencies.runBlobWorkerSelfTest).mockImplementation(async () => {
      await selfTest;
      return 1;
    });
    const controller = createActivityViewerController(view, dependencies);

    controller.start();
    controller.start();
    await settle();
    controls.form.submit();
    expect(view.showError).toHaveBeenCalledWith(expect.stringContaining('self-test has not passed'));
    expect(dependencies.runBlobWorkerSelfTest).toHaveBeenCalledOnce();

    releaseSelfTest();
    await settle();
    controls.shieldedMode.click();
    controls.form.submit();
    await vi.waitFor(() => expect(dependencies.runShieldedPageStream).toHaveBeenCalledOnce());
  });

  it.each(['success', 'failure', 'cancel'] as const)(
    'drops the normalized viewing-key reference after shielded %s',
    async (outcome) => {
      vi.stubGlobal('window', testWindow());
      const { view, controls } = testView();
      const key: NormalizedViewingKey = { kind: 'full', hex: 'ab'.repeat(96) };
      const dependencies = testDependencies(key, async ({ isCancelled }) => {
        if (outcome === 'cancel') {
          controls.cancelButton.click();
          expect(isCancelled()).toBe(true);
          throw new DOMException('cancelled', 'AbortError');
        }
        if (outcome === 'failure') throw new Error('fixture scan failure');
        return { complete: true, terminalPosition: 0n };
      });
      const controller = createActivityViewerController(view, dependencies);
      controller.start();
      await settle();
      controls.shieldedMode.click();
      controls.form.submit();

      await vi.waitFor(() => expect(key.hex).toBe(''));
      if (outcome === 'failure') {
        expect(view.showError).toHaveBeenCalledWith('fixture scan failure');
      }
      if (outcome === 'cancel') {
        expect(view.setStatus).toHaveBeenCalledWith('Query cancelled.');
      }
    },
  );

  it('erases private-key-like Identity input before making a network request', async () => {
    vi.stubGlobal('window', testWindow());
    const { view, controls } = testView();
    const key: NormalizedViewingKey = { kind: 'full', hex: 'ab'.repeat(96) };
    const dependencies = testDependencies(key, async () => ({ complete: true, terminalPosition: 0n }));
    vi.mocked(dependencies.normalizeIdentityLookupInput).mockImplementation(() => {
      throw new PrivateMaterialError();
    });
    const controller = createActivityViewerController(view, dependencies);
    controller.start();
    await settle();
    controls.identityMode.click();
    controls.viewingKeyInput.value = '11'.repeat(32);
    controls.form.submit();

    await vi.waitFor(() => expect(view.clearQueryInput).toHaveBeenCalledOnce());
    expect(view.showError).toHaveBeenCalledWith(expect.stringContaining('No network request was made'));
    expect(dependencies.queryPlatformIdentityHistory).not.toHaveBeenCalled();
  });

  it('keeps successful Core batch results when another input fails', async () => {
    vi.stubGlobal('window', testWindow());
    const { view, controls } = testView();
    const key: NormalizedViewingKey = { kind: 'full', hex: 'ab'.repeat(96) };
    const dependencies = testDependencies(key, async () => ({ complete: true, terminalPosition: 0n }));
    view.networkInput.value = 'testnet';
    vi.mocked(dependencies.queryCoreAddress).mockImplementation(async (address) => {
      if (address === 'Xbad') throw new Error('Invalid fixture address.');
      return {
        kind: 'core', provider: 'DashScan', address, network: 'testnet',
        balanceDuffs: 1n, unconfirmedDuffs: 0n, totalReceivedDuffs: 1n, totalSentDuffs: 0n,
        transactionCount: 0, transactions: [], historyLimit: 10, endpoint: 'https://example.invalid',
        indexStatus: 'ok', indexedHeight: 1, indexedTimeMs: 1, requests: 2,
      };
    });
    const controller = createActivityViewerController(view, dependencies);
    controller.start();
    await settle();
    controls.batchQueryMode.click();
    controls.batchInput.value = 'Xgood\nXbad';
    controls.form.submit();

    await vi.waitFor(() => expect(view.renderBatchResults).toHaveBeenCalled());
    expect(dependencies.queryCoreAddress).toHaveBeenCalledTimes(2);
    expect(dependencies.queryCoreAddress).toHaveBeenCalledWith('Xgood', 'testnet', 10, expect.any(AbortSignal));
    expect(view.renderCore).toHaveBeenCalledOnce();
    expect(view.renderBatchResults).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'query-1', status: 'complete' }),
        expect.objectContaining({ id: 'query-2', status: 'failed', error: 'Invalid fixture address.' }),
      ]),
      'query-1',
      expect.any(Function),
    );
  });

  it('blocks an entire public batch before networking when any line contains private material', async () => {
    vi.stubGlobal('window', testWindow());
    const { view, controls } = testView();
    const key: NormalizedViewingKey = { kind: 'full', hex: 'ab'.repeat(96) };
    const dependencies = testDependencies(key, async () => ({ complete: true, terminalPosition: 0n }));
    vi.mocked(dependencies.normalizeIdentityLookupInput).mockImplementation((value) => {
      if (value === 'secret') throw new PrivateMaterialError();
      return { kind: 'dpns-name', label: 'DPNS name', dpnsName: value };
    });
    const controller = createActivityViewerController(view, dependencies);
    controller.start();
    await settle();
    controls.identityMode.click();
    controls.batchQueryMode.click();
    controls.batchInput.value = 'alice.dash\nsecret';
    controls.form.submit();

    await vi.waitFor(() => expect(view.clearQueryInput).toHaveBeenCalledOnce());
    expect(view.showError).toHaveBeenCalledWith(expect.stringContaining('No network request was made'));
    expect(dependencies.queryPlatformIdentityHistory).not.toHaveBeenCalled();
  });

  it('blocks an embedded multiline mnemonic before parsing or networking a public batch', async () => {
    vi.stubGlobal('window', testWindow());
    const { view, controls } = testView();
    const key: NormalizedViewingKey = { kind: 'full', hex: 'ab'.repeat(96) };
    const dependencies = testDependencies(key, async () => ({ complete: true, terminalPosition: 0n }));
    vi.mocked(dependencies.assertPublicBatchLookupInput).mockImplementation(assertPublicBatchLookupInput);
    const mnemonic = [
      'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
      'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'about',
      'alice.dash',
    ].join('\n');
    const controller = createActivityViewerController(view, dependencies);
    controller.start();
    await settle();
    controls.identityMode.click();
    controls.batchQueryMode.click();
    controls.batchInput.value = mnemonic;
    controls.form.submit();

    await vi.waitFor(() => expect(view.clearQueryInput).toHaveBeenCalledOnce());
    expect(dependencies.assertPublicBatchLookupInput).toHaveBeenCalledOnce();
    expect(dependencies.assertPublicBatchLookupInput).toHaveBeenCalledWith(mnemonic);
    expect(dependencies.normalizeIdentityLookupInput).not.toHaveBeenCalled();
    expect(dependencies.queryPlatformIdentityHistory).not.toHaveBeenCalled();
    expect(view.showError).toHaveBeenCalledWith(expect.stringContaining('No network request was made'));
  });

  it.each(['identity', 'orchard'])(
    'blocks a multiline mnemonic with a prefixed first word before Auto batch networking: %s',
    async (prefix) => {
    vi.stubGlobal('window', testWindow());
    const { view, controls } = testView();
    const key: NormalizedViewingKey = { kind: 'full', hex: 'ab'.repeat(96) };
    const dependencies = testDependencies(key, async () => ({ complete: true, terminalPosition: 0n }));
    vi.mocked(dependencies.assertAutoViewerBatchInput).mockImplementation(assertAutoViewerBatchInput);
    vi.mocked(dependencies.detectViewerInput).mockImplementation(detectViewerInput);
    const mnemonic = [
      `${prefix}:abandon`,
      ...Array.from({ length: 10 }, () => 'abandon'),
      'about',
      'alice.dash',
    ].join('\n');
    const controller = createActivityViewerController(view, dependencies);
    controller.start();
    await settle();
    controls.batchQueryMode.click();
    controls.batchInput.value = mnemonic;
    controls.form.submit();

    await vi.waitFor(() => expect(view.clearQueryInput).toHaveBeenCalledOnce());
    expect(dependencies.detectViewerInput).not.toHaveBeenCalled();
    expect(dependencies.queryPlatformIdentityHistory).not.toHaveBeenCalled();
    expect(view.showError).toHaveBeenCalledWith(expect.stringContaining('No network request was made'));
    },
  );

  it.each(['canonical validation', 'source connection'] as const)(
    'erases normalized Orchard keys after a %s failure',
    async (failureStage) => {
      vi.stubGlobal('window', testWindow());
      const { view, controls } = testView();
      const key: NormalizedViewingKey = { kind: 'full', hex: 'ab'.repeat(96) };
      const dependencies = testDependencies(
        key,
        async () => ({ complete: true, terminalPosition: 0n }),
        async () => {
          if (failureStage === 'source connection') throw new Error('fixture connection failure');
        },
      );
      if (failureStage === 'canonical validation') {
        vi.mocked(dependencies.assertCanonicalViewingKey).mockImplementation(() => {
          throw new Error('fixture canonical validation failure');
        });
      }
      const controller = createActivityViewerController(view, dependencies);
      controller.start();
      await settle();
      controls.shieldedMode.click();
      controls.batchQueryMode.click();
      controls.batchInput.value = 'viewing-key';
      controls.form.submit();

      await vi.waitFor(() => expect(key.hex).toBe(''));
      expect(dependencies.runShieldedPageStream).not.toHaveBeenCalled();
    },
  );

  it('reuses one shielded page stream across an Orchard viewing-key batch', async () => {
    vi.stubGlobal('window', testWindow());
    const { view, controls } = testView();
    const firstKey: NormalizedViewingKey = { kind: 'full', hex: 'ab'.repeat(96) };
    const secondKey: NormalizedViewingKey = { kind: 'incoming', hex: 'cd'.repeat(64) };
    const dependencies = testDependencies(firstKey, async () => ({ complete: true, terminalPosition: 0n }));
    vi.mocked(dependencies.normalizeViewingKey)
      .mockReturnValueOnce(firstKey)
      .mockReturnValueOnce(secondKey);
    const controller = createActivityViewerController(view, dependencies);
    controller.start();
    await settle();
    controls.shieldedMode.click();
    controls.batchQueryMode.click();
    controls.batchInput.value = 'first-viewing-key\nsecond-viewing-key';
    controls.form.submit();

    await vi.waitFor(() => expect(view.renderBatchResults).toHaveBeenCalled());
    expect(dependencies.normalizeViewingKey).toHaveBeenCalledTimes(2);
    expect(dependencies.runShieldedPageStream).toHaveBeenCalledOnce();
    expect(view.renderShielded).toHaveBeenCalledOnce();
    expect(firstKey.hex).toBe('');
    expect(secondKey.hex).toBe('');
  });

  it('auto-detects and executes a mixed batch across all four viewer types', async () => {
    vi.stubGlobal('window', testWindow());
    const { view, controls } = testView();
    const key: NormalizedViewingKey = { kind: 'full', hex: 'ab'.repeat(96) };
    const platformQuery = vi.fn(async () => ({
      kind: 'platform' as const,
      address: 'platform-value',
      network: 'testnet' as const,
      exists: true,
      balanceCredits: 1n,
      nonce: 0n,
      proofHeight: 12n,
      coreChainLockedHeight: 10,
      protocolVersion: 13,
      responseTimeMs: 1n,
    }));
    const identityQuery = vi.fn(async () => ({
      kind: 'identity' as const,
      network: 'testnet' as const,
      inputKind: 'dpns-name' as const,
      inputLabel: 'DPNS name',
      publicKeyHashHex: null,
      resolvedDpnsName: 'alice.dash',
      resolvedDpnsDocumentId: null,
      resolvedRegistrationTransactionHash: null,
      proofs: [{ height: 12n, coreChainLockedHeight: 10, protocolVersion: 13, responseTimeMs: 1n }],
      requests: 1,
      identities: [],
    }));
    const dependencies = testDependencies(
      key,
      async () => ({ complete: true, terminalPosition: 0n }),
      async () => {},
      {
        DashPlatformAddressSource: class {
          async connect(): Promise<void> {}
          query = platformQuery;
        },
        DashPlatformIdentitySource: class {
          async connect(): Promise<void> {}
          query = identityQuery;
        },
      },
    );
    vi.mocked(dependencies.detectViewerInput).mockImplementation((value) => ({
      mode: value.replace('-value', '') as 'core' | 'platform' | 'identity' | 'shielded',
      value,
      viewingKeyMode: 'automatic',
      explicit: false,
    }));
    vi.mocked(dependencies.normalizeIdentityLookupInput).mockReturnValue({
      kind: 'dpns-name',
      label: 'DPNS name',
      dpnsName: 'alice.dash',
    });
    vi.mocked(dependencies.queryCoreAddress).mockResolvedValue({
      kind: 'core',
      provider: 'DashScan',
      address: 'core-value',
      network: 'testnet',
      balanceDuffs: 1n,
      unconfirmedDuffs: 0n,
      totalReceivedDuffs: 1n,
      totalSentDuffs: 0n,
      transactionCount: 0,
      transactions: [],
      historyLimit: 10,
      endpoint: 'https://example.invalid',
      indexStatus: 'ok',
      indexedHeight: 11,
      indexedTimeMs: 1,
      requests: 2,
    });
    vi.mocked(dependencies.queryPlatformAddressHistory).mockResolvedValue({
      provider: 'Dash Platform Explorer',
      address: 'platform-value',
      base58Address: null,
      totalTransitions: 0,
      incomingTransitions: 0,
      outgoingTransitions: 0,
      totalIncomingCredits: 0n,
      totalOutgoingCredits: 0n,
      explorerBalanceCredits: 1n,
      explorerNonce: 0,
      transitions: [],
      historyLimit: 10,
      endpoint: 'https://example.invalid',
      indexStatus: 'synced',
      indexedHeight: 12,
      indexedTimeMs: 1,
      requests: 3,
    });

    const controller = createActivityViewerController(view, dependencies);
    controller.start();
    await settle();
    controls.batchQueryMode.click();
    controls.batchInput.value = 'core-value\nplatform-value\nidentity-value\nshielded-value';
    controls.form.submit();

    await vi.waitFor(() => expect(view.renderBatchResults).toHaveBeenCalled());
    expect(dependencies.queryCoreAddress).toHaveBeenCalledOnce();
    expect(platformQuery).toHaveBeenCalledOnce();
    expect(identityQuery).toHaveBeenCalledOnce();
    expect(dependencies.runShieldedPageStream).toHaveBeenCalledOnce();
    expect(view.renderBatchResults).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({ id: 'query-1', status: 'complete' }),
        expect.objectContaining({ id: 'query-2', status: 'complete' }),
        expect.objectContaining({ id: 'query-3', status: 'complete' }),
        expect.objectContaining({ id: 'query-4', status: 'complete' }),
      ],
      'query-1',
      expect.any(Function),
    );
    expect(key.hex).toBe('');
  });

  it('redacts a failed Orchard key throughout mixed batch state', async () => {
    vi.stubGlobal('window', testWindow());
    const { view, controls } = testView();
    const viewingKeyValue = 'ab'.repeat(96);
    const key: NormalizedViewingKey = { kind: 'full', hex: viewingKeyValue };
    const dependencies = testDependencies(key, async () => ({ complete: true, terminalPosition: 0n }));
    vi.mocked(dependencies.detectViewerInput).mockImplementation((value) => ({
      mode: value === viewingKeyValue ? 'shielded' : 'core',
      value,
      viewingKeyMode: 'automatic',
      explicit: false,
    }));
    vi.mocked(dependencies.looksLikeAutoOrchardInput).mockImplementation(
      (value) => value === viewingKeyValue,
    );
    vi.mocked(dependencies.assertCanonicalViewingKey).mockImplementation(() => {
      throw new Error('fixture canonical validation failure');
    });
    vi.mocked(dependencies.queryCoreAddress).mockResolvedValue({
      kind: 'core',
      provider: 'DashScan',
      address: 'core-value',
      network: 'mainnet',
      balanceDuffs: 1n,
      unconfirmedDuffs: 0n,
      totalReceivedDuffs: 1n,
      totalSentDuffs: 0n,
      transactionCount: 0,
      transactions: [],
      historyLimit: 10,
      endpoint: 'https://example.invalid',
      indexStatus: 'ok',
      indexedHeight: 11,
      indexedTimeMs: 1,
      requests: 2,
    });
    vi.mocked(dependencies.createViewerExport).mockReturnValue({
      filename: 'fixture.json',
      mimeType: 'application/json',
      text: '{}',
    });
    const controller = createActivityViewerController(view, dependencies);
    controller.start();
    await settle();
    controls.batchQueryMode.click();
    controls.batchInput.value = `core-value\n${viewingKeyValue}`;
    controls.form.submit();

    await vi.waitFor(() => expect(view.renderBatchResults).toHaveBeenCalled());
    controls.exportJsonButton.click();
    expect(view.renderBatchResults).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'query-2',
          label: '2 · ORCHARD · viewing key',
          status: 'failed',
        }),
      ]),
      'query-1',
      expect.any(Function),
    );
    expect(dependencies.createViewerExport).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'mixed',
        errors: [expect.objectContaining({
          id: 'query-2',
          label: '2 · ORCHARD · viewing key',
          mode: 'shielded',
        })],
      }),
      'json',
    );
    expect(key.hex).toBe('');
  });
});

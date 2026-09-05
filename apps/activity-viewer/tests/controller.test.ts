import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActivityViewerController } from '../src/controller.js';
import type { ActivityViewerView } from '../src/view.js';
import type { NormalizedViewingKey } from '@ckd/dash-network/viewing-key.js';
import { PrivateMaterialError } from '@ckd/dash-network/private-material.js';

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
  const exportCsvButton = new TestControl();
  const exportJsonButton = new TestControl();
  const coreMode = new TestControl();
  coreMode.dataset.viewerMode = 'core';
  const shieldedMode = new TestControl();
  shieldedMode.dataset.viewerMode = 'shielded';
  const identityMode = new TestControl();
  identityMode.dataset.viewerMode = 'identity';
  const viewingKeyInput = new TestControl();
  viewingKeyInput.value = 'viewing-key';
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
    exportCsvButton,
    exportJsonButton,
    modeButtons: [coreMode, identityMode, shieldedMode],
    viewingKeyInput,
    keyCapabilityInput,
    networkInput,
    historyLimitInput,
    setRunning: vi.fn(),
    setExportAvailable: vi.fn(),
    showError: vi.fn(),
    setStatus: vi.fn(),
    clearMessages: vi.fn(),
    clearResults: vi.fn(),
    renderShielded: vi.fn(),
    renderCore: vi.fn(),
    renderPlatform: vi.fn(),
    renderIdentity: vi.fn(),
    setDiagnosticDetail: vi.fn(),
    addRemoteDuration: vi.fn(),
    recordRequest: vi.fn(),
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
    showSelfTestPassed: vi.fn(),
    showSelfTestFailed: vi.fn(),
    toggleViewingKeyReveal: vi.fn(),
    updateInputMode: vi.fn(),
    clearQueryInput: vi.fn(() => { viewingKeyInput.value = ''; }),
  } as unknown as ActivityViewerView;
  return { view, controls: { form, cancelButton, identityMode, shieldedMode, viewingKeyInput } };
}

function testDependencies(
  viewingKey: NormalizedViewingKey,
  stream: (options: { isCancelled(): boolean }) => Promise<{ complete: boolean; terminalPosition: bigint }>,
) {
  class Ledger {
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
      };
    }

    applyPage(): void {}
  }
  class Source {
    async connect(): Promise<void> {}
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
    assertPublicLookupInput: vi.fn(),
    createViewerExport: vi.fn(),
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
});

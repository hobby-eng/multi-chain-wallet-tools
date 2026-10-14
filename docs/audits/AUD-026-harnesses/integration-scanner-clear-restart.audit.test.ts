// AUD-026 integration reviewer, CHECK-API-002: the Discovery Scanner's production controller
// (createDiscoveryScannerController) with a synthetic seed adapter whose network operation finishes
// only after Cancel or Clear, as the page itself says ("Waiting for the current network/proof
// operation to finish"). Clear, then Start again before the first run has unwound. The checks state
// the expected behaviour: the first run's late end must not touch the second run. Public test data
// only; no network.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RecoveryConcurrencyLimiter,
  mapRecoveryTasks,
} from "../../../apps/discovery-scanner/src/concurrency.js";
import { createDiscoveryScannerController } from "../../../apps/discovery-scanner/src/controller.js";
import { ALL_DISCOVERY_FEATURES } from "../../../apps/discovery-scanner/src/feature-selection.js";
import { dashSeedLookups } from "../../../apps/discovery-scanner/src/scan-estimate.js";
import type {
  DiscoveryScannerView,
  RecoveryInputSnapshot,
} from "../../../apps/discovery-scanner/src/view.js";
import type { RecoveryWalletResult } from "../../../apps/discovery-scanner/src/types.js";
import { SecretEgressGuard } from "@ckd/secret-boundary/secret-guard.js";

class Control extends EventTarget {
  disabled = false;
  dataset: Record<string, string> = {};
  click(): void {
    this.dispatchEvent(new Event("click"));
  }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// The public BIP39 test phrase; the controller only hands it to the synthetic adapter.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
// A synthetic value the second run registers with the session guard, as ScanSecrets does.
const SECOND_RUN_SECRET = "synthetic-second-run-secret-value";

function snapshot(): RecoveryInputSnapshot {
  return {
    coinId: "dash",
    sourceMode: "seed",
    watchOnlyKeys: "",
    watchOnlyMinimumCount: "100",
    network: "mainnet",
    account: "0",
    singleMnemonic: PHRASE,
    singlePassphrase: "",
    batchMnemonics: "",
    batchPassphrases: "",
    batchConcurrency: "1",
    requestConcurrency: "1",
    clearInputOnStart: false,
    scanCore: true,
    coreReceiveCount: "1",
    coreChangeCount: "1",
    scanCustomPath: false,
    customPathTemplate: "",
    scanCustomRange: false,
    customPathRangeEnd: "",
    customPathFormat: "",
    customPathCount: "100",
    scanLegacyCore: false,
    legacyCoreCount: "0",
    scanCoinJoin: false,
    coinJoinExternalCount: "0",
    coinJoinInternalCount: "0",
    scanIdentityFunding: false,
    identityFundingCount: "0",
    identityTopUpIdentityCount: "0",
    identityTopUpCount: "0",
    scanProviderCollateral: false,
    providerCollateralCount: "0",
    scanPlatformAddresses: false,
    platformAddressCount: "0",
    scanPlatformIdentities: false,
    identityStartIndex: "0",
    identityGapLimit: "1",
    identityScanLimit: "1",
    includeUsedZeroBalance: false,
    scanShieldedPool: false,
  } as RecoveryInputSnapshot;
}

function harness() {
  const startButton = new Control();
  const cancelButton = new Control();
  const clearButton = new Control();
  const single = new Control();
  single.dataset.inputMode = "single";
  const batch = new Control();
  batch.dataset.inputMode = "batch";
  const view = {
    startButton,
    modeButtons: [single, batch],
    revealButton: new Control(),
    cancelButton,
    clearButton,
    exportCsvButton: new Control(),
    exportJsonButton: new Control(),
    exportXlsxButton: new Control(),
    estimateInputs: [new Control()],
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
    progressSectionLabel: vi.fn(() => "Preparing"),
    renderLiveFinding: vi.fn(),
    renderResults: vi.fn(),
    renderAddressSearch: vi.fn(),
    resetAddressSearch: vi.fn(),
    showSelfTestPassed: vi.fn(),
    showSelfTestFailed: vi.fn(),
  } as unknown as DiscoveryScannerView;
  // Each scan ends only when the test releases it: the first one after Clear, as a provider
  // request that finishes its current operation before it sees the abort.
  const runs: Array<{
    signal: AbortSignal;
    guard: SecretEgressGuard;
    release: () => void;
  }> = [];
  const scan = vi.fn(async (_input, _config, context): Promise<RecoveryWalletResult> => {
    const guard = context.sessionSecretGuard as SecretEgressGuard;
    if (runs.length === 1) guard.registerString("Synthetic secret", SECOND_RUN_SECRET);
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    runs.push({ signal: context.signal, guard, release });
    await released;
    if (context.signal.aborted) throw new DOMException("cancelled", "AbortError");
    return {
      inputId: "seed-1",
      label: "Seed phrase #1",
      coinId: "dash",
      coinLabel: "Dash",
      network: "mainnet",
      startedAt: "2026-10-09T00:00:00.000Z",
      completedAt: "2026-10-09T00:00:01.000Z",
      overview: [],
      sections: [],
      warnings: [],
    };
  });
  const dependencies = {
    ...ALL_DISCOVERY_FEATURES,
    RecoveryConcurrencyLimiter,
    SecretEgressGuard,
    assertValidMnemonic: (value: string) => value.trim(),
    createRecoveryExport: (_results: RecoveryWalletResult[], format: "csv" | "json") => ({
      filename: `report.${format}`,
      mimeType: format === "csv" ? "text/csv" : "application/json",
      text: "public report",
    }),
    describeUnknownError: (cause: unknown) =>
      cause instanceof Error ? cause.message : String(cause),
    getRecoveryCoin: () => ({
      id: "dash",
      label: "Dash",
      networks: ["mainnet", "testnet"],
      minimumSeedLookups: dashSeedLookups,
      scan,
    }),
    listRecoveryCoins: () => [],
    mapRecoveryTasks,
    recoveryNetworkApi: async () => ({ ping: async () => "isolated-network-worker-v1" }),
    requestRecoveryExport: vi.fn(async () => "report.csv"),
    runRecoverySelfTest: async () => ({ checks: ["fixture"], durationMs: 1 }),
  } as unknown as Parameters<typeof createDiscoveryScannerController>[1];
  createDiscoveryScannerController(view, dependencies).start();
  return { view, scan, runs, startButton, cancelButton, clearButton };
}

describe("AUD-026 integration: Scanner Clear then Start before the first run unwinds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the second run's Cancel, running state, secret guard and status", async () => {
    vi.stubGlobal("window", { addEventListener: vi.fn() });
    const h = harness();
    await settle();
    h.startButton.click();
    await vi.waitFor(() => expect(h.scan).toHaveBeenCalledTimes(1));
    h.clearButton.click();
    expect(h.runs[0]!.signal.aborted).toBe(true);
    // Clear reports the page as idle, so Start is offered again at once.
    h.startButton.click();
    await vi.waitFor(() => expect(h.scan).toHaveBeenCalledTimes(2));
    const second = h.runs[1]!;
    const statusCallsBefore = vi.mocked(h.view.setStatus).mock.calls.length;
    // The first run's operation now finishes and the run unwinds.
    h.runs[0]!.release();
    await settle();
    await settle();

    const lateStatuses = vi
      .mocked(h.view.setStatus)
      .mock.calls.slice(statusCallsBefore)
      .map(([text]) => String(text));
    const lastRunning = vi.mocked(h.view.setRunning).mock.calls.at(-1)?.[0];
    let guardStillBlocks = false;
    try {
      second.guard.assertPublic(`request ${SECOND_RUN_SECRET}`, "audit probe");
    } catch {
      guardStillBlocks = true;
    }
    h.cancelButton.click();
    const cancelReachedSecond = second.signal.aborted;
    second.release();
    await settle();

    // Recorded for the evidence log, then asserted one by one.
    console.log(
      JSON.stringify({ lateStatuses, lastRunning, guardStillBlocks, cancelReachedSecond }, null, 2),
    );
    expect(lateStatuses, "the first run writes no status over the second").toEqual([]);
    expect(lastRunning, "the page still shows the second run as running").toBe(true);
    expect(guardStillBlocks, "the second run's registered secret stays registered").toBe(true);
    expect(cancelReachedSecond, "Cancel stops the second run").toBe(true);
  });
});

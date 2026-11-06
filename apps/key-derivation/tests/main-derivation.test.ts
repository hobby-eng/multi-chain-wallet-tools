import { afterEach, expect, it, vi } from "vitest";
import { getAdapterFamilyId, getCoinAdapter } from "@ckd/coins/registry.js";
import { deriveBitcoin } from "@ckd/coins/bitcoin/index.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { DerivationResults } from "@ckd/ui/derivation-results.js";
import { DeriverViewFixture } from "@ckd/test-support/deriver-view.js";
import { AdapterSettingsStore } from "../src/ui/adapter-settings.js";
import { DerivationResultPanel } from "../src/ui/derivation-result-panel.js";
import { DerivationWorkspaceTabs } from "../src/ui/derivation-workspace-tabs.js";
import { LargeRequestPolicy } from "../src/ui/large-request-policy.js";
import { MainDerivation } from "../src/ui/main-derivation.js";

const PHRASE = `${"abandon ".repeat(11)}about`; // Published BIP39 zero-entropy phrase.

function pending<Value>() {
  let resolve: (value: Value) => void = () => {};
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(holdReady = false) {
  const native = new DeriverViewFixture();
  const { view } = native;
  const adapter = getCoinAdapter("bitcoin-legacy");
  const results = new DerivationResults();
  view.configureControls(adapter);
  view.controls.count.value = "1";
  view.controls.includeChange.checked = false;
  view.mnemonic.value = PHRASE;
  view.passphrase.value = "";
  const tabs = new DerivationWorkspaceTabs({
    view,
    adapter: () => adapter,
    hasResults: () => results.current !== null,
    silentPaymentAvailable: false,
    activate: () => {},
    schedule: () => {},
    placeDisclosure: () => {},
  });
  const panel = new DerivationResultPanel({
    view,
    results,
    adapter: () => adapter,
    feature: () => tabs.active,
    bip38: () => undefined,
    signing: () => undefined,
    bip85: () => null,
    silentPayment: () => undefined,
    release: (action) => action(),
    writeClipboard: async () => {},
    downloadBlob: () => {},
    downloadText: () => {},
  });
  const settings = new AdapterSettingsStore(getAdapterFamilyId);
  const policy = new LargeRequestPolicy({
    adapter: () => adapter,
    activeFeatureTab: () => tabs.active,
    showConfirmation: () => view.showLargeRequestConfirmation(),
    showStatus: (line) => view.showStatus(line),
  });
  const ready = pending<void>();
  const reply = pending<DerivationResult>();
  const seeds: Uint8Array[] = [];
  let response: DerivationResult | undefined;
  const worker = {
    ready: () => (holdReady ? ready.promise : Promise.resolve()),
    derive: (_id: string, input: Parameters<typeof deriveBitcoin>[1]) => {
      seeds.push(input.seed);
      // Only the worker response boundary is deferred; all wallet rules and output stay real.
      response = deriveBitcoin("legacy", input);
      return reply.promise;
    },
    terminate: vi.fn(),
  };
  const operation = new MainDerivation({
    view,
    results,
    panel,
    tabs,
    settings,
    policy,
    adapter: () => adapter,
    cryptoReady: () => true,
    cancelAutomatic: () => {},
    bip38: () => undefined,
    createWorker: () => worker,
    mnemonicToSeed,
  });
  return {
    operation,
    results,
    seeds,
    ready,
    worker,
    view,
    finish: () => {
      if (response === undefined) throw new Error("The native worker has not received a request.");
      reply.resolve(response);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

it.each(["cancel", "replace"] as const)(
  "wipes the borrowed seed immediately on %s and refuses the late real result",
  async (action) => {
    const setup = fixture();
    const running = setup.operation.run();
    await vi.waitFor(() => expect(setup.seeds).toHaveLength(1));
    const seed = setup.seeds[0]!;
    expect(seed.some((byte) => byte !== 0)).toBe(true);
    if (action === "cancel") setup.operation.cancel();
    else setup.operation.advance();
    expect(seed.every((byte) => byte === 0)).toBe(true);
    setup.finish();
    await running;
    expect(setup.results.size).toBe(0);
    expect(setup.worker.terminate).toHaveBeenCalled();
  },
);

it("does not read or derive from the phrase after cancellation while the worker is booting", async () => {
  const setup = fixture(true);
  const running = setup.operation.run();
  setup.operation.cancel();
  setup.ready.resolve();
  await running;
  expect(setup.seeds).toEqual([]);
  expect(setup.results.size).toBe(0);
});

it("keeps the published legacy address and releases the seed on normal completion", async () => {
  const setup = fixture();
  const running = setup.operation.run();
  await vi.waitFor(() => expect(setup.seeds).toHaveLength(1));
  setup.finish();
  await running;
  // Same literal vector as the independent worker startup catalogue, never derived as an expectation.
  expect(
    setup.results.current?.rows[0]?.basic.find((field) => field.key === "address")?.value,
  ).toBe("1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA");
  expect(setup.seeds[0]?.every((byte) => byte === 0)).toBe(true);
  setup.operation.advance();
  setup.results.wipe();
});

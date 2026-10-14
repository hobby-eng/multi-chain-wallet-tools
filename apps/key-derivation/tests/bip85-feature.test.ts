import { afterEach, describe, expect, it, vi } from "vitest";
import { entropyToEnglishMnemonic, mnemonicToSeed } from "@ckd/core/bip39.js";
import { deriveBip85Bip39 } from "@ckd/core/bip85.js";
import { hexToBytes } from "@ckd/core/crypto.js";
import { installBip85Feature } from "../src/ui/bip85-feature.js";
import { SELF_TEST_NOT_PASSED } from "../src/ui/crypto-self-test-gate.js";
import {
  deriveBip85,
  type Bip85RequestOptions,
  type Bip85Result,
} from "../src/workers/bip85-deriver.js";
import {
  DerivationCancelledError,
  type DerivationWorkerClient,
} from "../src/workers/derive-client.js";

/** Public zero-entropy BIP39 test phrase, used as the BIP85 parent. */
const PARENT_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
/** The passphrase of the official BIP39 test vectors, used here as the child passphrase. */
const CHILD_PASSPHRASE = "TREZOR";
/** Words of the derived child phrase, as selected in #bip85-words. */
const CHILD_WORDS = 12;

const ELEMENT_IDS = [
  "bip85-application",
  "bip85-index",
  "bip85-words",
  "bip85-bytes",
  "derive-bip85",
  "open-bip85-wallet",
  "toggle-bip85-secret",
  "toggle-bip85-child-passphrase",
  "bip85-recovery-source-menu",
  "bip85-output",
  "bip85-path",
  "bip85-result",
  "bip85-error",
  "bip85-child-passphrase",
] as const;
type ElementId = (typeof ELEMENT_IDS)[number];

/** The few element features the BIP85 feature and its child wallet use. */
class FakeElement extends EventTarget {
  hidden = false;
  disabled = false;
  value = "";
  type = "";
  textContent = "";
  readonly attributes = new Map<string, string>();
  readonly classList = { toggle: (): void => undefined };
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

/** A document whose elements exist only for ELEMENT_IDS; every other query returns null. */
function fakeDocument(): { document: Document; byId: (id: ElementId) => FakeElement } {
  const elements = new Map<string, FakeElement>(ELEMENT_IDS.map((id) => [id, new FakeElement()]));
  const document = {
    querySelector: (selector: string) =>
      selector.startsWith("#") ? (elements.get(selector.slice(1)) ?? null) : null,
    createElement: () => new FakeElement(),
  } as unknown as Document;
  return { document, byId: (id) => elements.get(id)! };
}

/**
 * A worker whose reply the test sends by hand. A "deaf" worker only records terminate(), so a
 * reply can still arrive afterwards; a "cancelling" one rejects the pending request on terminate()
 * like the real DerivationWorkerClient.
 */
function deferredWorker(behaviour: "deaf" | "cancelling") {
  let pending: { resolve(value: Bip85Result): void; reject(reason: Error): void } | null = null;
  let request: { seed: Uint8Array; options: Bip85RequestOptions } | null = null;
  const terminate = vi.fn((reason?: Error) => {
    if (behaviour === "cancelling") pending?.reject(reason ?? new DerivationCancelledError());
  });
  const client = {
    deriveBip85(seed: Uint8Array, options: Bip85RequestOptions): Promise<Bip85Result> {
      // The real client transfers its own copy of the seed to the worker.
      request = { seed: seed.slice(), options };
      return new Promise<Bip85Result>((resolve, reject) => {
        pending = { resolve, reject };
      });
    },
    terminate,
  } as unknown as DerivationWorkerClient;
  return {
    client,
    terminate,
    /** Sends the worker's real BIP85 answer for the request it received. */
    reply(): void {
      if (pending === null || request === null) throw new Error("No BIP85 request is pending.");
      try {
        pending.resolve(deriveBip85(request.seed, request.options));
      } finally {
        request.seed.fill(0);
      }
    },
    fail(cause: Error): void {
      if (pending === null) throw new Error("No BIP85 request is pending.");
      pending.reject(cause);
    },
  };
}
type DeferredWorker = ReturnType<typeof deferredWorker>;

function expectedChild(index: number): string {
  const seed = mnemonicToSeed(PARENT_MNEMONIC);
  try {
    return entropyToEnglishMnemonic(
      hexToBytes(deriveBip85Bip39(seed, CHILD_WORDS, index).entropyHex),
    );
  } finally {
    seed.fill(0);
  }
}

/**
 * Installs the feature with the given workers, handed out one per request in order. `selfTest`
 * stands for the page's self-test verdict and can change during a test.
 */
function featureHarness(workers: readonly DeferredWorker[], selfTest = { passed: true }) {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const { document, byId } = fakeDocument();
  byId("bip85-application").value = "bip39";
  byId("bip85-index").value = "0";
  byId("bip85-words").value = String(CHILD_WORDS);
  byId("bip85-bytes").value = "32";
  byId("bip85-result").hidden = true;
  byId("bip85-error").hidden = true;
  byId("bip85-child-passphrase").value = CHILD_PASSPHRASE;
  const seeds: Uint8Array[] = [];
  const queue = [...workers];
  const feature = installBip85Feature({
    document,
    parentMnemonic: () => PARENT_MNEMONIC,
    parentPassphrase: () => "",
    isActive: () => true,
    mnemonicMayBeComplete: () => true,
    cryptoReady: () => selfTest.passed,
    secretsRevealed: () => false,
    setSecretsRevealed: () => undefined,
    mnemonicToSeed: (mnemonic: string, passphrase?: string) => {
      const seed = mnemonicToSeed(mnemonic, passphrase);
      seeds.push(seed);
      return seed;
    },
    createWorker: () => {
      const next = queue.shift();
      if (next === undefined) throw new Error("The test provided no further worker.");
      return next.client;
    },
  } as unknown as Parameters<typeof installBip85Feature>[0]);
  return { feature, byId, seeds };
}

type Harness = ReturnType<typeof featureHarness>;

function expectWiped(seed: Uint8Array | undefined): void {
  expect(seed).toBeDefined();
  expect(seed!.every((byte) => byte === 0)).toBe(true);
}

function expectChildShown({ feature, byId }: Harness, child: string): void {
  expect(byId("bip85-output").value).toBe(child);
  expect(byId("bip85-result").hidden).toBe(false);
  expect(byId("bip85-error").hidden).toBe(true);
  expect(feature.childSource().mnemonic).toBe(child);
  expect(feature.sourceReference()?.read()).toEqual({
    mnemonic: child,
    passphrase: CHILD_PASSPHRASE,
  });
  expect(byId("derive-bip85").disabled).toBe(false);
}

function expectNoChild({ feature, byId }: Harness): void {
  expect(byId("bip85-output").value).toBe("");
  expect(byId("bip85-result").hidden).toBe(true);
  expect(byId("bip85-error").hidden).toBe(true);
  expect(byId("open-bip85-wallet").hidden).toBe(true);
  expect(byId("bip85-recovery-source-menu").hidden).toBe(true);
  expect(feature.sourceReference()).toBeNull();
  expect(feature.childSource().mnemonic).toBeNull();
}

describe("BIP85 feature request lifecycle (AUD-022-SEC001)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the child, wipes the parent seed and releases the worker once a request completes", async () => {
    const worker = deferredWorker("cancelling");
    const harness = featureHarness([worker]);
    const pending = harness.feature.derive();
    expect(harness.byId("derive-bip85").disabled).toBe(true);
    expect(worker.terminate).not.toHaveBeenCalled();

    worker.reply();
    await pending;
    expectChildShown(harness, expectedChild(0));
    expect(harness.byId("bip85-path").textContent).toBe("m/83696968'/39'/0'/12'/0'");
    expect(worker.terminate).toHaveBeenCalledOnce();
    expectWiped(harness.seeds[0]);
  });

  it("keeps a cleared child absent when the earlier reply arrives after Clear", async () => {
    const first = deferredWorker("cancelling");
    const second = deferredWorker("deaf");
    const harness = featureHarness([first, second]);
    const completed = harness.feature.derive();
    first.reply();
    await completed;
    const earlier = harness.feature.sourceReference();
    expect(earlier?.read()?.mnemonic).toBe(expectedChild(0));

    const pending = harness.feature.derive();
    harness.feature.reset();
    // Clear stops the worker at once instead of waiting for its reply.
    expect(second.terminate).toHaveBeenCalledOnce();
    expect(second.terminate.mock.calls[0]?.[0]).toBeInstanceOf(DerivationCancelledError);
    expect(harness.byId("derive-bip85").disabled).toBe(false);

    second.reply();
    await pending;
    expectNoChild(harness);
    expect(earlier?.read()).toBeNull();
    expectWiped(harness.seeds[1]);
    expect(harness.byId("derive-bip85").disabled).toBe(false);
  });

  it("does not publish an error that arrives after Clear", async () => {
    const worker = deferredWorker("deaf");
    const harness = featureHarness([worker]);
    const pending = harness.feature.derive();
    harness.feature.reset();

    worker.fail(new Error("Synthetic late worker failure."));
    await pending;
    expectNoChild(harness);
    expect(harness.byId("bip85-error").textContent).toBe("");
    expectWiped(harness.seeds[0]);
  });

  it("swallows the cancellation a real worker raises when Clear terminates it", async () => {
    const worker = deferredWorker("cancelling");
    const harness = featureHarness([worker]);
    const pending = harness.feature.derive();
    harness.feature.reset();

    await pending;
    const reason = worker.terminate.mock.calls[0]?.[0];
    expect(reason).toBeInstanceOf(DerivationCancelledError);
    expect(reason?.message).toBe("BIP85 derivation cleared by the user.");
    expectNoChild(harness);
    expect(harness.byId("bip85-error").textContent).toBe("");
    expectWiped(harness.seeds[0]);
    expect(harness.byId("derive-bip85").disabled).toBe(false);
  });

  it("drops a pending request and an earlier child when the parent changes", async () => {
    const pendingWorker = deferredWorker("deaf");
    const completedWorker = deferredWorker("cancelling");
    const nextWorker = deferredWorker("cancelling");
    const harness = featureHarness([pendingWorker, completedWorker, nextWorker]);

    const pending = harness.feature.derive();
    harness.feature.invalidate();
    expect(pendingWorker.terminate).toHaveBeenCalledOnce();
    pendingWorker.reply();
    await pending;
    expectNoChild(harness);
    expectWiped(harness.seeds[0]);

    const completed = harness.feature.derive();
    completedWorker.reply();
    await completed;
    const earlier = harness.feature.sourceReference();
    expect(earlier?.read()?.mnemonic).toBe(expectedChild(0));
    harness.feature.invalidate();
    expectNoChild(harness);
    expect(earlier?.read()).toBeNull();
    // The child passphrase is the user's own input and survives a parent change.
    expect(harness.byId("bip85-child-passphrase").value).toBe(CHILD_PASSPHRASE);

    // The feature still derives normally afterwards.
    const next = harness.feature.derive();
    nextWorker.reply();
    await next;
    expectChildShown(harness, expectedChild(0));
  });

  it("keeps the newer child when an older reply arrives last", async () => {
    const older = deferredWorker("deaf");
    const newer = deferredWorker("deaf");
    const harness = featureHarness([older, newer]);

    const olderRequest = harness.feature.derive();
    harness.byId("bip85-index").value = "1";
    const newerRequest = harness.feature.derive();
    // The newer request supersedes the older one and stops its worker.
    expect(older.terminate).toHaveBeenCalledOnce();
    expect(newer.terminate).not.toHaveBeenCalled();

    newer.reply();
    await newerRequest;
    older.reply();
    await olderRequest;
    expectChildShown(harness, expectedChild(1));
    expect(harness.byId("bip85-path").textContent).toBe("m/83696968'/39'/0'/12'/1'");
    expectWiped(harness.seeds[0]);
    expectWiped(harness.seeds[1]);
  });
});

describe("BIP85 feature after a failed self-test (AUD-023-SEC001)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("derives nothing, by button or by itself, until the self-tests pass", async () => {
    vi.useFakeTimers();
    // No worker is provided: creating one would throw and fail the test.
    const harness = featureHarness([], { passed: false });
    await harness.feature.derive();
    expect(harness.seeds).toHaveLength(0);
    expect(harness.byId("bip85-error").textContent).toBe(SELF_TEST_NOT_PASSED);
    expect(harness.byId("bip85-error").hidden).toBe(false);
    expect(harness.byId("bip85-result").hidden).toBe(true);

    harness.feature.scheduleRefresh();
    await vi.runAllTimersAsync();
    expect(harness.seeds).toHaveLength(0);
  });

  it("drops the child and closes the button when a later self-test fails", async () => {
    const worker = deferredWorker("cancelling");
    const selfTest = { passed: true };
    const harness = featureHarness([worker], selfTest);
    const pending = harness.feature.derive();
    worker.reply();
    await pending;
    expectChildShown(harness, expectedChild(0));

    selfTest.passed = false;
    harness.feature.setEnabled(false);
    expectNoChild(harness);
    expect(harness.byId("derive-bip85").disabled).toBe(true);
  });
});

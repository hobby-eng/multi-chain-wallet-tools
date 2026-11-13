import { afterEach, describe, expect, it, vi } from "vitest";
import { PassiveQrPage } from "../../../test/support/qr-page.js";
import { CompleteIdPage } from "@ckd/test-support/complete-id-page.js";
import {
  COIN_FAMILIES,
  getAdapterFamilyId,
  getCoinAdapter,
  getDefaultCoinAdapter,
} from "@ckd/coins/registry.js";
import type { RecoveryTestElement as FakeElement } from "./fake-recovery-page.js";
import { entropyToEnglishMnemonic, mnemonicToSeed } from "@ckd/core/bip39.js";
import { Bip85 } from "@ckd/core/bip85.js";
import { hexToBytes } from "@ckd/core/crypto.js";
import {
  installBip85ChildWallet,
  type Bip85ChildWalletOptions,
} from "../src/ui/bip85-child-wallet-feature.js";
import { installSilentPaymentFeature } from "../src/ui/silent-payment-feature.js";
import { SELF_TEST_NOT_PASSED } from "../src/ui/crypto-self-test-gate.js";
import { deriveSilentPayment } from "../src/workers/silent-payment.js";
import type { DerivationWorkerClient } from "../src/workers/derive-client.js";

/** Public BIP39 test phrase used as the parent wallet throughout the test suite. */
const PARENT_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
/** The passphrase of the official BIP39 test vectors, used here as the child-wallet passphrase. */
const CHILD_PASSPHRASE = "TREZOR";
const CHILD_PREFIX = "bip85-wallet-";

/** Output element IDs of a Silent Payments panel, without the workspace prefix. */
const OUTPUT_IDS = [
  "silent-payment-address",
  "silent-payment-change-address",
  "silent-payment-scan-path",
  "silent-payment-scan-key",
  "silent-payment-spend-path",
  "silent-payment-spend-key",
] as const;

/** A native-boundary fake whose nodes have their owning document and window. */
function fakeDocument(ids: readonly string[]) {
  const page = new PassiveQrPage();
  for (const id of ids) page.add(id);
  return { document: page.asDocument(), byId: (id: string) => page.require(id) };
}

/** A page on which every control the child workspace opens with exists on demand. */
function childDocument(ids: readonly string[]) {
  const page = new CompleteIdPage();
  for (const id of ids) page.add(id);
  return { page, document: page.asDocument(), byId: (id: string) => page.require(id) };
}

/** Opens the child workspace as the page does, on the build's first coin, Bitcoin. */
function openChild(options: Partial<Bip85ChildWalletOptions>) {
  const child = installBip85ChildWallet({
    coinFamilies: COIN_FAMILIES,
    getCoinAdapter,
    getDefaultCoinAdapter,
    getAdapterFamilyId,
    ...options,
  } as unknown as Bip85ChildWalletOptions);
  child.initialize();
  child.cancelScheduledRefresh();
  return child;
}

function panelIds(prefix: string): string[] {
  return [
    `${prefix}derive-silent-payment`,
    `${prefix}silent-payment-network`,
    `${prefix}silent-payment-account`,
    `${prefix}silent-payment-labels`,
    `${prefix}silent-payment-result`,
    `${prefix}silent-payment-error`,
    `${prefix}silent-payment-labeled-list`,
    ...OUTPUT_IDS.map((id) => `${prefix}${id}`),
  ];
}

/** Runs Silent Payments in the test process instead of a Web Worker. */
function inProcessWorker(): DerivationWorkerClient {
  return {
    deriveSilentPayment: (
      seed: Uint8Array,
      network: "mainnet" | "testnet",
      account: number,
      labels: number[],
    ) => deriveSilentPayment(seed, network, account, labels),
    terminate: () => undefined,
  } as unknown as DerivationWorkerClient;
}

function childMnemonicOf(parent: string): string {
  const seed = mnemonicToSeed(parent);
  try {
    return entropyToEnglishMnemonic(hexToBytes(Bip85.bip39(seed, 12, 0).entropyHex));
  } finally {
    seed.fill(0);
  }
}

async function settle(byId: (id: string) => FakeElement, prefix: string): Promise<void> {
  await vi.waitFor(() => {
    if (
      byId(`${prefix}silent-payment-result`).hidden &&
      byId(`${prefix}silent-payment-error`).hidden
    )
      throw new Error("Silent Payments result is not ready yet.");
  });
}

function outputsOf(byId: (id: string) => FakeElement, prefix: string): string[] {
  expect(byId(`${prefix}silent-payment-error`).hidden).toBe(true);
  return OUTPUT_IDS.map((id) => byId(`${prefix}${id}`).textContent);
}

describe("BIP85 child wallet Silent Payments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives from the child phrase and passphrase exactly what the original workspace shows for them", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const childMnemonic = childMnemonicOf(PARENT_MNEMONIC);
    const { document, byId } = childDocument([
      ...panelIds(""),
      ...panelIds(CHILD_PREFIX),
      `${CHILD_PREFIX}include-silent-payment`,
      `${CHILD_PREFIX}silent-payment-tab`,
      `${CHILD_PREFIX}silent-payment-panel`,
      "bip85-child-passphrase",
    ]);
    for (const prefix of ["", CHILD_PREFIX]) {
      byId(`${prefix}silent-payment-network`).value = "mainnet";
      byId(`${prefix}silent-payment-account`).value = "0";
      byId(`${prefix}silent-payment-result`).hidden = true;
      byId(`${prefix}silent-payment-error`).hidden = true;
    }
    byId("bip85-child-passphrase").value = CHILD_PASSPHRASE;

    // The original workspace, as if the child phrase and passphrase were typed there.
    let originalMnemonic = childMnemonic;
    let originalPassphrase = CHILD_PASSPHRASE;
    const original = installSilentPaymentFeature({
      document,
      mnemonic: () => originalMnemonic,
      passphrase: () => originalPassphrase,
      mnemonicToSeed,
      createWorker: inProcessWorker,
      isActive: () => true,
      mnemonicMayBeComplete: () => true,
      cryptoReady: () => true,
    });

    // The child workspace receives the same feature module that the controller passes in.
    openChild({
      document,
      mnemonic: () => childMnemonic,
      mnemonicToSeed,
      createWorker: inProcessWorker,
      installSilentPaymentFeature,
      cryptoReady: () => true,
      secretsRevealed: () => false,
      setSecretsRevealed: () => undefined,
    });

    const includeChildSilentPayment = byId(`${CHILD_PREFIX}include-silent-payment`);
    const childTab = byId(`${CHILD_PREFIX}silent-payment-tab`);
    expect(childTab.hidden).toBe(true);
    includeChildSilentPayment.checked = true;
    includeChildSilentPayment.dispatchEvent(new Event("change"));
    expect(childTab.hidden).toBe(false);
    childTab.click();
    expect(byId(`${CHILD_PREFIX}silent-payment-panel`).hidden).toBe(false);
    await settle(byId, CHILD_PREFIX);
    const child = outputsOf(byId, CHILD_PREFIX);

    original.derive();
    await settle(byId, "");
    expect(outputsOf(byId, "")).toEqual(child);
    expect(child[0]).toMatch(/^sp1q/u);

    // The parent phrase with the same passphrase gives another wallet, so the child used its own phrase.
    byId("silent-payment-result").hidden = true;
    originalMnemonic = PARENT_MNEMONIC;
    original.derive();
    await settle(byId, "");
    expect(outputsOf(byId, "")[0]).not.toBe(child[0]);

    // Without the child passphrase the child phrase gives another wallet, so the child used its passphrase.
    byId("silent-payment-result").hidden = true;
    originalMnemonic = childMnemonic;
    originalPassphrase = "";
    original.derive();
    await settle(byId, "");
    expect(outputsOf(byId, "")[0]).not.toBe(child[0]);
  });
});

it("clears child Silent Payments even when an active signing surface refuses to close", async () => {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const { document, byId } = childDocument([
    ...panelIds(CHILD_PREFIX),
    `${CHILD_PREFIX}include-silent-payment`,
    `${CHILD_PREFIX}silent-payment-tab`,
    `${CHILD_PREFIX}silent-payment-panel`,
    "bip85-child-passphrase",
  ]);
  byId(`${CHILD_PREFIX}silent-payment-network`).value = "mainnet";
  byId(`${CHILD_PREFIX}silent-payment-account`).value = "0";
  byId(`${CHILD_PREFIX}silent-payment-result`).hidden = true;
  byId(`${CHILD_PREFIX}silent-payment-error`).hidden = true;
  const close = vi.fn();
  const child = openChild({
    document,
    mnemonic: () => PARENT_MNEMONIC,
    mnemonicToSeed,
    createWorker: inProcessWorker,
    installSilentPaymentFeature,
    cryptoReady: () => true,
    secretsRevealed: () => false,
    setSecretsRevealed: () => undefined,
    messageSigning: {
      activeSource: () => "bip85",
      close,
    } as unknown as NonNullable<Bip85ChildWalletOptions["messageSigning"]>,
  });
  close.mockImplementation((): void => {
    throw new Error("Synthetic native signing close fault");
  });
  byId(`${CHILD_PREFIX}include-silent-payment`).checked = true;
  byId(`${CHILD_PREFIX}include-silent-payment`).dispatchEvent(new Event("change"));
  // The failure is armed after the setup transition, which also clears the child view.
  close.mockImplementationOnce(() => undefined);
  byId(`${CHILD_PREFIX}silent-payment-tab`).click();
  await settle(byId, CHILD_PREFIX);
  expect(byId(`${CHILD_PREFIX}silent-payment-scan-key`).textContent).not.toBe("");
  expect(() => child.clear()).toThrow("Synthetic native signing close fault");
  for (const id of OUTPUT_IDS) expect(byId(`${CHILD_PREFIX}${id}`).textContent).toBe("");
  expect(byId(`${CHILD_PREFIX}silent-payment-result`).hidden).toBe(true);
  vi.unstubAllGlobals();
});

it("offers child Silent Payments while the child's coin is Bitcoin, keeping the tick under another coin", () => {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const { page, document, byId } = childDocument([
    ...panelIds(CHILD_PREFIX),
    `${CHILD_PREFIX}silent-payment-tab`,
    `${CHILD_PREFIX}silent-payment-panel`,
  ]);
  // The option and its label, nested as the page's template nests them beside the option's "?".
  const option = page.add(`${CHILD_PREFIX}silent-payment-option`);
  option.classList.add("field-heading-row");
  const label = page.add(`${CHILD_PREFIX}silent-payment-label`, "label", option);
  const checkbox = page.add(`${CHILD_PREFIX}include-silent-payment`, "input", label);
  const child = openChild({
    document,
    mnemonic: () => PARENT_MNEMONIC,
    mnemonicToSeed,
    createWorker: inProcessWorker,
    installSilentPaymentFeature,
    cryptoReady: () => true,
    secretsRevealed: () => false,
    setSecretsRevealed: () => undefined,
  });
  const controls = child.controls();
  if (controls === null) throw new Error("The child workspace must open with its controls.");
  const tab = byId(`${CHILD_PREFIX}silent-payment-tab`);
  const panel = byId(`${CHILD_PREFIX}silent-payment-panel`);
  const state = () => [
    option.hidden,
    checkbox.disabled,
    checkbox.checked,
    tab.hidden,
    panel.hidden,
  ];
  const choose = (family: string) => {
    controls.coin.value = family;
    controls.coin.dispatchEvent(new Event("change"));
    child.cancelScheduledRefresh();
  };
  expect(child.adapter()?.id).toMatch(/^bitcoin-/u);
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event("change"));
  tab.click();
  expect(state()).toEqual([false, false, true, false, false]);
  for (const family of ["ethereum", "solana", "cardano", "dash"]) {
    choose(family);
    expect(state(), family).toEqual([true, true, true, true, true]);
    tab.click();
    expect(panel.hidden, family).toBe(true);
  }
  choose("bitcoin");
  expect(state()).toEqual([false, false, true, false, true]);
  child.clear();
  vi.unstubAllGlobals();
});

describe("Silent Payments after a failed self-test (AUD-023-SEC001)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function install(selfTest: { passed: boolean }) {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const { document, byId } = fakeDocument(panelIds(""));
    byId("silent-payment-network").value = "mainnet";
    byId("silent-payment-account").value = "0";
    byId("silent-payment-result").hidden = true;
    byId("silent-payment-error").hidden = true;
    let workers = 0;
    const feature = installSilentPaymentFeature({
      document,
      mnemonic: () => PARENT_MNEMONIC,
      passphrase: () => "",
      mnemonicToSeed,
      createWorker: () => {
        workers += 1;
        return inProcessWorker();
      },
      isActive: () => true,
      mnemonicMayBeComplete: () => true,
      cryptoReady: () => selfTest.passed,
    });
    return { feature, byId, workers: () => workers };
  }

  it("derives nothing, by button or by itself, until the self-tests pass", async () => {
    vi.useFakeTimers();
    const { feature, byId, workers } = install({ passed: false });
    feature.derive();
    expect(workers()).toBe(0);
    expect(byId("silent-payment-error").textContent).toBe(SELF_TEST_NOT_PASSED);
    expect(byId("silent-payment-result").hidden).toBe(true);

    feature.scheduleRefresh();
    await vi.runAllTimersAsync();
    expect(workers()).toBe(0);
  });

  it("drops the addresses and closes the button when a later self-test fails", async () => {
    const selfTest = { passed: true };
    const { feature, byId, workers } = install(selfTest);
    feature.derive();
    await settle(byId, "");
    expect(workers()).toBe(1);
    expect(byId("silent-payment-address").textContent).toMatch(/^sp1q/u);

    selfTest.passed = false;
    feature.setEnabled(false);
    expect(byId("silent-payment-result").hidden).toBe(true);
    expect(byId("silent-payment-address").textContent).toBe("");
    expect(byId("derive-silent-payment").disabled).toBe(true);
  });
});

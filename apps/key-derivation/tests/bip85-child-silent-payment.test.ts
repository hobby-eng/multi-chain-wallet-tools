import { afterEach, describe, expect, it, vi } from "vitest";
import { entropyToEnglishMnemonic, mnemonicToSeed } from "@ckd/core/bip39.js";
import { deriveBip85Bip39 } from "@ckd/core/bip85.js";
import { hexToBytes } from "@ckd/core/crypto.js";
import {
  installBip85ChildWallet,
  type Bip85ChildWalletOptions,
} from "../src/ui/bip85-child-wallet-feature.js";
import { installSilentPaymentFeature } from "../src/ui/silent-payment-feature.js";
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

/** The few element features the Silent Payments and child-wallet code use. */
class FakeElement extends EventTarget {
  hidden = false;
  disabled = false;
  checked = false;
  value = "";
  textContent = "";
  parentElement: FakeElement | null = null;
  readonly classList = { toggle: (): void => undefined };
  setAttribute(name: string, value: string): void {
    if (name === "hidden") this.hidden = value !== null;
  }
  replaceChildren(): void {}
  append(...children: FakeElement[]): void {
    for (const child of children) child.parentElement = this;
  }
  prepend(...children: FakeElement[]): void {
    this.append(...children);
  }
  closest(): FakeElement | null {
    return null;
  }
  click(): void {
    this.dispatchEvent(new Event("click"));
  }
}

/** A document whose elements exist only for the IDs listed; every other query returns null. */
function fakeDocument(ids: readonly string[]): {
  document: Document;
  byId: (id: string) => FakeElement;
} {
  const elements = new Map(ids.map((id) => [id, new FakeElement()]));
  const byId = (id: string): FakeElement => {
    const element = elements.get(id);
    if (element === undefined) throw new Error(`Missing fake element #${id}.`);
    return element;
  };
  const document = {
    querySelector: (selector: string) =>
      selector.startsWith("#") ? (elements.get(selector.slice(1)) ?? null) : null,
    createElement: () => new FakeElement(),
  } as unknown as Document;
  return { document, byId };
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
    return entropyToEnglishMnemonic(hexToBytes(deriveBip85Bip39(seed, 12, 0).entropyHex));
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
    const { document, byId } = fakeDocument([
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
    });

    // The child workspace receives the same feature module that the controller passes in.
    installBip85ChildWallet({
      document,
      mnemonic: () => childMnemonic,
      mnemonicToSeed,
      createWorker: inProcessWorker,
      installSilentPaymentFeature,
      secretsRevealed: () => false,
      setSecretsRevealed: () => undefined,
    } as unknown as Bip85ChildWalletOptions);

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

import { afterEach, expect, it, vi } from "vitest";
import { CompleteIdPage } from "@ckd/test-support/complete-id-page.js";
import {
  COIN_FAMILIES,
  getCoinAdapter,
  getDefaultCoinAdapter,
  getAdapterFamilyId,
} from "@ckd/coins/registry.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { field, type DerivationResult } from "@ckd/core/types.js";
import { DerivationWorkerClient } from "../src/workers/derive-client.js";
import { FakeRecoveryWorker } from "./fake-recovery-worker.js";
import { installBip85ChildWallet } from "../src/ui/bip85-child-wallet-feature.js";
import { AccountDescriptorFixture } from "@ckd/test-support/account-descriptor-fixture.js";
import { updateSecretVisibility } from "../src/ui/results.js";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function fixture(accountFormat?: string, cryptoReady = () => true) {
  const page = new CompleteIdPage();
  if (accountFormat !== undefined) {
    const dialog = page.add("bip85-wallet-account-export-dialog", "dialog");
    const format = page.add("bip85-wallet-account-export-format", "select", dialog);
    format.value = accountFormat;
    for (const action of ["publicCopy", "privateCopy"]) {
      const button = page.add(`fixture-${action}`, "button", dialog);
      button.dataset.bip85Descriptor = action;
    }
  }
  vi.stubGlobal("Worker", FakeRecoveryWorker);
  vi.stubGlobal("__DERIVATION_WORKER_SOURCE__", "Synthetic passive worker, never executed");
  const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-child");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const seeds: Uint8Array[] = [];
  let sourceReads = 0;
  const errors: string[] = [];
  const copyText = vi.fn<Parameters<typeof installBip85ChildWallet>[0]["copyText"]>(async () => {});
  let revealed = false;
  const child = installBip85ChildWallet({
    document: page.asDocument(),
    coinFamilies: COIN_FAMILIES,
    getCoinAdapter,
    getDefaultCoinAdapter,
    getAdapterFamilyId,
    mnemonic: () => {
      sourceReads += 1;
      return PHRASE;
    },
    cryptoReady,
    secretsRevealed: () => revealed,
    setSecretsRevealed: (value) => {
      revealed = value;
    },
    mnemonicToSeed: (...args) => {
      const seed = mnemonicToSeed(...args);
      seeds.push(seed);
      return seed;
    },
    createWorker: () => new DerivationWorkerClient(),
    copyText,
    copyBulkFrom: async () => {},
    downloadRowsFrom: async () => {},
    downloadText: () => {},
    showError: (text) => {
      errors.push(text);
    },
    showStatus: () => {},
  });
  child.initialize();
  child.cancelScheduledRefresh();
  const controls = child.controls();
  if (controls === null) throw new Error("The native fixture must expose derivation controls.");
  controls.count.value = "1";
  sourceReads = 0;
  return {
    child,
    page,
    seeds,
    errors,
    controls,
    createUrl,
    copyText,
    sourceReads: () => sourceReads,
  };
}

function reply(child: ReturnType<typeof fixture>, accountDescriptors = false) {
  const worker = FakeRecoveryWorker.latest;
  worker.reply({ type: "ready" });
  const request: unknown = worker.postMessage.mock.calls[0]?.[0];
  if (
    typeof request !== "object" ||
    request === null ||
    !("id" in request) ||
    typeof request.id !== "number"
  )
    throw new Error("The actual worker client must post its admitted request.");
  const result: DerivationResult = {
    id: child.child.adapter()?.id ?? "synthetic",
    title: "Synthetic",
    networkLabel: "mainnet",
    pathTemplate: "m/i",
    basicSummary: [],
    summary: [],
    notices: [],
    ...(accountDescriptors ? { accountDescriptors: AccountDescriptorFixture.create() } : {}),
    rows: [
      {
        index: 0,
        path: "m/0",
        title: "Synthetic row",
        basic: [field("address", "Address", "synthetic public address")],
        advanced: [],
      },
    ],
  };
  worker.reply({ id: request.id, type: "derive", ok: true, result });
  return { worker, result };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("unlocks the child operation when native worker construction fails", async () => {
  const f = fixture();
  vi.stubGlobal(
    "Worker",
    class {
      constructor() {
        throw new Error("Synthetic native constructor fault");
      }
    },
  );
  await expect(f.child.derive()).resolves.toBeUndefined();
  expect(f.page.require("derive-bip85-wallet").disabled).toBe(false);
  expect(f.page.require("bip85-wallet-error").hidden).toBe(false);
  f.child.clear();
});

it("wipes the owned child seed synchronously when Clear revokes active work", async () => {
  const f = fixture();
  const pending = f.child.derive();
  FakeRecoveryWorker.latest.reply({ type: "ready" });
  f.child.clear();
  try {
    expect(f.seeds[0]?.every((byte) => byte === 0)).toBe(true);
  } finally {
    await pending;
  }
  expect(f.child.hasResults()).toBe(false);
});

it("unlocks a completed child operation even if native worker cleanup fails", async () => {
  const f = fixture();
  const pending = f.child.derive();
  const { worker } = reply(f);
  worker.terminate.mockImplementationOnce(() => {
    throw new Error("Synthetic native teardown fault");
  });
  await expect(pending).resolves.toBeUndefined();
  expect(f.page.require("derive-bip85-wallet").disabled).toBe(false);
  expect(f.seeds.every((seed) => seed.every((byte) => byte === 0))).toBe(true);
  f.child.clear();
});

it("keeps a complete child result and releases its seed after normal derivation", async () => {
  const f = fixture();
  const pending = f.child.derive();
  reply(f);
  await pending;
  expect(f.child.hasResults()).toBe(true);
  expect(f.page.require("bip85-wallet-results").hidden).toBe(false);
  expect(f.page.require("derive-bip85-wallet").disabled).toBe(false);
  expect(f.seeds.every((seed) => seed.every((byte) => byte === 0))).toBe(true);
  f.child.clear();
});

it("revokes rendered child secrets when Clear removes their native nodes", async () => {
  const f = fixture();
  // ID fixtures create siblings by default; match the real result-root ancestry for disclosure.
  f.page
    .require("bip85-wallet-results")
    .append(
      f.page.require("bip85-wallet-summary"),
      f.page.require("bip85-wallet-list"),
      f.page.require("bip85-wallet-notices"),
    );
  const pending = f.child.derive();
  const { result } = reply(f);
  result.rows[0]!.advanced.push(field("privateKey", "Private key", "synthetic private", true));
  await pending;
  f.page.require("bip85-wallet-advanced").click();
  f.page.require("bip85-wallet-toggle-secrets").click();
  f.child.setSecretsVisible(true);
  const nodes = f.page.require("bip85-wallet-results").querySelectorAll(".secret-value");
  expect(nodes.length).toBeGreaterThan(0);
  expect(nodes.every((node) => node.textContent === "synthetic private")).toBe(true);
  f.child.clear();
  expect(nodes.every((node) => node.textContent === "")).toBe(true);
  for (const node of nodes) updateSecretVisibility(node as unknown as HTMLElement, true);
  expect(nodes.every((node) => node.textContent === "")).toBe(true);
});

it("does not read a concealed child field before the clipboard owner admits the copy", async () => {
  const f = fixture();
  const pending = f.child.derive();
  const { result } = reply(f);
  await pending;
  let reads = 0;
  let value = "public synthetic private-field fixture";
  result.rows[0]!.advanced.push({
    key: "privateKey",
    label: "Private key",
    secret: true,
    get value() {
      reads += 1;
      return value;
    },
    set value(next: string) {
      value = next;
    },
  });
  const button = f.page.add(
    "synthetic-forged-copy",
    "button",
    f.page.require("bip85-wallet-results"),
  );
  Object.assign(button.dataset, { copyField: "privateKey", copyScope: "row", copyRow: "0" });
  try {
    button.click();
    expect(reads).toBe(0);
  } finally {
    f.child.clear();
  }
});

it("refuses an oversized child range before any seed or native worker is allocated", async () => {
  const f = fixture();
  f.controls.count.value = "201";
  await f.child.derive();
  expect(f.seeds).toHaveLength(0);
  expect(f.sourceReads()).toBe(0);
  expect(f.createUrl).not.toHaveBeenCalled();
  expect(f.page.require("bip85-wallet-error").textContent).toContain("limited to 200");
  f.child.clear();
});

it("refuses a closed cryptographic gate before reading the child source", async () => {
  const f = fixture(undefined, () => false);
  await f.child.derive();
  expect(f.sourceReads()).toBe(0);
  expect(f.createUrl).not.toHaveBeenCalled();
  expect(f.page.require("bip85-wallet-error").hidden).toBe(false);
  f.child.clear();
});

it("does not unlock a replacement child run when its cancelled predecessor settles", async () => {
  const f = fixture();
  const first = f.child.derive();
  FakeRecoveryWorker.latest.reply({ type: "ready" });
  const second = f.child.derive();
  await first;
  expect(f.page.require("derive-bip85-wallet").disabled).toBe(true);
  reply(f);
  await second;
  expect(f.child.hasResults()).toBe(true);
  expect(f.page.require("derive-bip85-wallet").disabled).toBe(false);
  f.child.clear();
});

it("discards a completed result if Clear revokes it during native worker retirement", async () => {
  const f = fixture();
  const pending = f.child.derive();
  const { worker, result } = reply(f);
  worker.terminate.mockImplementationOnce(() => f.child.clear());
  await pending;
  expect(f.child.hasResults()).toBe(false);
  expect(f.page.require("bip85-wallet-results").hidden).toBe(true);
  expect(result.rows).toHaveLength(0);
});

it.each(["raw", "core"])(
  "binds child account export through the shared %s policy",
  async (format) => {
    const f = fixture(format);
    const pending = f.child.derive();
    const { result } = reply(f, true);
    await pending;
    const publicButton = f.page.require("fixture-publicCopy");
    const privateButton = f.page.require("fixture-privateCopy");
    expect(publicButton.disabled).toBe(false);
    expect(privateButton.disabled).toBe(true);
    publicButton.click();
    const publicText = f.copyText.mock.calls[0]?.[1];
    expect(publicText).toBe(
      format === "raw"
        ? result.accountDescriptors?.publicText
        : 'importdescriptors \'[{"desc":"pkh(xpub/0/*)","timestamp":0,"active":true,"internal":false},{"desc":"pkh(xpub/1/*)","timestamp":0,"active":true,"internal":true}]\'',
    );
    expect(f.copyText.mock.calls[0]?.[2]).toBe(false);
    f.page.require("bip85-wallet-toggle-secrets").click();
    f.child.setSecretsVisible(true);
    expect(privateButton.disabled).toBe(false);
    privateButton.click();
    expect(f.copyText.mock.calls[1]?.[2]).toBe(true);
    f.child.clear();
    expect(publicButton.disabled).toBe(true);
    expect(privateButton.disabled).toBe(true);
  },
);

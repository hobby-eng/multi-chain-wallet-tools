// Actual controller, admission and derive client; only native Worker messages are passive.
import { afterEach, expect, it, vi } from "vitest";
import { PassiveQrPage } from "../../../test/support/qr-page.js";
import { createBip38EncryptionInstaller } from "../src/ui/bip38-encryption-feature.js";
import { DerivationWorkerClient } from "../src/workers/derive-client.js";
import { FakeRecoveryWorker } from "./fake-recovery-worker.js";
import { settlePromises } from "./fake-recovery-page.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { getCoinAdapter } from "@ckd/coins/registry.js";
import type { DerivationControls } from "../src/ui/inputs.js";
import type { DerivationResult } from "@ckd/core/types.js";
const PHRASE = `${"abandon ".repeat(11)}about`;

function mount() {
  const page = new PassiveQrPage();
  for (const id of [
    "bulk-bip38-panel",
    "bulk-bip38-fields",
    "bulk-bip38-status",
    "bulk-bip38-error",
  ])
    page.add(id);
  page.add("bulk-bip38-passphrase", "input").type = "password";
  page.add("toggle-bulk-bip38-passphrase", "button");
  page.add("enable-bulk-bip38", "input").checked = true;
  const doc = page.asDocument();
  const input = () => doc.createElement("input");
  const div = () => doc.createElement("div");
  const select = () => doc.createElement("select");
  const controls: DerivationControls = {
    coin: select(),
    protocolTabs: div(),
    legacyMobileField: div(),
    includeLegacyMobile: input(),
    network: select(),
    networkField: div(),
    accountField: div(),
    accountLabel: doc.createElement("label"),
    account: input(),
    branchField: div(),
    branchLabel: doc.createElement("label"),
    branchInput: input(),
    branchSelect: select(),
    changeField: div(),
    changeHelp: div(),
    includeChange: input(),
    coinJoinField: div(),
    includeCoinJoin: input(),
    coinJoinHelp: div(),
    startLabel: doc.createElement("label"),
    start: input(),
    countLabel: doc.createElement("label"),
    count: input(),
    preview: div(),
  };
  controls.network.value = "mainnet";
  controls.account.value = controls.start.value = controls.branchInput.value = "0";
  controls.count.value = "1";
  const result: DerivationResult = {
    id: "bitcoin-legacy",
    title: "Synthetic",
    networkLabel: "mainnet",
    pathTemplate: "m/44'/0'/0'/0/0",
    basicSummary: [],
    summary: [],
    notices: [],
    rows: [
      {
        index: 0,
        path: "m/44'/0'/0'/0/0",
        title: "Public vector",
        advanced: [],
        basic: [
          {
            key: "address",
            label: "Address",
            role: "paymentAddress",
            value: "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA",
            secret: false,
          },
        ],
      },
    ],
  };
  const createWorker = vi.fn(() => new DerivationWorkerClient());
  const seeds: Uint8Array[] = [];
  vi.stubGlobal("Worker", FakeRecoveryWorker);
  vi.stubGlobal("__DERIVATION_WORKER_SOURCE__", "Public passive worker fixture");
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:public-bip38-worker");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const owner = createBip38EncryptionInstaller(["bitcoin-legacy"])({
    document: doc,
    controls,
    adapter: () => getCoinAdapter("bitcoin-legacy"),
    result: () => result,
    branch: () => "receive",
    mnemonic: () => PHRASE,
    passphrase: () => "",
    mnemonicToSeed: (...args) => {
      const seed = mnemonicToSeed(...args);
      seeds.push(seed);
      return seed;
    },
    createWorker,
    render: () => undefined,
    cryptoReady: () => true,
  });
  page.require("bulk-bip38-passphrase").value = "public encryption password";
  return { page, owner, createWorker, seeds, result };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["blur", "hidden"] as const)(
  "conceals the locally revealed BIP38 password on %s",
  (event) => {
    const view = mount();
    view.page.require("toggle-bulk-bip38-passphrase").click();
    expect(view.page.require("bulk-bip38-passphrase").type).toBe("text");
    view.page.hideOrBlur(event);
    expect(view.page.require("bulk-bip38-passphrase").type).toBe("password");
  },
);

it("does not publish an already delivered encryption answer after cancellation", async () => {
  const view = mount();
  view.owner.start();
  FakeRecoveryWorker.latest.reply({ type: "ready" });
  const request: unknown = FakeRecoveryWorker.latest.postMessage.mock.calls.at(-1)?.[0];
  if (typeof request !== "object" || request === null || !("id" in request))
    throw new Error("No request reached the worker edge.");
  FakeRecoveryWorker.latest.reply({
    id: request.id,
    ok: true,
    type: "bip38-encrypt",
    result: { encryptedKey: "public synthetic ciphertext" },
  });
  view.owner.cancel("Cancelled public fixture");
  await settlePromises();
  expect(view.owner.visibleRows("receive")).toBe(0);
  expect(view.page.require("bulk-bip38-passphrase").disabled).toBe(false);
  expect(view.page.require("enable-bulk-bip38").disabled).toBe(false);
  expect(view.seeds.every((seed) => seed.every((byte) => byte === 0))).toBe(true);
});

it("preserves exact password units, owns ciphertext and wipes it when results are invalidated", async () => {
  const view = mount();
  const password = " \uFEFFpublic-password\uD800";
  view.page.require("bulk-bip38-passphrase").value = password;
  view.owner.start();
  FakeRecoveryWorker.latest.reply({ type: "ready" });
  const request: unknown = FakeRecoveryWorker.latest.postMessage.mock.calls.at(-1)?.[0];
  if (
    typeof request !== "object" ||
    request === null ||
    !("id" in request) ||
    !("passphrase" in request)
  )
    throw new Error("No encryption wire was posted.");
  expect(request.passphrase).toBe(password);
  FakeRecoveryWorker.latest.reply({
    id: request.id,
    ok: true,
    type: "bip38-encrypt",
    result: { encryptedKey: "public synthetic ciphertext", address: "public address" },
  });
  await settlePromises();
  expect(view.owner.visibleRows("receive")).toBe(1);
  expect(view.owner.encryptedKey("receive", 0)).toBe("public synthetic ciphertext");
  expect(view.owner.encryptedKeys("receive").get(0)).toBe("public synthetic ciphertext");
  expect(view.seeds).toHaveLength(1);
  expect(view.seeds[0]?.every((byte) => byte === 0)).toBe(true);
  view.owner.invalidate();
  expect(view.owner.encryptedKey("receive", 0)).toBeUndefined();
  expect(view.owner.encryptedKeys("receive").size).toBe(0);
});

it("unlocks controls and reports a worker construction refusal without retaining a seed", async () => {
  const view = mount();
  view.createWorker.mockImplementationOnce(() => {
    throw new Error("Public synthetic worker construction failure");
  });
  view.owner.start();
  await settlePromises();
  expect(view.createWorker).toHaveBeenCalledOnce();
  expect(view.page.require("bulk-bip38-error").textContent).toBe("BIP38 encryption failed.");
  expect(view.page.require("bulk-bip38-error").textContent).not.toContain(
    "worker construction failure",
  );
  expect(view.page.require("bulk-bip38-passphrase").disabled).toBe(false);
  expect(view.page.require("enable-bulk-bip38").disabled).toBe(false);
  expect(view.seeds).toHaveLength(0);
});

it("retires an active batch and clears its password on pagehide", async () => {
  const view = mount();
  view.owner.start();
  FakeRecoveryWorker.latest.reply({ type: "ready" });
  view.page.window.dispatchEvent(new Event("pagehide"));
  await settlePromises();
  expect(FakeRecoveryWorker.latest.terminate).toHaveBeenCalledOnce();
  expect(view.page.require("bulk-bip38-passphrase").value).toBe("");
  expect(view.owner.visibleRows("receive")).toBeUndefined();
  expect(view.seeds).toHaveLength(1);
  expect(view.seeds[0]?.every((byte) => byte === 0)).toBe(true);
});

it("clears retained ciphertext and password despite a native teardown exception", async () => {
  const view = mount();
  const row = view.result.rows[0];
  if (row === undefined) throw new Error("Missing public result row.");
  view.result.rows.push({ ...row, index: 1 });
  view.owner.start();
  FakeRecoveryWorker.latest.reply({ type: "ready" });
  const request: unknown = FakeRecoveryWorker.latest.postMessage.mock.calls.at(-1)?.[0];
  if (typeof request !== "object" || request === null || !("id" in request))
    throw new Error("Missing posted request.");
  FakeRecoveryWorker.latest.reply({
    id: request.id,
    ok: true,
    type: "bip38-encrypt",
    result: { encryptedKey: "public retained ciphertext", address: "public address" },
  });
  await settlePromises();
  expect(view.owner.encryptedKey("receive", 0)).toBe("public retained ciphertext");
  FakeRecoveryWorker.latest.terminate.mockImplementationOnce(() => {
    throw new Error("Synthetic native cleanup fault");
  });
  try {
    view.owner.wipe();
  } catch {
    /* Native faults may propagate; owned cleanup must still finish. */
  }
  await settlePromises();
  expect(view.owner.encryptedKeys("receive").size).toBe(0);
  expect(view.page.require("bulk-bip38-passphrase").value).toBe("");
  expect(view.seeds[0]?.every((byte) => byte === 0)).toBe(true);
});

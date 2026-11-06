// Real page feature and derivation client; public BIP39 seed, passive native Worker messages.
import { afterEach, expect, it, vi } from "vitest";
import { installSilentPaymentFeature } from "../src/ui/silent-payment-feature.js";
import { DerivationWorkerClient } from "../src/workers/derive-client.js";
import { FakeRecoveryWorker } from "./fake-recovery-worker.js";
import { PassiveQrPage } from "../../../test/support/qr-page.js";
import { settlePromises } from "./fake-recovery-page.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
const PHRASE = `${"abandon ".repeat(11)}about`;
const workers: FakeRecoveryWorker[] = [];

function mount() {
  const page = new PassiveQrPage();
  for (const name of ["network", "account", "labels"]) page.add(`silent-payment-${name}`, "input");
  for (const name of [
    "result",
    "error",
    "labeled-list",
    "address",
    "change-address",
    "scan-path",
    "scan-key",
    "spend-path",
    "spend-key",
  ])
    page.add(`silent-payment-${name}`);
  page.add("derive-silent-payment", "button");
  page.add("clear-all", "button");
  page.require("silent-payment-network").value = "mainnet";
  page.require("silent-payment-account").value = "0";
  vi.stubGlobal("__DERIVATION_WORKER_SOURCE__", "Public passive derivation source");
  vi.stubGlobal(
    "Worker",
    class extends FakeRecoveryWorker {
      constructor() {
        super();
        workers.push(this);
      }
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:public-silent-payments");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const seeds: Uint8Array[] = [];
  const seed = vi.fn((phrase: string, passphrase?: string) => {
    const bytes = mnemonicToSeed(phrase, passphrase);
    seeds.push(bytes);
    return bytes;
  });
  const feature = installSilentPaymentFeature({
    document: page.asDocument(),
    mnemonic: () => PHRASE,
    passphrase: () => "TREZOR",
    mnemonicToSeed: seed,
    createWorker: () => new DerivationWorkerClient(),
    isActive: () => false,
    mnemonicMayBeComplete: () => true,
    cryptoReady: () => true,
  });
  return { page, feature, seed, seeds };
}

function reply(worker: FakeRecoveryWorker): void {
  worker.reply({ type: "ready" });
  const request: unknown = worker.postMessage.mock.calls.at(-1)?.[0];
  if (typeof request !== "object" || request === null || !("id" in request)) return;
  worker.reply({
    id: request.id,
    ok: true,
    type: "silent-payment",
    result: {
      account: 0,
      scanPath: "m/352'/0'/0'/1'/0",
      spendPath: "m/352'/0'/0'/0'/0",
      scanPublicKey: "public scan fixture",
      spendPublicKey: "public spend fixture",
      address: "public address fixture",
      changeAddress: "public change fixture",
      labeledAddresses: [],
    },
  });
}

afterEach(async () => {
  for (const worker of workers) reply(worker);
  await settlePromises();
  workers.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["clear", "pagehide"] as const)("ends the active worker and seed on %s", async (event) => {
  const view = mount();
  view.feature.derive();
  const worker = FakeRecoveryWorker.latest;
  worker.reply({ type: "ready" });
  if (event === "clear") view.feature.clear();
  else view.page.window.dispatchEvent(new Event("pagehide"));
  await settlePromises();
  const stopped = worker.terminate.mock.calls.length;
  reply(worker);
  await settlePromises();
  expect(stopped).toBe(1);
  expect(view.seeds[0]?.every((byte) => byte === 0)).toBe(true);
  expect(view.page.require("silent-payment-result").hidden).toBe(true);
});

it.each([
  { field: "account", value: "2147483648" },
  { field: "network", value: "synthetic-unknown-network" },
  { field: "labels", value: Array<string>(201).fill("1").join(",") },
])("refuses invalid $field before deriving a seed", async ({ field, value }) => {
  const view = mount();
  view.page.require(`silent-payment-${field}`).value = value;
  view.feature.derive();
  await settlePromises();
  const started = view.seed.mock.calls.length;
  for (const worker of workers) reply(worker);
  await settlePromises();
  expect(started).toBe(0);
  expect(view.page.require("silent-payment-error").hidden).toBe(false);
});

it("never repeats an invalid label token in its refusal", () => {
  const view = mount();
  view.page.require("silent-payment-labels").value = PHRASE;
  view.feature.derive();
  expect(view.page.require("silent-payment-error").textContent.includes(PHRASE)).toBe(false);
});

it("keeps healthy publication and revokes an already delivered response on Clear", async () => {
  const view = mount();
  view.feature.derive();
  reply(FakeRecoveryWorker.latest);
  await settlePromises();
  expect(view.page.require("silent-payment-address").textContent).toBe("public address fixture");
  expect(view.seed).toHaveBeenCalledExactlyOnceWith(PHRASE, "TREZOR");
  expect(view.seeds[0]?.every((byte) => byte === 0)).toBe(true);
  view.feature.derive();
  reply(FakeRecoveryWorker.latest);
  view.feature.clear();
  await settlePromises();
  expect(view.page.require("silent-payment-address").textContent).toBe("");
});

it.each(["construction", "teardown"] as const)(
  "wipes the seed and unlocks after native %s fails",
  async (stage) => {
    const view = mount();
    if (stage === "construction")
      vi.stubGlobal(
        "Worker",
        class {
          constructor() {
            throw new Error("Synthetic native construction fault");
          }
        },
      );
    view.feature.derive();
    if (stage === "teardown") {
      const worker = FakeRecoveryWorker.latest;
      worker.reply({ type: "ready" });
      worker.terminate.mockImplementationOnce(() => {
        throw new Error("Synthetic native teardown fault");
      });
      reply(worker);
    }
    await settlePromises();
    expect(view.seeds[0]?.every((byte) => byte === 0)).toBe(true);
    expect(view.page.require("derive-silent-payment").disabled).toBe(false);
    expect(view.page.require("silent-payment-error").hidden).toBe(false);
    expect(view.page.require("silent-payment-error").textContent.includes("Synthetic native")).toBe(
      false,
    );
  },
);

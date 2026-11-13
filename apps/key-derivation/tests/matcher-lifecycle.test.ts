// Actual controller/client/registry and public BIP39 seed; only native Worker delivery is passive.
import { afterEach, expect, it, vi } from "vitest";
import { PassiveQrPage } from "../../../test/support/qr-page.js";
import { edit, settlePromises } from "./fake-recovery-page.js";
import { recoveryFeature } from "../src/ui/recovery-wallet-matcher.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import type { RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";
import type { WorkerRequest } from "../src/workers/protocol.js";
import { getCoinAdapter } from "@ckd/coins/registry.js";
import { createCoinRegistry } from "@ckd/coins/registry-base.js";
import { detectMultiChainMatcherTargets } from "@ckd/recovery/matcher-targets-multichain.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import type { DerivationResult } from "@ckd/core/types.js";

const trace = { download: vi.fn() };
const PHRASE = `${"abandon ".repeat(11)}about`;
const OTHER = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const ADDRESS = "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA";
const PATH = "m/44'/0'/0'/0/0";
const PRIVATE = "public synthetic private result";

class PassiveWorker extends EventTarget {
  static readonly instances: PassiveWorker[] = [];
  readonly requests: WorkerRequest[] = [];
  stopped = false;
  constructor() {
    super();
    PassiveWorker.instances.push(this);
    queueMicrotask(() =>
      this.dispatchEvent(new MessageEvent("message", { data: { type: "ready" } })),
    );
  }
  postMessage(request: WorkerRequest): void {
    this.requests.push(request);
  }
  terminate(): void {
    this.stopped = true;
  }
  reply(result: unknown = []): void {
    const request = this.requests.at(-1);
    if (request === undefined)
      throw new Error("No actual client request reached the passive worker.");
    this.dispatchEvent(
      new MessageEvent("message", {
        data: { id: request.id, ok: true, type: request.type, result },
      }),
    );
  }
}

/** One turn of the event loop, as the Matcher takes before making each phrase's seeds. */
const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function mount(seedOf: RecoveryFeatureContext["mnemonicToSeed"] = mnemonicToSeed) {
  const page = new PassiveQrPage();
  const panel = page.add("wallet-matcher-panel", "section");
  panel.className = "backup-operation";
  for (const id of [
    "toggle-matcher-secrets",
    "matcher-coin",
    "matcher-force-all",
    "matcher-search-change",
    "matcher-seeds",
    "matcher-passphrases",
    "matcher-addresses",
    "matcher-seed-lines",
    "matcher-passphrase-lines",
    "matcher-address-lines",
    "run-wallet-matcher",
    "cancel-wallet-matcher",
    "wallet-matcher-status",
    "wallet-matcher-results",
    "matcher-network",
    "matcher-account-start",
    "matcher-account-end",
    "matcher-index-start",
    "matcher-index-count",
  ])
    page.add(
      id,
      id.includes("seeds") || id.includes("addresses") || id.includes("passphrases")
        ? "textarea"
        : "input",
      panel,
    );
  page.add("clear-all", "button");
  page.require("matcher-coin").value = "bitcoin";
  page.require("matcher-network").value = "mainnet";
  page.require("matcher-seeds").value = PHRASE;
  page.require("matcher-addresses").value = ADDRESS;
  for (const id of ["matcher-account-start", "matcher-account-end", "matcher-index-start"])
    page.require(id).value = "0";
  page.require("matcher-index-count").value = "1";
  vi.stubGlobal("Worker", PassiveWorker);
  vi.stubGlobal("__DERIVATION_WORKER_SOURCE__", "public passive worker fixture");
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  const context: RecoveryFeatureContext = {
    registry: createCoinRegistry([getCoinAdapter("bitcoin-legacy")]),
    detectTargets: detectMultiChainMatcherTargets,
    mnemonicToSeed: seedOf,
    linkedValue: () => null,
    linkedSourceRevealed: () => false,
    writeClipboard: vi.fn(async () => undefined),
    downloadText: trace.download,
    readMnemonic: () => PHRASE,
    useMnemonicInDeriver: () => undefined,
    jobs,
  };
  recoveryFeature.install(context);
  const result = page.require("wallet-matcher-results");
  const action = (text: string) => {
    const button = result.querySelectorAll("button").find((button) => button.textContent === text);
    if (button === undefined) throw new Error(`Missing actual Matcher action ${text}.`);
    return button;
  };
  return {
    page,
    result,
    jobs,
    context,
    action,
    async start() {
      page.require("run-wallet-matcher").click();
      // The phrase's seeds are made in a turn of the event loop of their own.
      await nextTurn();
      await settlePromises();
      const worker = PassiveWorker.instances.at(-1);
      if (worker?.requests[0]?.type !== "search-many")
        throw new Error("Matcher did not reach search-many.");
      return worker;
    },
    async match() {
      const worker = await this.start();
      worker.reply([{ id: "address-1", index: 0, path: PATH, address: ADDRESS }]);
      await settlePromises();
    },
    async reveal() {
      action("Show private keys").click();
      await settlePromises();
      const worker = PassiveWorker.instances.at(-1);
      if (worker?.requests[0]?.type !== "derive")
        throw new Error("Matcher did not reach private derive.");
      return worker;
    },
  };
}

function privateResult(): DerivationResult {
  return {
    id: "bitcoin-legacy",
    title: "Public synthetic row",
    networkLabel: "mainnet",
    pathTemplate: PATH,
    basicSummary: [],
    summary: [],
    notices: [],
    rows: [
      {
        index: 0,
        path: PATH,
        title: "Public fixture",
        basic: [
          {
            key: "address",
            label: "Address",
            value: ADDRESS,
            secret: false,
            role: "paymentAddress",
          },
        ],
        advanced: [{ key: "wif", label: "WIF", value: PRIVATE, secret: true }],
      },
    ],
  };
}

afterEach(() => {
  for (const worker of PassiveWorker.instances) worker.terminate();
  PassiveWorker.instances.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each([
  ["matcher-seeds", OTHER],
  ["matcher-passphrases", "TREZOR"],
  ["matcher-network", "testnet"],
  ["matcher-addresses", "1BitcoinEaterAddressDontSendf59kuE"],
  ["matcher-account-start", "1"],
  ["matcher-account-end", "1"],
  ["matcher-index-start", "1"],
  ["matcher-index-count", "2"],
  ["matcher-coin", "dash"],
  ["matcher-force-all", "true"],
  ["matcher-search-change", "true"],
])("revokes a pending Matcher result when %s changes", async (id, value) => {
  const view = mount();
  const worker = await view.start();
  edit(view.page.require(id), value);
  worker.reply();
  await settlePromises();
  expect(view.result.textContent).toBe("");
  expect(view.result.children).toHaveLength(0);
  expect(worker.stopped).toBe(true);
});

it.each(["clear", "pagehide", "linked", "gate"])("revokes pending search on %s", async (reason) => {
  const view = mount();
  const worker = await view.start();
  if (reason === "clear") view.page.require("clear-all").click();
  if (reason === "pagehide") view.page.window.dispatchEvent(new Event("pagehide"));
  if (reason === "linked")
    view.page.dispatchEvent(new CustomEvent("recovery-source-change", { detail: "matcher" }));
  if (reason === "gate") {
    view.jobs.setReady(false);
    view.jobs.setReady(true);
  }
  worker.reply();
  await settlePromises();
  expect(view.result.textContent).toBe("");
  expect(worker.stopped).toBe(true);
});

it("shows the seeds' progress at once, and Cancel stops the search before any request", async () => {
  const view = mount();
  const status = view.page.require("wallet-matcher-status");
  view.page.require("run-wallet-matcher").click();
  expect(status.textContent).toBe("Preparing 0/1 seed phrases…");
  view.page.require("cancel-wallet-matcher").click();
  await nextTurn();
  await settlePromises();
  expect(status.textContent).toBe("Search cancelled.");
  // The run's worker starts with the run, so that it is ready when the seeds are; Cancel stops it.
  expect(PassiveWorker.instances.map(({ requests, stopped }) => [requests, stopped])).toEqual([
    [[], true],
  ]);
});

it("wipes the seeds made so far in the pagehide handler, before the next turn", async () => {
  // A page hidden into the back-forward cache fires no later timer: the wipe cannot wait for one.
  const seeds: Uint8Array[] = [];
  const view = mount((phrase, passphrase) => {
    const seed = mnemonicToSeed(phrase, passphrase);
    seeds.push(seed);
    return seed;
  });
  view.page.require("matcher-seeds").value = `${PHRASE}\n${OTHER}`;
  view.page.require("run-wallet-matcher").click();
  await nextTurn();
  expect(view.page.require("wallet-matcher-status").textContent).toBe(
    "Preparing 1/2 seed phrases…",
  );
  expect(seeds.map((seed) => seed.some((byte) => byte !== 0))).toEqual([true]);
  view.page.window.dispatchEvent(new Event("pagehide"));
  expect(seeds.map((seed) => seed.every((byte) => byte === 0))).toEqual([true]);
  // The loop ends at its turn without making the second phrase's seed or publishing anything.
  await nextTurn();
  await settlePromises();
  expect(seeds).toHaveLength(1);
  expect(view.page.require("wallet-matcher-status").textContent).toBe("");
  expect(PassiveWorker.instances.map(({ requests, stopped }) => [requests, stopped])).toEqual([
    [[], true],
  ]);
});

it("still publishes a current public no-match result", async () => {
  const view = mount();
  const worker = await view.start();
  worker.reply();
  await settlePromises();
  expect(view.result.textContent).toContain("No supplied address was found");
  expect(worker.stopped).toBe(true);
});

it("drops and retires late private rows after an input edit", async () => {
  const view = mount();
  await view.match();
  const worker = await view.reveal();
  const derived = privateResult();
  const field = derived.rows[0]!.advanced[0]!;
  // Resolve native delivery, then revoke before the await continuation consumes its rows.
  worker.reply(derived);
  edit(view.page.require("matcher-seeds"), OTHER);
  await settlePromises();
  expect(view.result.querySelectorAll("code")).toHaveLength(0);
  expect(view.result.children).toHaveLength(0);
  expect(worker.stopped).toBe(true);
  expect(field.value).toBe("");
});

it.each(["blur", "hidden"] as const)(
  "conceals Matcher private output and refuses forged export on %s",
  async (reason) => {
    const view = mount();
    await view.match();
    const worker = await view.reveal();
    const derived = privateResult();
    const field = derived.rows[0]!.advanced[0]!;
    worker.reply(derived);
    await settlePromises();
    expect(view.result.classList.contains("revealed")).toBe(true);
    const copy = view.action("Copy private matches");
    const save = view.action("Save private matches");
    view.page.hideOrBlur(reason);
    expect(view.result.classList.contains("revealed")).toBe(false);
    copy.dispatchEvent(new Event("click"));
    save.dispatchEvent(new Event("click"));
    expect(view.context.writeClipboard).not.toHaveBeenCalled();
    expect(trace.download).not.toHaveBeenCalled();
    expect(field.value).toBe("");
  },
);

it.each(["edit", "clear", "gate"])(
  "revokes already published private callbacks on %s",
  async (reason) => {
    const view = mount();
    await view.match();
    const worker = await view.reveal();
    worker.reply(privateResult());
    await settlePromises();
    const copy = view.action("Copy private matches");
    const save = view.action("Save private matches");
    if (reason === "edit") edit(view.page.require("matcher-passphrases"), "TREZOR");
    if (reason === "clear") view.page.require("clear-all").click();
    if (reason === "gate") {
      view.jobs.setReady(false);
      view.jobs.setReady(true);
    }
    copy.dispatchEvent(new Event("click"));
    save.dispatchEvent(new Event("click"));
    expect(view.result.children).toHaveLength(0);
    expect(view.context.writeClipboard).not.toHaveBeenCalled();
    expect(trace.download).not.toHaveBeenCalled();
  },
);

it("exports current revealed values and can reveal the byte-owned values again after concealment", async () => {
  const view = mount();
  await view.match();
  const worker = await view.reveal();
  worker.reply(privateResult());
  await settlePromises();
  const copy = view.action("Copy private matches");
  const save = view.action("Save private matches");
  copy.click();
  save.click();
  expect(view.context.writeClipboard).toHaveBeenCalledWith(expect.stringContaining(PRIVATE));
  expect(trace.download).toHaveBeenCalledWith(
    expect.stringContaining(PRIVATE),
    "wallet-matcher-PRIVATE-results.tsv",
    "text/tab-separated-values",
  );
  view.page.hideOrBlur("blur");
  expect(view.result.querySelectorAll("code")).toHaveLength(0);
  view.action("Show private keys").click();
  expect(view.result.querySelector("code")?.textContent).toBe(PRIVATE);
  expect(PassiveWorker.instances).toHaveLength(2);
  copy.click();
  expect(view.context.writeClipboard).toHaveBeenCalledTimes(2);
});

it("does not publish private values when concealment arrives before their await continuation", async () => {
  const view = mount();
  await view.match();
  const worker = await view.reveal();
  const derived = privateResult();
  const field = derived.rows[0]!.advanced[0]!;
  worker.reply(derived);
  view.page.hideOrBlur("blur");
  await settlePromises();
  expect(view.result.querySelectorAll("code")).toHaveLength(0);
  expect(view.result.classList.contains("revealed")).toBe(false);
  expect(field.value).toBe("");
  expect(view.action("Show private keys").disabled).toBe(false);
});

it("an older cancelled job's finalizer never terminates the newer worker", async () => {
  const view = mount();
  const first = await view.start();
  view.page.require("cancel-wallet-matcher").click();
  const second = await view.start();
  expect(first.stopped).toBe(true);
  expect(second.stopped).toBe(false);
  second.reply();
  await settlePromises();
  expect(view.result.textContent).toContain("No supplied address was found");
});

it("refuses a forged search click while readiness is closed", () => {
  const view = mount();
  view.jobs.setReady(false);
  view.page.require("run-wallet-matcher").dispatchEvent(new Event("click"));
  expect(PassiveWorker.instances).toEqual([]);
  expect(view.result.children).toHaveLength(0);
});

it("refuses an oversized pasted list unchanged and retires the previous Matcher result", async () => {
  const view = mount();
  await view.match();
  expect(view.result.children.length).toBeGreaterThan(0);
  const seeds = view.page.require("matcher-seeds");
  const pasted = "public-oversize-marker" + "x".repeat(65_536);
  seeds.value = pasted;
  seeds.dispatchEvent(new Event("blur"));
  expect(seeds.value).toBe(pasted);
  expect(view.result.children).toHaveLength(0);
  expect(view.page.require("wallet-matcher-status").textContent).toContain("65536");
  expect(view.page.require("wallet-matcher-status").textContent).not.toContain(
    "public-oversize-marker",
  );
  view.page.require("run-wallet-matcher").click();
  await settlePromises();
  expect(PassiveWorker.instances).toHaveLength(1);
  expect(view.page.require("wallet-matcher-status").textContent).toContain("65536");
  expect(view.page.require("run-wallet-matcher").disabled).toBe(false);
});

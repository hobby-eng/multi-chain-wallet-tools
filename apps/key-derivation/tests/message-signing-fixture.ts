// The actual message-signing dialog on the Deriver's native ID-document boundary, with the actual
// worker client over a recording Worker double: the browser's Worker is the only fake.
import { vi } from "vitest";
import { DeriverViewFixture } from "@ckd/test-support/deriver-view.js";
import { getCoinAdapter } from "@ckd/coins/registry.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { DerivationWorkerClient } from "../src/workers/derive-client.js";
import type { WorkerMessage, WorkerRequest } from "../src/workers/protocol.js";
import { createMessageSigningInstaller } from "../src/ui/message-signing-feature.js";
import { combineMessageSigningPolicies } from "../src/ui/message-signing-policy.js";
import { BITCOIN_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-bitcoin.js";
import { DASH_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-dash.js";

/** The native Worker edge: it records each posted request and replays chosen responses. */
export class WorkerBoundary extends EventTarget {
  static readonly instances: WorkerBoundary[] = [];
  readonly requests: WorkerRequest[] = [];
  readonly terminate = vi.fn();

  constructor() {
    super();
    WorkerBoundary.instances.push(this);
  }
  postMessage(request: WorkerRequest, transfer: Transferable[] = []): void {
    this.requests.push(structuredClone(request, { transfer }));
  }
  emit(response: WorkerMessage): void {
    this.dispatchEvent(new MessageEvent("message", { data: response }));
  }
}

/** Lets queued worker responses and promise reactions run. */
export const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const features: { close(): void }[] = [];

/** Opens the dialog for row 0 of a `id` result, its `address` field, with a public message. */
export function signingFixture(id = "bitcoin-taproot", ready = () => true) {
  const native = new DeriverViewFixture();
  vi.stubGlobal("Worker", WorkerBoundary);
  vi.stubGlobal("__DERIVATION_WORKER_SOURCE__", "/* public native worker boundary fixture */");
  WorkerBoundary.instances.length = 0;
  const dialog = native.page.require("message-signer-dialog");
  let open = false;
  Object.defineProperty(dialog, "open", { get: () => open });
  Object.assign(dialog, {
    showModal: () => {
      open = true;
    },
    close: () => {
      open = false;
    },
  });
  const controls = native.view.controls;
  controls.network.value = "mainnet";
  controls.account.value =
    controls.branchInput.value =
    controls.branchSelect.value =
    controls.start.value =
      "0";
  controls.count.value = "1";
  native.view.mnemonic.value =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const seeds: Uint8Array[] = [];
  const source = () => ({
    adapter: getCoinAdapter(id),
    controls,
    mnemonic: native.view.mnemonic.value,
    passphrase: "",
  });
  const feature = createMessageSigningInstaller(
    combineMessageSigningPolicies(BITCOIN_MESSAGE_SIGNING_POLICY, DASH_MESSAGE_SIGNING_POLICY),
  )({
    document: native.page.asDocument(),
    mainSource: source,
    bip85Source: source,
    mnemonicToSeed: (...args) => {
      const seed = mnemonicToSeed(...args);
      seeds.push(seed);
      return seed;
    },
    createWorker: () => new DerivationWorkerClient(),
    copy: vi.fn(),
    cryptoReady: ready,
  });
  const result: DerivationResult = {
    id,
    title: "Public signing fixture",
    networkLabel: "Mainnet",
    pathTemplate: "m",
    basicSummary: [],
    summary: [],
    notices: [],
    rows: [{ index: 0, title: "Public row fixture", path: "m", basic: [], advanced: [] }],
  };
  feature.open(result, "receive", "main", 0, "public fixture address", "address");
  const message = native.page.require("message-signer-message");
  const output = native.page.require("message-signature-output");
  const sign = native.page.require("sign-message-button");
  message.value = "Public message fixture";
  const value = { native, feature, message, output, sign, seeds };
  features.push(feature);
  return value;
}

/** Closes every dialog and releases every worker double and its seed copies. */
export function releaseSigningFixtures(): void {
  for (const feature of features.splice(0)) feature.close();
  for (const worker of WorkerBoundary.instances) {
    worker.terminate();
    for (const request of worker.requests) if ("input" in request) request.input.seed.fill(0);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}

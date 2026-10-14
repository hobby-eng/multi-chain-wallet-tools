// AUD-023 remediation re-run of AUD-022-SEC001: the real installBip85Feature with a deferred
// synthetic worker; copied from AUD-022-harnesses/deriver-bip85-clear.mjs and extended with the
// orderings AUD-022's "required verification" names (parent change, reverse reply order, Clear
// while the opened child wallet derives). No crypto, Worker or WASM runs.
import assert from "node:assert/strict";
import {
  PUBLIC_PHRASE,
  browserStub,
  deferred,
  flush,
  runProbe,
  sourceLoader,
} from "./remediation-vm-support.mjs";

/** A second public phrase (BIP39 test vector "legal winner …") for the newer request. */
const OTHER_PHRASE = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const REPLY = { kind: "bip39", value: "00".repeat(16), path: "m/83696968'/39'/0'/12'/0'" };
const OTHER_REPLY = { kind: "bip39", value: "7f".repeat(16), path: "m/83696968'/39'/0'/12'/1'" };

async function setup() {
  const browser = browserStub();
  const workers = [];
  const seeds = [];
  const childDerive = { pending: null, calls: 0 };
  const child = {
    workspace: { hidden: true },
    cleared: 0,
    clear() {
      this.cleared += 1;
    },
    resetFeatures() {},
    cancelScheduledRefresh() {},
    setSecretsVisible() {},
    initialize() {},
    hasResults: () => false,
    scheduleRefresh() {},
    derive() {
      childDerive.calls += 1;
      childDerive.pending = deferred();
      return childDerive.pending.promise;
    },
    adapter: () => null,
    controls: () => null,
  };
  for (const id of [
    "bip85-application",
    "derive-bip85",
    "bip85-index",
    "bip85-words",
    "bip85-bytes",
    "bip85-output",
    "bip85-path",
    "bip85-result",
    "bip85-error",
    "bip85-recovery-source-menu",
    "bip85-child-passphrase",
    "open-bip85-wallet",
  ])
    browser.field(id);
  browser.field("bip85-application").value = "bip39";
  browser.field("bip85-index").value = "0";
  browser.field("bip85-words").value = "12";
  browser.field("bip85-bytes").value = "16";
  class DerivationCancelledError extends Error {}
  const load = sourceLoader(browser, {
    "@ckd/core/bip39.js": {
      entropyToEnglishMnemonic: (entropy) => {
        assert.equal(entropy.length, 16);
        return entropy[0] === 0x7f ? OTHER_PHRASE : PUBLIC_PHRASE;
      },
    },
    "@ckd/core/crypto.js": {
      hexToBytes: (hex) => Uint8Array.from(Buffer.from(hex, "hex")),
      wipe: (bytes) => bytes.fill(0),
    },
    "./bip85-child-wallet-feature.js": { installBip85ChildWallet: () => child },
    "../workers/derive-client.js": { DerivationCancelledError },
  });
  const { installBip85Feature } = await load("bip85-feature.ts");
  const feature = installBip85Feature({
    document: browser.document,
    parentMnemonic: () => PUBLIC_PHRASE,
    parentPassphrase: () => "",
    mnemonicToSeed: () => {
      const seed = new Uint8Array(64).fill(7);
      seeds.push(seed);
      return seed;
    },
    secretsRevealed: () => false,
    isActive: () => false,
    mnemonicMayBeComplete: () => true,
    createWorker: () => {
      const reply = deferred();
      const worker = {
        reply,
        terminated: 0,
        deriveBip85: () => reply.promise,
        terminate(reason) {
          worker.terminated += 1;
          reply.reject(reason ?? new DerivationCancelledError("terminated"));
        },
      };
      workers.push(worker);
      return worker;
    },
  });
  const output = browser.field("bip85-output");
  const cleared = () => ({
    noChildOutput: output.value === "",
    resultHidden: browser.field("bip85-result").hidden,
    noRecoverySource: feature.sourceReference() === null,
    noObsoleteError: browser.field("bip85-error").hidden,
    seedsWiped: seeds.every((seed) => seed.every((byte) => byte === 0)),
  });
  return { browser, feature, workers, child, childDerive, output, cleared };
}

async function control() {
  const page = await setup();
  try {
    const pending = page.feature.derive();
    page.workers[0].reply.resolve(REPLY);
    await pending;
    const reference = page.feature.sourceReference();
    return {
      publishesChild: page.output.value === PUBLIC_PHRASE,
      showsResult: !page.browser.field("bip85-result").hidden,
      providesSource: reference?.read()?.mnemonic === PUBLIC_PHRASE,
      seedWiped: page.cleared().seedsWiped,
      workerReleased: page.workers[0].terminated > 0,
    };
  } finally {
    page.feature.reset();
    page.browser.dispose();
  }
}

async function lateAfter(action, outcome) {
  const page = await setup();
  try {
    const pending = page.feature.derive();
    if (action === "clear") page.feature.reset();
    else page.feature.invalidate();
    const stoppedAtOnce = page.workers[0].terminated > 0;
    // The worker client already rejected on terminate; a reply that still arrives is ignored too.
    if (outcome === "success") page.workers[0].reply.resolve(REPLY);
    else page.workers[0].reply.reject(new Error("Synthetic late worker failure"));
    await pending;
    await flush();
    return { ...page.cleared(), workerStoppedAtOnce: stoppedAtOnce };
  } finally {
    page.feature.reset();
    page.browser.dispose();
  }
}

/** The reply has settled but its continuation has not run yet when Clear or a parent edit comes. */
async function replyQueuedBefore(action) {
  const page = await setup();
  try {
    const pending = page.feature.derive();
    page.workers[0].reply.resolve(REPLY);
    if (action === "clear") page.feature.reset();
    else page.feature.invalidate();
    await pending;
    await flush();
    return page.cleared();
  } finally {
    page.feature.reset();
    page.browser.dispose();
  }
}

async function reverseOrder() {
  const page = await setup();
  try {
    const older = page.feature.derive();
    page.browser.field("bip85-index").value = "1";
    const newer = page.feature.derive();
    page.workers[1].reply.resolve(OTHER_REPLY);
    await newer;
    page.workers[0].reply.resolve(REPLY);
    await older;
    await flush();
    return {
      olderWorkerStopped: page.workers[0].terminated > 0,
      newerChildShown: page.output.value === OTHER_PHRASE,
      newerSourceKept: page.feature.sourceReference()?.read()?.mnemonic === OTHER_PHRASE,
      buttonEnabled: page.browser.field("derive-bip85").disabled === false,
    };
  } finally {
    page.feature.reset();
    page.browser.dispose();
  }
}

async function clearWhileChildWalletDerives() {
  const page = await setup();
  try {
    page.child.workspace.hidden = false;
    const pending = page.feature.derive();
    page.workers[0].reply.resolve(REPLY);
    for (let turn = 0; turn < 256 && page.childDerive.pending === null; turn += 1)
      await Promise.resolve();
    const reachedChildWallet = page.childDerive.pending !== null;
    page.feature.reset();
    page.childDerive.pending?.resolve();
    await pending;
    await flush();
    return { reachedChildWallet, ...page.cleared(), childWalletCleared: page.child.cleared > 0 };
  } finally {
    page.feature.reset();
    page.browser.dispose();
  }
}

await runProbe("BIP85 request ownership (AUD-022-SEC001 re-run)", [
  ["unchanged-input control", control],
  ["Clear before a successful reply (AUD-022 reproduction)", () => lateAfter("clear", "success")],
  ["Clear before a late error (AUD-022 reproduction)", () => lateAfter("clear", "error")],
  ["parent change before a successful reply", () => lateAfter("invalidate", "success")],
  ["parent change before a late error", () => lateAfter("invalidate", "error")],
  ["Clear after the reply settled, before its continuation", () => replyQueuedBefore("clear")],
  ["parent change after the reply settled", () => replyQueuedBefore("invalidate")],
  ["older reply after a newer request finished", reverseOrder],
  ["Clear while the opened child wallet derives", clearWhileChildWalletDerives],
]);

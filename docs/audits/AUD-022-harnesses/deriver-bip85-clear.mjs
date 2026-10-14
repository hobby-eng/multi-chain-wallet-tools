// Coordinator only: real BIP85 installer, deferred synthetic worker, no crypto/Worker execution.
import assert from "node:assert/strict";
import {
  PUBLIC_PHRASE,
  browserStub,
  deferred,
  runProbe,
  sourceLoader,
} from "./deriver-vm-support.mjs";

async function caseFor(clear, lateError = false) {
  const browser = browserStub();
  const reply = deferred();
  reply.promise.catch(() => {});
  let terminated = 0;
  const seed = new Uint8Array(64).fill(7);
  const child = {
    workspace: { hidden: true },
    clear() {},
    resetFeatures() {},
    cancelScheduledRefresh() {},
    setSecretsVisible() {},
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
  ])
    browser.field(id);
  browser.field("bip85-application").value = "bip39";
  browser.field("bip85-index").value = "0";
  browser.field("bip85-words").value = "12";
  browser.field("bip85-bytes").value = "16";
  const load = sourceLoader(browser, {
    "@ckd/core/bip39.js": {
      entropyToEnglishMnemonic: (entropy) => {
        assert.equal(entropy.length, 16);
        return PUBLIC_PHRASE;
      },
    },
    "@ckd/core/crypto.js": {
      hexToBytes: (hex) => Uint8Array.from(Buffer.from(hex, "hex")),
      wipe: (bytes) => bytes.fill(0),
    },
    "./bip85-child-wallet-feature.js": { installBip85ChildWallet: () => child },
  });
  let feature;
  let pending;
  try {
    const { installBip85Feature } = await load("bip85-feature.ts");
    feature = installBip85Feature({
      document: browser.document,
      parentMnemonic: () => PUBLIC_PHRASE,
      parentPassphrase: () => "",
      mnemonicToSeed: () => seed,
      secretsRevealed: () => false,
      isActive: () => false,
      mnemonicMayBeComplete: () => true,
      createWorker: () => ({
        deriveBip85: () => reply.promise,
        terminate() {
          terminated += 1;
          reply.reject(new Error("Synthetic worker terminated"));
        },
      }),
    });
    pending = feature.derive();
    if (clear) feature.reset();
    const terminatedOnClear = terminated > 0;
    if (lateError) reply.reject(new Error("Synthetic late worker failure"));
    else
      reply.resolve({
        kind: "bip39",
        value: "00000000000000000000000000000000",
        path: "m/83696968'/39'/0'/12'/0'",
      });
    await pending;
    if (!clear)
      return {
        controlPublishesChild: browser.field("bip85-output").value === PUBLIC_PHRASE,
        controlShowsResult: !browser.field("bip85-result").hidden,
        controlProvidesSource: feature.sourceReference()?.read()?.mnemonic === PUBLIC_PHRASE,
        seedWiped: seed.every((byte) => byte === 0),
        workerReleased: terminated > 0,
      };
    return {
      noChildAfterClear: browser.field("bip85-output").value === "",
      resultStaysHidden: browser.field("bip85-result").hidden,
      noRecoverySource: feature.sourceReference() === null,
      noObsoleteError: browser.field("bip85-error").hidden,
      workerStoppedOnClear: terminatedOnClear,
      seedWiped: seed.every((byte) => byte === 0),
    };
  } finally {
    if (!reply.settled) reply.reject(new Error("Probe cleanup"));
    await pending;
    feature?.reset();
    seed.fill(0);
    browser.dispose();
  }
}

await runProbe("BIP85 Clear ownership", [
  ["unchanged-input control", () => caseFor(false)],
  ["Clear before successful reply", () => caseFor(true)],
  ["Clear before intentional late error", () => caseFor(true, true)],
]);

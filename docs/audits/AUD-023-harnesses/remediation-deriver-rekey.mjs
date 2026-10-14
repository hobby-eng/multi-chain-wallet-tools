// AUD-023 remediation re-run of AUD-022-API004 (what a rekey is told about the wallet's BIP39
// passphrase) and AUD-022-API007 (the owner's phrase prompt on every way out). Loads the real
// MhfeRekeyTab, WalletReferenceField, WalletPassphraseQuestion, OwnerPhraseCheck, MhfeEngine,
// MhfeRun and RecoveryJobGate with a synthetic client; the owner-prompt cases are copied from
// AUD-022-harnesses/deriver-rekey-owner-lifetime.mjs. The keep line is rendered by the real
// keepLine of recovery-mhfe-status.ts. No WASM, Argon2 or real recovery runs, so what the vendored
// WebAssembly puts in `keep` is not exercised here (MHFE's own test covers it upstream).
import assert from "node:assert/strict";
import {
  PUBLIC_PHRASE,
  browserStub,
  deferred,
  drainUntil,
  flush,
  mhfeReplacements,
  realFile,
  runProbe,
  sourceLoader,
} from "./remediation-vm-support.mjs";

const SEALED = {
  container: "synthetic new container",
  containerFingerprint: "00000000",
  keep: [{ item: "containerWords", words: 12 }, { item: "password" }],
};

/**
 * The tab over a synthetic client. `confirmation` is "builtInCheck" or "walletOrOwner", as
 * readContainer().confirmationFor reports it; `onRekey` decides what client.rekey does.
 */
async function setup({ confirmation, onRekey }) {
  const browser = browserStub();
  const outer = deferred();
  const replacements = {
    ...mhfeReplacements(browser),
    "./recovery-mhfe-reference.js": realFile(
      "apps/key-derivation/src/ui/recovery-mhfe-reference.ts",
    ),
  };
  const { MhfeError } = replacements["@ckd/recovery-mhfe-wasm/core/client.js"];
  const load = sourceLoader(browser, replacements);
  browser.radios("mhfe-rekey-others", ["mhfe-rekey-others-yes", "mhfe-rekey-others-no"]);
  browser.radios("mhfe-rekey-reference", [
    "mhfe-rekey-ref-address",
    "mhfe-rekey-ref-fingerprint",
    "mhfe-rekey-ref-owner",
  ]);
  for (const kind of ["address", "fingerprint", "owner"])
    browser.field(`mhfe-rekey-ref-${kind}`).value = kind;
  browser.radios("mhfe-rekey-wallet-passphrase", [
    "mhfe-rekey-wallet-passphrase-no",
    "mhfe-rekey-wallet-passphrase-yes",
  ]);
  const { MhfeRekeyTab } = await load("recovery-mhfe-rekey.ts");
  const { MhfeEngine } = await load("recovery-mhfe-engine.ts");
  const { RecoveryJobGate } = await load("recovery-job-gate.ts");
  const gate = new RecoveryJobGate();
  const engine = new MhfeEngine();
  const calls = { rekey: [], cancelCore: 0 };
  engine.cancelCore = () => {
    calls.cancelCore += 1;
    outer.reject(new MhfeError("CANCELLED", "Synthetic cancellation"));
  };
  engine.client = async () => ({
    readContainer: async (container) => ({
      container,
      phraseLengths: [12],
      confirmationFor: { 12: confirmation },
    }),
    rekey: (request) => {
      calls.rekey.push(request);
      return onRekey(request, outer, MhfeError);
    },
  });
  new MhfeRekeyTab({ jobs: gate, writeClipboard() {} }, engine);
  browser.field("mhfe-rekey-others-yes").checked = true;
  browser.field("mhfe-rekey-words").value = "12";
  browser.field("mhfe-rekey-container").value = "synthetic old container";
  browser.field("mhfe-rekey-password").value = "synthetic old password";
  browser.field("mhfe-rekey-new-password").value = "synthetic new password";
  browser.field("mhfe-rekey-new-password-confirm").value = "synthetic new password";
  const choose = (id) => {
    browser.field(id).checked = true;
    browser.field(id).emit("change");
  };
  return {
    browser,
    gate,
    calls,
    outer,
    choose,
    press: () => browser.field("mhfe-rekey").click(),
    status: () => browser.field("mhfe-rekey-status").textContent,
    done: () => drainUntil(() => gate.runningJob === null, "rekey job end"),
  };
}

/** What the tab hands client.rekey for one confirmation mode and answer. */
async function terms({ confirmation, reference, answer, passphrase = "" }) {
  const tab = await setup({ confirmation, onRekey: async () => SEALED });
  try {
    if (reference !== undefined) tab.choose(`mhfe-rekey-ref-${reference}`);
    if (reference === "fingerprint") tab.browser.field("mhfe-rekey-fingerprint").value = "73c5da0a";
    if (answer !== undefined) tab.choose(`mhfe-rekey-wallet-passphrase-${answer}`);
    tab.browser.field("mhfe-rekey-passphrase").value = passphrase;
    tab.press();
    await tab.done();
    await flush();
    return { request: tab.calls.rekey[0], status: tab.status(), calls: tab.calls.rekey.length };
  } finally {
    tab.browser.dispose();
  }
}

const api004 = [
  [
    "built-in check, wallet has a passphrase",
    async () => {
      const { request } = await terms({ confirmation: "builtInCheck", answer: "yes" });
      return {
        answerPassed: request?.walletHasPassphrase === true,
        builtIn: request?.confirmation?.builtInCheck === true,
        noPassphraseSent: request?.passphrase === undefined,
      };
    },
  ],
  [
    "built-in check, wallet has none",
    async () => {
      const { request } = await terms({ confirmation: "builtInCheck", answer: "no" });
      return { answerPassed: request?.walletHasPassphrase === false };
    },
  ],
  [
    "owner check, wallet has a passphrase",
    async () => {
      const { request } = await terms({
        confirmation: "walletOrOwner",
        reference: "owner",
        answer: "yes",
      });
      return {
        answerPassed: request?.walletHasPassphrase === true,
        ownerCallback: typeof request?.confirmation?.owner === "function",
        noPassphraseSent: request?.passphrase === undefined,
      };
    },
  ],
  [
    "fingerprint with the wallet's passphrase (AUD-022 reproduction)",
    async () => {
      const { request } = await terms({
        confirmation: "walletOrOwner",
        reference: "fingerprint",
        answer: "yes",
        passphrase: "TREZOR",
      });
      return {
        answerPassed: request?.walletHasPassphrase === true,
        passphraseSent: request?.passphrase === "TREZOR",
        fingerprint: request?.confirmation?.fingerprint === "73c5da0a",
      };
    },
  ],
  [
    "fingerprint, answer yes but no passphrase typed: refused before the client",
    async () => {
      const result = await terms({
        confirmation: "walletOrOwner",
        reference: "fingerprint",
        answer: "yes",
      });
      return {
        noRekey: result.calls === 0,
        asksForPassphrase: result.status.includes("Type the wallet's BIP39 passphrase"),
      };
    },
  ],
  [
    "fingerprint, answer no, with stale text in the hidden passphrase field",
    async () => {
      const { request } = await terms({
        confirmation: "walletOrOwner",
        reference: "fingerprint",
        answer: "no",
        passphrase: "stale synthetic text",
      });
      return {
        answerPassed: request?.walletHasPassphrase === false,
        noPassphraseSent: request?.passphrase === undefined,
      };
    },
  ],
  [
    "question unanswered: refused before the client",
    async () => {
      const result = await terms({ confirmation: "builtInCheck" });
      return {
        noRekey: result.calls === 0,
        asksTheQuestion: result.status.includes(
          "Say whether the wallet of this phrase has a BIP39",
        ),
      };
    },
  ],
  [
    "the real keepLine names the passphrase when the package lists it",
    async () => {
      const browser = browserStub();
      try {
        const load = sourceLoader(browser, {
          "@ckd/recovery-mhfe-wasm/runtime/runtime.js": realFile(
            "packages/recovery-mhfe-wasm/generated/runtime/runtime.js",
          ),
        });
        const { keepLine } = await load("recovery-mhfe-status.ts");
        const withPassphrase = keepLine([
          { item: "containerWords", words: 24 },
          { item: "password" },
          { item: "passphrase" },
        ]);
        const without = keepLine([{ item: "containerWords", words: 24 }, { item: "password" }]);
        return {
          namesPassphrase: /BIP39 passphrase/u.test(withPassphrase),
          notNothingElse: !withPassphrase.startsWith("Nothing else"),
          withoutSaysEnough: without.startsWith("Nothing else needs to be kept"),
        };
      } finally {
        browser.dispose();
      }
    },
  ],
];

/** The owner's prompt, then `action`: answer-no, answer-yes, cancel, failure or pagehide. */
async function ownerPrompt(action) {
  let ownerPromise;
  let ownerSettled = false;
  const tab = await setup({
    confirmation: "walletOrOwner",
    onRekey: (request, outer, MhfeError) => {
      ownerPromise = request.confirmation.owner({
        phrase: PUBLIC_PHRASE,
        words: 12,
        fingerprintWithoutPassphrase: "73c5da0a",
      });
      ownerPromise.then((matches) => {
        ownerSettled = true;
        if (matches) outer.resolve(SEALED);
        else outer.reject(new MhfeError("NOT_CONFIRMED_BY_OWNER", "Synthetic owner refusal"));
      });
      return outer.promise;
    },
  });
  let phrase;
  try {
    tab.choose("mhfe-rekey-ref-owner");
    tab.choose("mhfe-rekey-wallet-passphrase-no");
    tab.press();
    await drainUntil(() => ownerPromise !== undefined, "owner callback");
    const owner = tab.browser.field("mhfe-rekey-owner");
    phrase = owner.querySelectorAll("textarea")[0];
    const buttons = owner.querySelectorAll("button");
    const no = buttons.find((button) => button.textContent === "No, stop");
    const yes = buttons.find((button) => button.textContent === "Yes, every word");
    assert.ok(phrase && no && yes, "owner prompt elements");
    assert.equal(phrase.value, PUBLIC_PHRASE);
    assert.equal(tab.browser.window.listenerCount("blur"), 1);
    phrase.classList.remove("concealed");
    if (action === "answer-no") no.click();
    else if (action === "answer-yes") yes.click();
    else if (action === "cancel") tab.browser.field("mhfe-rekey-stop").click();
    else if (action === "pagehide") tab.browser.window.emit("pagehide");
    else tab.outer.reject(new Error("Intentional failure while the owner answers"));
    await tab.done();
    await flush();
    const listenerLeft = tab.browser.window.listenerCount("blur") > 0;
    tab.browser.window.emit("blur");
    return {
      promptRemoved: owner.children.length === 0,
      phraseCleared: phrase.value === "",
      blurListenerRemoved: !listenerLeft,
      ownerQuestionSettled: ownerSettled,
      noDetachedMutation: !(listenerLeft && phrase.classList.contains("concealed")),
      gateReleased: tab.gate.runningJob === null,
      cancelReleased:
        tab.browser.field("mhfe-rekey-stop").hidden &&
        tab.browser.field("mhfe-rekey-stop").onclick === null,
      ...(action === "answer-yes"
        ? { sealedAfterYes: tab.status().startsWith("Password changed") }
        : {}),
      ...(action === "cancel" || action === "pagehide"
        ? { packageCancelled: tab.calls.cancelCore > 0 }
        : {}),
    };
  } finally {
    if (phrase !== undefined) phrase.value = "";
    tab.outer.reject(new Error("Probe cleanup"));
    await flush();
    tab.browser.dispose();
  }
}

await runProbe("MHFE rekey passphrase answer and owner prompt (AUD-022-API004/API007 re-run)", [
  ...api004.map(([label, run]) => [`API004: ${label}`, run]),
  ["API007: No answer control", () => ownerPrompt("answer-no")],
  ["API007: Yes answer control", () => ownerPrompt("answer-yes")],
  ["API007: Cancel while the owner answers (AUD-022)", () => ownerPrompt("cancel")],
  ["API007: failure while the owner answers (AUD-022)", () => ownerPrompt("failure")],
  ["API007: page hidden while the owner answers", () => ownerPrompt("pagehide")],
]);

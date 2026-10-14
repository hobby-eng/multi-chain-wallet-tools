// Coordinator only: actual Rekey class owner callback/cleanup; no recovery, WASM or Argon2.
import assert from "node:assert/strict";
import {
  PUBLIC_PHRASE,
  browserStub,
  deferred,
  drainUntil,
  flush,
  mhfeReplacements,
  runProbe,
  sourceLoader,
} from "./deriver-vm-support.mjs";

async function caseFor(action) {
  const browser = browserStub();
  const outer = deferred();
  outer.promise.catch(() => {});
  const replacements = mhfeReplacements(browser);
  const { MhfeError } = replacements["@ckd/recovery-mhfe-wasm/core/client.js"];
  const load = sourceLoader(browser, replacements);
  let phrase;
  let noButton;
  let ownerPromise;
  let ownerSettled = false;
  let gate;
  try {
    const { MhfeRekeyTab } = await load("recovery-mhfe-rekey.ts");
    const { MhfeEngine } = await load("recovery-mhfe-engine.ts");
    const { RecoveryJobGate } = await load("recovery-job-gate.ts");
    gate = new RecoveryJobGate();
    const engine = new MhfeEngine();
    // The real library rejects the active operation on Cancel, including an owner question.
    // Stub just that external client effect; the tab's #askOwner/#fail remain unchanged.
    engine.cancelCore = () => outer.reject(new MhfeError("CANCELLED", "Synthetic cancellation"));
    engine.client = async () => ({
      readContainer: async (container) => ({
        container,
        phraseLengths: [12],
        confirmationFor: { 12: "walletOrOwner" },
      }),
      rekey: (request) => {
        assert.equal(typeof request.confirmation.owner, "function");
        ownerPromise = request.confirmation.owner({
          phrase: PUBLIC_PHRASE,
          words: 12,
          fingerprintWithoutPassphrase: "73c5da0a",
        });
        ownerPromise.then(
          () => {
            ownerSettled = true;
            outer.reject(new MhfeError("CANCELLED", "Synthetic owner refusal"));
          },
          () => {
            ownerSettled = true;
            outer.reject(new MhfeError("CANCELLED", "Synthetic owner question aborted"));
          },
        );
        return outer.promise;
      },
    });
    browser.field("mhfe-rekey-others-yes").name = "mhfe-rekey-others";
    browser.field("mhfe-rekey-others-no").name = "mhfe-rekey-others";
    new MhfeRekeyTab({ jobs: gate, writeClipboard() {} }, engine);
    browser.field("mhfe-rekey-others-yes").checked = true;
    browser.field("mhfe-rekey-ref-kind").value = "owner";
    browser.field("mhfe-rekey-words").value = "12";
    browser.field("mhfe-rekey-container").value = "synthetic old container";
    browser.field("mhfe-rekey-password").value = "synthetic old password";
    browser.field("mhfe-rekey-new-password").value = "synthetic new password";
    browser.field("mhfe-rekey-new-password-confirm").value = "synthetic new password";
    browser.field("mhfe-rekey").click();
    await drainUntil(() => ownerPromise !== undefined, "production owner-confirmation callback");
    const owner = browser.field("mhfe-rekey-owner");
    phrase = owner.querySelectorAll("textarea")[0];
    noButton = owner.querySelectorAll("button").find((button) => button.textContent === "No, stop");
    assert.ok(phrase && noButton, "Production owner prompt elements must exist");
    assert.equal(phrase.value, PUBLIC_PHRASE);
    assert.equal(browser.window.listenerCount("blur"), 1);
    // A live retained handler must still reach the captured textarea after removal from DOM.
    phrase.classList.remove("concealed");
    if (action === "answer-no") noButton.click();
    else if (action === "cancel") browser.field("mhfe-rekey-stop").click();
    else outer.reject(new MhfeError("WORKER_FAILED", "Intentional failure while owner waits"));
    await drainUntil(() => gate.runningJob === null, "outer Rekey operation cleanup");
    await flush();
    const listenerRetained = browser.window.listenerCount("blur") > 0;
    browser.window.emit("blur");
    const retainedHandlerStillTouchesPhrase =
      listenerRetained && phrase.classList.contains("concealed");
    return {
      promptRemoved: owner.children.length === 0,
      phraseReferenceCleared: phrase.value === "",
      blurListenerRemoved: !listenerRetained,
      ownerQuestionSettled: ownerSettled,
      noDetachedPhraseMutation: !retainedHandlerStillTouchesPhrase,
      gateReleased: gate.runningJob === null,
      cancelControlReleased:
        browser.field("mhfe-rekey-stop").hidden &&
        browser.field("mhfe-rekey-stop").onclick === null,
    };
  } finally {
    // Even an expected invariant failure must release the probe's public phrase and listener.
    noButton?.click();
    outer.reject(new MhfeError("CANCELLED", "Probe cleanup"));
    await flush();
    if (phrase !== undefined) phrase.value = "";
    browser.dispose();
  }
}

await runProbe("Rekey owner prompt lifetime", [
  ["No answer cleanup control", () => caseFor("answer-no")],
  ["Cancel while owner answer is pending", () => caseFor("cancel")],
  ["intentional failure while owner answer is pending", () => caseFor("failure")],
]);

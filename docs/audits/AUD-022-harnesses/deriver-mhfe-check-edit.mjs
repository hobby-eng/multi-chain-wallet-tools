// Coordinator only: actual Check tab, engine wrapper and job gate; synthetic client result.
import assert from "node:assert/strict";
import {
  browserStub,
  deferred,
  drainUntil,
  flush,
  mhfeReplacements,
  runProbe,
  sourceLoader,
} from "./deriver-vm-support.mjs";

async function caseFor(editTiming) {
  const browser = browserStub();
  const reply = deferred();
  let request;
  let engine;
  const load = sourceLoader(browser, mhfeReplacements(browser));
  try {
    const { MhfeCheckTab } = await load("recovery-mhfe-check.ts");
    const { MhfeEngine } = await load("recovery-mhfe-engine.ts");
    const { RecoveryJobGate } = await load("recovery-job-gate.ts");
    const gate = new RecoveryJobGate();
    engine = new MhfeEngine();
    engine.client = async () => ({
      readContainer: async (container) => ({
        container,
        builtInCheckLengths: [],
        offersWalletCheck: false,
      }),
      check: (input) => {
        request = input;
        return reply.promise;
      },
    });
    new MhfeCheckTab({ jobs: gate, writeClipboard() {} }, engine);
    browser.field("mhfe-check-words").value = "12";
    browser.field("mhfe-check-container").value = "synthetic container A";
    browser.field("mhfe-check-password").value = "synthetic password";
    browser.field("mhfe-check-ref-kind").value = "fingerprint";
    browser.field("mhfe-check-fingerprint").value = "00000000";
    browser.field("mhfe-check").click();
    await drainUntil(() => request !== undefined, "actual Check tab client dispatch");
    assert.equal(request.reference.fingerprint, "00000000");
    assert.equal(request.container, "synthetic container A");
    const edit = () => {
      browser.field("mhfe-check-fingerprint").value = "11111111";
      browser.field("mhfe-check-fingerprint").emit("input");
      browser.field("mhfe-check-container").value = "synthetic container B";
      browser.field("mhfe-check-container").emit("input");
    };
    if (editTiming === "pending") edit();
    reply.resolve({ matches: true, path: null });
    await drainUntil(() => gate.runningJob === null, "Check job completion");
    if (editTiming === "completed") edit();
    await flush();
    const showsMatch = browser.field("mhfe-check-result").textContent.includes("Matches:");
    return {
      dispatchedOriginalReference: request.reference.fingerprint === "00000000",
      correctVerdictOwnership: editTiming === "none" ? showsMatch : !showsMatch,
      gateReleased: gate.runningJob === null,
      cancelControlReleased:
        browser.field("mhfe-check-stop").hidden &&
        browser.field("mhfe-check-stop").onclick === null,
    };
  } finally {
    reply.resolve({ matches: false, path: null });
    await flush();
    engine?.cancelCore();
    browser.dispose();
  }
}

await runProbe("MHFE Check verdict ownership", [
  ["unchanged-input control", () => caseFor("none")],
  ["edit during client check", () => caseFor("pending")],
  ["edit after successful check", () => caseFor("completed")],
]);

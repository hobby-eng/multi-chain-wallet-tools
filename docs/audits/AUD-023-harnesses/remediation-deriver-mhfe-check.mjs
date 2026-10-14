// AUD-023 remediation re-run of AUD-022-UI001: the real MhfeCheckTab, InputRevision, MhfeEngine,
// MhfeRun and RecoveryJobGate with a synthetic client; copied from AUD-022-harnesses
// deriver-mhfe-check-edit.mjs. Edits now bubble from the field to #mhfe-check-panel as in a browser
// (the fixed tab listens there). Extended with the fields and orderings that AUD-022's "required
// verification" names. No WASM or Argon2 runs.
import assert from "node:assert/strict";
import {
  browserStub,
  deferred,
  drainUntil,
  flush,
  mhfeReplacements,
  runProbe,
  sourceLoader,
} from "./remediation-vm-support.mjs";

async function setup({ holdFacts = false } = {}) {
  const browser = browserStub();
  const reply = deferred();
  const facts = deferred();
  if (!holdFacts) facts.resolve();
  const state = { request: undefined, readContainer: 0 };
  const load = sourceLoader(browser, mhfeReplacements(browser));
  const { MhfeCheckTab } = await load("recovery-mhfe-check.ts");
  const { MhfeEngine } = await load("recovery-mhfe-engine.ts");
  const { RecoveryJobGate } = await load("recovery-job-gate.ts");
  const gate = new RecoveryJobGate();
  const engine = new MhfeEngine();
  engine.client = async () => ({
    readContainer: async (container) => {
      state.readContainer += 1;
      await facts.promise;
      return { container, suiteId: "SYNTHETIC", builtInCheckLengths: [], offersWalletCheck: false };
    },
    check: (input) => {
      state.request = input;
      return reply.promise;
    },
  });
  engine.cancelCore = () =>
    reply.reject(Object.assign(new Error("Stopped."), { code: "CANCELLED" }));
  new MhfeCheckTab({ jobs: gate, writeClipboard() {} }, engine);
  const values = {
    "mhfe-check-words": "12",
    "mhfe-check-container": "synthetic container A",
    "mhfe-check-password": "synthetic password",
    "mhfe-check-ref-kind": "fingerprint",
    "mhfe-check-fingerprint": "00000000",
    "mhfe-check-passphrase": "",
    "mhfe-check-pim": "0",
  };
  for (const [id, value] of Object.entries(values)) browser.field(id).value = value;
  browser.attachAll("mhfe-check-", "mhfe-check-panel");
  const edit = (id, value, type = "input") => {
    browser.field(id).value = value;
    browser.field(id).emit(type);
  };
  return {
    browser,
    gate,
    state,
    reply,
    facts,
    edit,
    press: () => browser.field("mhfe-check").click(),
    showsMatch: () => browser.field("mhfe-check-result").textContent.includes("Matches:"),
    status: () => browser.field("mhfe-check-status").textContent,
    released: () =>
      gate.runningJob === null &&
      browser.field("mhfe-check-stop").hidden &&
      browser.field("mhfe-check-stop").onclick === null,
  };
}

async function editDuringCheck(id, value, type) {
  const tab = await setup();
  try {
    tab.press();
    await drainUntil(() => tab.state.request !== undefined, "client check dispatch");
    const dispatchedOriginal =
      tab.state.request.container === "synthetic container A" &&
      tab.state.request.reference.fingerprint === "00000000";
    if (id !== undefined) tab.edit(id, value, type);
    tab.reply.resolve({ matches: true, path: null });
    await drainUntil(() => tab.gate.runningJob === null, "Check job completion");
    await flush();
    if (id === undefined)
      return { dispatchedOriginal, controlShowsMatch: tab.showsMatch(), released: tab.released() };
    return {
      dispatchedOriginal,
      noVerdictForEditedFields: !tab.showsMatch(),
      saysFieldsChanged: tab.status().includes("The fields changed while the check ran"),
      released: tab.released(),
    };
  } finally {
    tab.browser.dispose();
  }
}

async function editAfterSuccess() {
  const tab = await setup();
  try {
    tab.press();
    await drainUntil(() => tab.state.request !== undefined, "client check dispatch");
    tab.reply.resolve({ matches: true, path: null });
    await drainUntil(() => tab.gate.runningJob === null, "Check job completion");
    await flush();
    const shownFirst = tab.showsMatch();
    tab.edit("mhfe-check-container", "synthetic container B");
    return { shownFirst, removedOnEdit: !tab.showsMatch() };
  } finally {
    tab.browser.dispose();
  }
}

async function errorAfter(edited) {
  const tab = await setup();
  try {
    tab.press();
    await drainUntil(() => tab.state.request !== undefined, "client check dispatch");
    if (edited) tab.edit("mhfe-check-fingerprint", "11111111");
    tab.reply.reject(new Error("Synthetic refusal"));
    await drainUntil(() => tab.gate.runningJob === null, "Check job completion");
    await flush();
    const shown = tab.status().includes("Synthetic refusal");
    return edited
      ? { errorOfOldFieldsHidden: !shown, released: tab.released() }
      : { controlErrorShown: shown, released: tab.released() };
  } finally {
    tab.browser.dispose();
  }
}

async function editBeforeFacts() {
  const tab = await setup({ holdFacts: true });
  try {
    tab.press();
    await drainUntil(() => tab.state.readContainer === 1, "container read");
    tab.edit("mhfe-check-container", "synthetic container B");
    tab.facts.resolve();
    await drainUntil(() => tab.gate.runningJob === null, "Check job completion");
    await flush();
    return { noCheckDispatched: tab.state.request === undefined, released: tab.released() };
  } finally {
    tab.browser.dispose();
  }
}

await runProbe("MHFE Check verdict ownership (AUD-022-UI001 re-run)", [
  ["unchanged-input control", () => editDuringCheck()],
  [
    "container edit during the check (AUD-022)",
    () => editDuringCheck("mhfe-check-container", "synthetic container B"),
  ],
  [
    "reference edit during the check (AUD-022)",
    () => editDuringCheck("mhfe-check-fingerprint", "11111111"),
  ],
  ["password edit during the check", () => editDuringCheck("mhfe-check-password", "other")],
  ["passphrase edit during the check", () => editDuringCheck("mhfe-check-passphrase", "TREZOR")],
  ["PIM edit during the check", () => editDuringCheck("mhfe-check-pim", "5")],
  [
    "reference kind change during the check",
    () => editDuringCheck("mhfe-check-ref-kind", "address", "change"),
  ],
  ["word count change during the check", () => editDuringCheck("mhfe-check-words", "24", "change")],
  ["edit after a successful check (AUD-022)", editAfterSuccess],
  ["error after an edit", () => errorAfter(true)],
  ["error control without an edit", () => errorAfter(false)],
  ["edit while the container is read", editBeforeFacts],
]);
assert.ok(true);

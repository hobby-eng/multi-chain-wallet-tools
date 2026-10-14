// AUD-023 remediation re-run of AUD-022-API005 (Cancel latches from the first step) and
// AUD-022-UI002 (a password review dropped after an edit). Adapted from
// AUD-022-harnesses/mhfe-contract-probes.mjs: instead of calling engine.client() directly, as the
// old probe did, Cancel is pressed through four real tabs (Encode, Decode, Check, Change password)
// at each stage (WebAssembly compilation, container or phrase facts, password review, active
// operation), so that the production path from the button to MhfeRun.step is exercised. Real:
// the tabs, MhfeEngine, MhfeRun, PasswordReview, PasswordField, PimField, WalletPassphraseQuestion,
// recovery-mhfe-status.ts and the package's runtime.js errors. Synthetic: WebAssembly.compile, the
// client and password-review classes, cards and the wallet reference. No WASM or Argon2 runs.
import assert from "node:assert/strict";
import {
  browserStub,
  deferred,
  drainUntil,
  flush,
  mhfeReplacements,
  realFile,
  runProbe,
  sourceLoader,
} from "./remediation-vm-support.mjs";

const NO_CHOICE_REVIEW = {
  profile: "MHFE-PASSWORD-CHECK-1",
  reading: "notThisShape",
  correction: null,
  correctionText: null,
  offersCorrection: false,
  repairsFirst: false,
  repairs: [],
};
/** A review whose answers name a (synthetic) repair word, so the box opens with choices. */
const CHOICE_REVIEW = {
  profile: "MHFE-PASSWORD-CHECK-1",
  reading: "restorable",
  correction: null,
  correctionText: null,
  offersCorrection: false,
  repairsFirst: true,
  repairs: [{ position: 3, word: "public-synthetic-repair", typed: null }],
};

/** Loads the real modules with the synthetic package; `hold` names the stage that waits. */
async function environment(hold) {
  const browser = browserStub();
  const pending = {};
  const state = { calls: [], cancelled: 0, reviews: 0 };
  let errors;
  const gate = (stage, value) => {
    if (stage !== hold) return Promise.resolve(value);
    const waiting = deferred();
    pending[stage] = waiting;
    return waiting.promise.then(() => value);
  };
  let active;
  class ClientStub {
    cancel() {
      state.cancelled += 1;
      active?.reject(new errors.MhfeCancelledError());
    }
    readPhrase(phrase) {
      state.calls.push("facts");
      return gate("facts", { words: 12, phrase, otherLengths: [] });
    }
    readContainer(container) {
      state.calls.push("facts");
      return gate("facts", {
        container,
        suiteId: "SYNTHETIC",
        containerFingerprint: "00000000",
        builtInCheckLengths: [],
        offersWalletCheck: false,
        phraseLengths: [12],
        confirmationFor: { 12: "walletOrOwner" },
      });
    }
    #operation(name, value) {
      state.calls.push(`active:${name}`);
      active = deferred();
      if (hold !== "active") active.resolve(value);
      return active.promise;
    }
    encrypt() {
      return this.#operation("encrypt", { container: "c", containerFingerprint: "0", keep: [] });
    }
    decrypt() {
      return this.#operation("decrypt", { kind: "single", candidates: [] });
    }
    check() {
      return this.#operation("check", { matches: true, path: null });
    }
    rekey() {
      return this.#operation("rekey", { container: "c", containerFingerprint: "0", keep: [] });
    }
  }
  class PasswordsStub {
    review() {
      state.reviews += 1;
      state.calls.push("review");
      return gate("review", NO_CHOICE_REVIEW);
    }
  }
  const replacements = {
    ...mhfeReplacements(browser),
    "@ckd/recovery-mhfe-wasm/core/client.js": {
      MhfeError: class extends Error {},
      MhfeClient: ClientStub,
    },
    "@ckd/recovery-mhfe-wasm/passwords/passwords.js": { MhfePasswords: PasswordsStub },
    "./recovery-mhfe-fields.js": realFile("apps/key-derivation/src/ui/recovery-mhfe-fields.ts"),
    "./recovery-mhfe-status.js": realFile("apps/key-derivation/src/ui/recovery-mhfe-status.ts"),
    "./recovery-progress.js": realFile("apps/key-derivation/src/ui/recovery-progress.ts"),
    "@ckd/ui/qr-image-import.js": { installQrImageImport() {} },
  };
  const compile = hold === "compile" ? deferred() : undefined;
  if (compile !== undefined) pending.compile = compile;
  const load = sourceLoader(browser, replacements, {
    performance,
    WebAssembly: { compile: () => (compile === undefined ? Promise.resolve({}) : compile.promise) },
    __MHFE_WORKER_SOURCE__: "synthetic worker text",
    __MHFE_ARGON2_THREADED_SOURCE__: "synthetic threaded text",
    __MHFE_ARGON2_SINGLE_THREADED_SOURCE__: "synthetic single-threaded text",
  });
  // The same module instance that MhfeRun and the status texts import.
  errors = await load("../../../../packages/recovery-mhfe-wasm/generated/runtime/runtime.js");
  const { MhfeEngine } = await load("recovery-mhfe-engine.ts");
  const { RecoveryJobGate } = await load("recovery-job-gate.ts");
  return { browser, load, pending, state, MhfeEngine, RecoveryJobGate };
}

const TABS = {
  encode: {
    module: "recovery-mhfe-encode.ts",
    className: "MhfeEncodeTab",
    prefix: "mhfe-encrypt",
    before(browser) {
      browser.radios("mhfe-encrypt-wallet-passphrase", [
        "mhfe-encrypt-wallet-passphrase-no",
        "mhfe-encrypt-wallet-passphrase-yes",
      ]);
    },
    after(browser) {
      browser.field("mhfe-encrypt-wallet-passphrase-no").checked = true;
      browser.field("mhfe-repair-0").name = "mhfe-repair-count";
      browser.field("mhfe-repair-0").value = "0";
      browser.field("mhfe-repair-0").checked = true;
      browser.field("mhfe-encrypt-password").value = "synthetic password";
      browser.field("mhfe-encrypt-password-confirm").value = "synthetic password";
    },
    start: "mhfe-encrypt",
    completed: /^Encryption complete/u,
  },
  decode: {
    module: "recovery-mhfe-decode.ts",
    className: "MhfeDecodeTab",
    prefix: "mhfe-decrypt",
    before() {},
    after(browser) {
      browser.field("mhfe-container").value = "synthetic container";
      browser.field("mhfe-decrypt-source-words").value = "auto";
      browser.field("mhfe-decrypt-password").value = "synthetic password";
    },
    start: "mhfe-decrypt",
    completed: /^Recovery complete/u,
  },
  check: {
    module: "recovery-mhfe-check.ts",
    className: "MhfeCheckTab",
    prefix: "mhfe-check",
    before() {},
    after(browser) {
      browser.field("mhfe-check-container").value = "synthetic container";
      browser.field("mhfe-check-words").value = "12";
      browser.field("mhfe-check-password").value = "synthetic password";
      browser.field("mhfe-check-ref-kind").value = "fingerprint";
      browser.field("mhfe-check-fingerprint").value = "00000000";
    },
    start: "mhfe-check",
    completed: /^Check complete/u,
  },
  rekey: {
    module: "recovery-mhfe-rekey.ts",
    className: "MhfeRekeyTab",
    prefix: "mhfe-rekey",
    before(browser) {
      browser.radios("mhfe-rekey-others", ["mhfe-rekey-others-yes", "mhfe-rekey-others-no"]);
      browser.radios("mhfe-rekey-wallet-passphrase", [
        "mhfe-rekey-wallet-passphrase-no",
        "mhfe-rekey-wallet-passphrase-yes",
      ]);
    },
    after(browser) {
      browser.field("mhfe-rekey-others-yes").checked = true;
      browser.field("mhfe-rekey-wallet-passphrase-no").checked = true;
      browser.field("mhfe-rekey-repair-0").name = "mhfe-rekey-repair-count";
      browser.field("mhfe-rekey-repair-0").value = "0";
      browser.field("mhfe-rekey-repair-0").checked = true;
      browser.field("mhfe-rekey-words").value = "12";
      browser.field("mhfe-rekey-container").value = "synthetic container";
      browser.field("mhfe-rekey-ref-kind").value = "fingerprint";
      browser.field("mhfe-rekey-fingerprint").value = "73c5da0a";
      browser.field("mhfe-rekey-password").value = "synthetic old password";
      browser.field("mhfe-rekey-new-password").value = "synthetic new password";
      browser.field("mhfe-rekey-new-password-confirm").value = "synthetic new password";
    },
    start: "mhfe-rekey",
    completed: /^Password changed/u,
  },
};

const LATER = {
  compile: ["facts", "review", "active"],
  facts: ["review", "active"],
  review: ["active"],
  active: [],
};

async function cancelAt(tabName, stage) {
  const tab = TABS[tabName];
  const env = await environment(stage);
  const { browser, state } = env;
  try {
    tab.before(browser);
    const Tab = (await env.load(tab.module))[tab.className];
    const gate = new env.RecoveryJobGate();
    const engine = new env.MhfeEngine();
    new Tab(
      { jobs: gate, writeClipboard() {}, readMnemonic: () => `${"abandon ".repeat(11)}about` },
      engine,
    );
    tab.after(browser);
    browser.field(tab.start).click();
    const cancel = browser.field(`${tab.prefix}-stop`);
    const status = browser.field(`${tab.prefix}-status`);
    if (stage === undefined) {
      await drainUntil(() => gate.runningJob === null, "job end");
      await flush();
      return {
        operationRanOnce: state.calls.filter((call) => call.startsWith("active")).length === 1,
        completed: tab.completed.test(status.textContent),
        released: cancel.hidden && cancel.onclick === null,
      };
    }
    if (stage === "active")
      await drainUntil(() => state.calls.some((call) => call.startsWith("active")), "operation");
    else await drainUntil(() => env.pending[stage] !== undefined, `${stage} stage`);
    const callsAtCancel = state.calls.length;
    cancel.onclick();
    // A bounded wait, so that a gate still held after Cancel is a failed check, not a hang.
    for (let turn = 0; turn < 256 && gate.runningJob !== null; turn += 1) await Promise.resolve();
    const gateReleasedAtOnce = gate.runningJob === null;
    // The tab's catch handler writes the status a few microtasks after the gate is released.
    await flush();
    const statusAfterCancel = status.textContent;
    env.pending[stage]?.resolve();
    await flush();
    const later = state.calls.slice(callsAtCancel);
    return {
      gateReleasedAtOnce,
      noLaterStep: LATER[stage].every((name) => !later.some((call) => call.startsWith(name))),
      saysStopped: statusAfterCancel.startsWith("Stopped."),
      noLateStatus: status.textContent === statusAfterCancel,
      noResultCard: browser.field(`${tab.prefix}-result`).children.length === 0,
      cancelReleased: cancel.hidden && cancel.onclick === null,
      ...(stage === "active" ? { packageCancelled: state.cancelled > 0 } : {}),
    };
  } finally {
    for (const waiting of Object.values(env.pending)) waiting.resolve();
    await flush();
    browser.dispose();
  }
}

/** UI002: the real PasswordReview with a review held until the field was edited. */
async function reviewAfterEdit(variant) {
  const env = await environment(undefined);
  const { browser } = env;
  try {
    const { PasswordReview, PasswordField } = await env.load("recovery-mhfe-fields.ts");
    const { MhfeRun } = await env.load("recovery-mhfe-run.ts");
    const replies = [];
    const engine = {
      passwords: async () => ({
        review: () => {
          const reply = deferred();
          replies.push(reply);
          return reply.promise;
        },
      }),
    };
    const password = new PasswordField("probe-password", "probe password");
    const repeat = new PasswordField("probe-repeat", "probe repetition");
    const review = new PasswordReview(engine, "probe-review", [password, repeat]);
    const box = browser.field("probe-review");
    const answers = browser.field("probe-review .mhfe-review-answers");
    const run = new MhfeRun(() => undefined);
    password.input.value = "public synthetic password A";
    repeat.input.value = "public synthetic password A";
    const first = review.choose(run, password.value, repeat.value);
    await drainUntil(() => replies.length === 1, "first review request");
    if (variant === "control") {
      replies[0].resolve(CHOICE_REVIEW);
      const result = await first;
      return {
        waitsForChoice: "wait" in result,
        boxShown: box.hidden === false,
        answersShown: answers.children.length > 0,
        answersConcealed: answers.classList.contains("concealed"),
      };
    }
    if (variant === "reveal-then-edit") {
      replies[0].resolve(CHOICE_REVIEW);
      await first;
      browser.field("toggle-probe-review").click();
      const revealed = !answers.classList.contains("concealed");
      password.input.value = "";
      password.input.emit("input");
      return {
        revealed,
        boxHidden: box.hidden,
        answersEmptied: answers.children.length === 0,
        concealedAgain: answers.classList.contains("concealed"),
      };
    }
    const edited = variant === "edit-repeat" ? repeat : password;
    edited.input.value = variant === "clear" ? "" : "public synthetic password B";
    edited.input.emit("input");
    if (variant === "newer-review") {
      password.input.value = "public synthetic password B";
      repeat.input.value = "public synthetic password B";
      const second = review.choose(run, password.value, repeat.value);
      await drainUntil(() => replies.length === 2, "second review request");
      replies[1].resolve(NO_CHOICE_REVIEW);
      const newer = await second;
      replies[0].resolve(CHOICE_REVIEW);
      const older = await first;
      return {
        newerGoesOn: "repair" in newer,
        olderDropped: "wait" in older && /changed while it was reviewed/u.test(older.wait),
        boxHidden: box.hidden,
        noAnswers: answers.children.length === 0,
      };
    }
    replies[0].resolve(CHOICE_REVIEW);
    const result = await first;
    return {
      dropped: "wait" in result && /changed while it was reviewed/u.test(result.wait),
      boxHidden: box.hidden,
      noAnswers: answers.children.length === 0,
    };
  } finally {
    browser.dispose();
  }
}

const cases = [];
for (const tab of Object.keys(TABS)) {
  cases.push([`API005 ${tab}: control without Cancel`, () => cancelAt(tab, undefined)]);
  for (const stage of ["compile", "facts", "review", "active"])
    cases.push([`API005 ${tab}: Cancel during ${stage}`, () => cancelAt(tab, stage)]);
}
cases.push(
  ["UI002: unchanged-input control", () => reviewAfterEdit("control")],
  ["UI002: password cleared during the review (AUD-022)", () => reviewAfterEdit("clear")],
  ["UI002: password edited during the review", () => reviewAfterEdit("edit")],
  ["UI002: repetition edited during the review", () => reviewAfterEdit("edit-repeat")],
  ["UI002: older review answers after a newer one", () => reviewAfterEdit("newer-review")],
  ["UI002: shown answers concealed and emptied on edit", () => reviewAfterEdit("reveal-then-edit")],
);
await runProbe("MHFE Cancel and password review (AUD-022-API005/UI002 re-run)", cases);
assert.ok(true);

// AUD-022 MHFE integration probes. Coordinator execution only: no Worker, WASM or Argon2 runs.
// Run from the repository root with the pinned Node 26.10.0:
// node --experimental-vm-modules docs/audits/AUD-022-harnesses/mhfe-contract-probes.mjs
// Exit 1 means an expected cancellation/revision invariant failed; exit 2 is a harness error.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, resolve } from "node:path";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

const root = resolve(import.meta.dirname, "../../..");
const ui = resolve(root, "apps/key-derivation/src/ui");
const sourceHashes = new Map();

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

class ElementStub {
  hidden = false;
  value = "";
  textContent = "";
  children = [];
  listeners = new Map();
  classes = new Set();
  classList = {
    contains: (name) => this.classes.has(name),
    toggle: (name, force) => {
      const present = force ?? !this.classes.has(name);
      if (present) this.classes.add(name);
      else this.classes.delete(name);
      return present;
    },
  };

  addEventListener(name, callback) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(callback);
    this.listeners.set(name, listeners);
  }

  emit(name) {
    for (const callback of this.listeners.get(name) ?? []) callback();
  }

  setAttribute() {}

  replaceChildren(...children) {
    this.children = children;
  }

  append(...children) {
    this.children.push(...children);
  }
}

function modules(context, replacements) {
  const cache = new Map();
  function replacement(key) {
    if (cache.has(key)) return cache.get(key);
    const exports = replacements[key];
    const module = new SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      },
      { context, identifier: key },
    );
    cache.set(key, module);
    return module;
  }
  function source(path) {
    if (cache.has(path)) return cache.get(path);
    const bytes = readFileSync(path);
    sourceHashes.set(path, createHash("sha256").update(bytes).digest("hex"));
    const text = path.endsWith(".ts")
      ? stripTypeScriptTypes(bytes.toString("utf8"))
      : bytes.toString("utf8");
    const module = new SourceTextModule(text, { context, identifier: path });
    cache.set(path, module);
    return module;
  }
  return async (path) => {
    const module = source(path);
    await module.link((specifier, importer) => {
      if (Object.hasOwn(replacements, specifier)) return replacement(specifier);
      // The selected first-party TypeScript files use .js import specifiers.
      if (!specifier.startsWith(".")) throw new Error(`Unmocked import ${specifier}`);
      return source(resolve(dirname(importer.identifier), specifier.replace(/\.js$/u, ".ts")));
    });
    await module.evaluate();
    return module.namespace;
  };
}

async function cancelBeforeClientExists() {
  const compilation = deferred();
  const calls = { started: 0, cancelled: 0 };
  class ClientStub {
    cancel() {
      calls.cancelled += 1;
    }
    async encrypt() {
      calls.started += 1;
      return "synthetic result";
    }
  }
  const context = createContext({
    WebAssembly: { compile: () => compilation.promise },
    __MHFE_WORKER_SOURCE__: "synthetic worker text",
    __MHFE_ARGON2_THREADED_SOURCE__: "synthetic threaded text",
    __MHFE_ARGON2_SINGLE_THREADED_SOURCE__: "synthetic single-threaded text",
  });
  const load = modules(context, {
    "@ckd/recovery-mhfe-wasm/core/client.js": { MhfeClient: ClientStub },
    "@ckd/recovery-mhfe-wasm/passwords/passwords.js": { MhfePasswords: class {} },
    "@ckd/recovery-mhfe-wasm/repair/repair.js": { MhfeRepair: class {} },
    "@ckd/recovery-mhfe-wasm/wallet/wallet.js": { MhfeWallet: class {} },
    "@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm": { default: new Uint8Array() },
  });
  const { MhfeEngine } = await load(resolve(ui, "recovery-mhfe-engine.ts"));
  const engine = new MhfeEngine();
  const button = { hidden: true, onclick: null };
  const running = engine.runCancellable(
    button,
    () => engine.cancelCore(),
    async () => {
      const client = await engine.client();
      return client.encrypt();
    },
  );
  assert.equal(button.hidden, false);
  button.onclick();
  compilation.resolve({ synthetic: true });
  const outcome = await running.then(
    () => "resolved",
    () => "rejected",
  );
  console.log(JSON.stringify({ case: "cancel-before-client", outcome, ...calls }));
  assert.equal(calls.started, 0, "Cancel must prevent a later operation after preparation");
  assert.equal(outcome, "rejected", "A cancelled wrapper must reject");
}

async function passwordReviewAfterEdit() {
  const response = deferred();
  const submitted = deferred();
  const elements = new Map();
  for (const selector of [
    "#probe-review",
    "#probe-review .mhfe-review-explanation",
    "#probe-review .mhfe-review-answers",
    "#toggle-probe-review",
  ])
    elements.set(selector, new ElementStub());
  const context = createContext({
    document: { createElement: () => new ElementStub() },
  });
  const load = modules(context, {
    "@ckd/ui/qr-image-import.js": { installQrImageImport: () => {} },
    "@ckd/recovery-mhfe-wasm/runtime/runtime.js": { MhfeError: class extends Error {} },
    "./recovery-workspace-shared.js": {
      required: (selector) => {
        assert.ok(elements.has(selector), `Unexpected selector ${selector}`);
        return elements.get(selector);
      },
      installSecretToggle: () => {},
    },
  });
  const { PasswordReview } = await load(resolve(ui, "recovery-mhfe-fields.ts"));
  const input = new ElementStub();
  input.value = "public synthetic old password";
  const review = new PasswordReview(
    {
      passwords: async () => ({
        review: () => {
          submitted.resolve();
          return response.promise;
        },
      }),
    },
    "probe-review",
    [{ input }],
  );
  const pending = review.choose(input.value);
  await submitted.promise;
  input.value = "";
  input.emit("input");
  assert.equal(elements.get("#probe-review").hidden, true);
  response.resolve({
    profile: "MHFE-PASSWORD-CHECK-1",
    reading: "restorable",
    correction: null,
    correctionText: null,
    offersCorrection: false,
    repairsFirst: true,
    repairs: [{ position: 3, word: "public-synthetic-repair", typed: null }],
  });
  await pending;
  const box = elements.get("#probe-review");
  const answers = elements.get("#probe-review .mhfe-review-answers");
  console.log(
    JSON.stringify({
      case: "review-after-edit",
      hidden: box.hidden,
      answers: answers.children.length,
    }),
  );
  assert.equal(box.hidden, true, "Editing or clearing must invalidate an outstanding review");
  assert.equal(answers.children.length, 0, "No stale password words may be restored");
}

let failures = 0;
let harnessErrors = 0;
for (const probe of [cancelBeforeClientExists, passwordReviewAfterEdit]) {
  try {
    await probe();
    console.log(`PASS ${probe.name}`);
  } catch (error) {
    if (error instanceof assert.AssertionError) failures += 1;
    else harnessErrors += 1;
    console.log(
      `${error instanceof assert.AssertionError ? "FAIL" : "HARNESS ERROR"} ${probe.name}: ${error.message}`,
    );
  }
}
console.log(
  JSON.stringify({ sourceHashes: Object.fromEntries(sourceHashes), failures, harnessErrors }),
);
process.exitCode = harnessErrors > 0 ? 2 : failures > 0 ? 1 : 0;

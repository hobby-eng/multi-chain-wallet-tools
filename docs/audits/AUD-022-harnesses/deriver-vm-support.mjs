// AUD-022: bounded in-memory execution of unchanged production TypeScript. Coordinator only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, resolve } from "node:path";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

export const ROOT = resolve(import.meta.dirname, "../../..");
export const UI = resolve(ROOT, "apps/key-derivation/src/ui");
export const PUBLIC_PHRASE = `${"abandon ".repeat(11)}about`;
const snapshot = JSON.parse(
  readFileSync(resolve(ROOT, "docs/audits/AUD-022-evidence/snapshot-resumed.json"), "utf8"),
);
const loadedHashes = new Map();

export function deferred() {
  let fulfill;
  let refuse;
  let settled = false;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    fulfill = resolvePromise;
    refuse = rejectPromise;
  });
  return {
    promise,
    resolve(value) {
      if (settled) return;
      settled = true;
      fulfill(value);
    },
    reject(error) {
      if (settled) return;
      settled = true;
      refuse(error);
    },
    get settled() {
      return settled;
    },
  };
}

export class ElementStub {
  value = "";
  hidden = false;
  disabled = false;
  checked = false;
  onclick = null;
  parentNode = null;
  children = [];
  listeners = new Map();
  attributes = new Map();
  dataset = {};
  name = "";
  tagName;
  #text = "";
  #classes = new Set();

  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
  }

  get className() {
    return [...this.#classes].join(" ");
  }

  set className(value) {
    this.#classes = new Set(value.split(/\s+/u).filter(Boolean));
  }

  classList = {
    add: (...names) => names.forEach((name) => this.#classes.add(name)),
    remove: (...names) => names.forEach((name) => this.#classes.delete(name)),
    contains: (name) => this.#classes.has(name),
    toggle: (name, force) => {
      const present = force ?? !this.#classes.has(name);
      if (present) this.#classes.add(name);
      else this.#classes.delete(name);
      return present;
    },
  };

  get textContent() {
    return this.#text + this.children.map((child) => child.textContent ?? String(child)).join("");
  }

  set textContent(value) {
    this.replaceChildren();
    this.#text = value;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type) {
    const event = { type, target: this, preventDefault() {} };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    if (type === "click") this.onclick?.(event);
  }

  click() {
    if (!this.disabled) this.emit("click");
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.#text = "";
    this.append(...children);
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
    if (name === "hidden") this.hidden = true;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "hidden") this.hidden = false;
  }

  contains(node) {
    return this === node || this.children.some((child) => child.contains(node));
  }

  querySelectorAll(tag) {
    return this.children.flatMap((child) => [
      ...(child.tagName === tag.toUpperCase() ? [child] : []),
      ...child.querySelectorAll(tag),
    ]);
  }

  focus() {}
}

export function browserStub() {
  const fields = new Map();
  const window = new ElementStub("window");
  let nextTimer = 0;
  const timers = new Map();
  // No real timer, worker or browser process is created by these host stubs.
  window.setTimeout = (callback) => {
    const id = ++nextTimer;
    timers.set(id, callback);
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  const field = (id) => {
    const selector = id.startsWith("#") ? id : `#${id}`;
    if (!fields.has(selector)) fields.set(selector, new ElementStub());
    return fields.get(selector);
  };
  const document = {
    querySelector: (selector) => fields.get(selector) ?? null,
    querySelectorAll: (selector) => {
      const name = /^input\[name="([^"]+)"\]$/u.exec(selector)?.[1];
      assert.ok(name, `Unsupported selector: ${selector}`);
      return [...fields.values()].filter((element) => element.name === name);
    },
    createElement: (tag) => new ElementStub(tag),
  };
  return {
    field,
    document,
    window,
    globals: {
      document,
      window,
      Node: ElementStub,
      console,
      Uint8Array,
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
    },
    dispose() {
      timers.clear();
      window.listeners.clear();
      for (const element of fields.values()) {
        element.listeners.clear();
        element.value = "";
        element.replaceChildren();
      }
      fields.clear();
    },
  };
}

export function sourceLoader(browser, replacements, extraGlobals = {}) {
  const context = createContext({ ...browser.globals, ...extraGlobals });
  const cache = new Map();
  function source(path) {
    if (cache.has(path)) return cache.get(path);
    const relative = path.slice(ROOT.length + 1);
    const bytes = readFileSync(path);
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.equal(hash, snapshot.files[relative], `Source drift from resumed snapshot: ${relative}`);
    loadedHashes.set(relative, hash);
    const module = new SourceTextModule(stripTypeScriptTypes(bytes.toString("utf8")), {
      context,
      identifier: path,
    });
    cache.set(path, module);
    return module;
  }
  function replacement(specifier) {
    if (cache.has(specifier)) return cache.get(specifier);
    const exports = replacements[specifier];
    const module = new SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      },
      { context, identifier: `stub:${specifier}` },
    );
    cache.set(specifier, module);
    return module;
  }
  return async (filename) => {
    const module = source(resolve(UI, filename));
    if (module.status === "unlinked")
      await module.link((specifier, importer) => {
        if (Object.hasOwn(replacements, specifier)) return replacement(specifier);
        if (!specifier.startsWith(".")) throw new Error(`Unstubbed import: ${specifier}`);
        return source(resolve(dirname(importer.identifier), specifier.replace(/\.js$/u, ".ts")));
      });
    if (module.status !== "evaluated") await module.evaluate({ timeout: 1000 });
    return module.namespace;
  };
}

export async function drainUntil(predicate, description) {
  // A finite microtask budget prevents a missing production branch from hanging the probe.
  for (let turn = 0; turn < 128 && !predicate(); turn += 1) await Promise.resolve();
  assert.ok(predicate(), `Did not reach ${description} within 128 microtask turns`);
}

export async function flush() {
  for (let turn = 0; turn < 32; turn += 1) await Promise.resolve();
}

export function mhfeReplacements(browser) {
  class PasswordField {
    constructor(id) {
      this.input = browser.field(id);
    }
    get value() {
      return this.input.value;
    }
    clear() {
      this.input.value = "";
    }
  }
  class ContainerField {
    constructor(id) {
      this.textarea = browser.field(id);
    }
    get value() {
      return this.textarea.value;
    }
  }
  class WalletReferenceField {
    constructor(_engine, prefix) {
      this.prefix = prefix;
      this.passphrase = new PasswordField(`mhfe-${prefix}-passphrase`);
    }
    get kind() {
      return browser.field(`mhfe-${this.prefix}-ref-kind`).value || undefined;
    }
    reference() {
      return { fingerprint: browser.field(`mhfe-${this.prefix}-fingerprint`).value };
    }
    walletReference() {
      return this.reference();
    }
    reset() {
      browser.field(`mhfe-${this.prefix}-ref-kind`).value = "";
    }
    offer() {}
  }
  class MhfeError extends Error {
    constructor(code, message = code) {
      super(message);
      this.code = code;
    }
  }
  const paragraph = (text, className = "") => {
    const element = browser.document.createElement("p");
    element.textContent = text;
    element.className = className;
    return element;
  };
  return {
    "@ckd/recovery-mhfe-wasm/core/client.js": { MhfeError, MhfeClient: class {} },
    "@ckd/recovery-mhfe-wasm/passwords/passwords.js": { MhfePasswords: class {} },
    "@ckd/recovery-mhfe-wasm/repair/repair.js": { MhfeRepair: class {} },
    "@ckd/recovery-mhfe-wasm/wallet/wallet.js": { MhfeWallet: class {} },
    "@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm": { default: new Uint8Array() },
    "./recovery-mhfe-fields.js": {
      PasswordField,
      ContainerField,
      WalletReferenceField,
      PimField: class {
        value() {
          return 0;
        }
      },
      PasswordReview: class {
        async choose() {
          return { repair: { asTyped: true }, outcome: "" };
        }
      },
      StrengthNote: class {},
      selectedRepairCount: () => 0,
    },
    "./recovery-mhfe-reference.js": { WalletReferenceField },
    "./recovery-mhfe-decode.js": { showContainerFacts() {} },
    "./recovery-mhfe-encode.js": { weakPasswordText: "Synthetic password note" },
    "./recovery-mhfe-cards.js": {
      ContainerCard: class {
        seal() {}
        markWrong() {}
        markUnfinished() {}
      },
      fingerprintLine: () => "Synthetic public fingerprint",
    },
    "./recovery-mhfe-status.js": {
      CHECK_STAGES: [],
      REKEY_STAGES: [],
      clearOnFirstProgress: () => () => {},
      describe: (cause) => cause.message,
      progressLine: () => "Synthetic progress",
    },
    "./recovery-progress.js": {
      JobClock: class {
        elapsed() {
          return 0;
        }
      },
      formatDuration: () => "0 s",
    },
    "./recovery-workspace-shared.js": { required: browser.field, paragraph },
  };
}

export async function runProbe(name, cases) {
  let defects = 0;
  let errors = 0;
  for (const [label, operation] of cases) {
    try {
      const checks = await operation();
      const failed = Object.entries(checks).filter(([, passed]) => passed !== true);
      if (failed.length > 0) defects += 1;
      console.log(
        JSON.stringify({ probe: name, case: label, checks, failed: failed.map(([key]) => key) }),
      );
    } catch (error) {
      errors += 1;
      console.error(JSON.stringify({ probe: name, case: label, harnessError: error.message }));
    }
  }
  console.log(
    JSON.stringify({
      probe: name,
      snapshot: snapshot.sourceFingerprint,
      sourceHashes: Object.fromEntries(loadedHashes),
      failingCases: defects,
      harnessErrors: errors,
    }),
  );
  process.exitCode = errors > 0 ? 2 : defects > 0 ? 1 : 0;
}

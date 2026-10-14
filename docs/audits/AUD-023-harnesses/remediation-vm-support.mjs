// AUD-023 remediation reviewer: bounded in-memory execution of unchanged production TypeScript in
// node:vm modules, adapted from AUD-022-harnesses/deriver-vm-support.mjs. Every production file it
// loads is checked against the AUD-023 baseline manifest before evaluation, so a result always
// names the bytes it ran. Changes from the AUD-022 copy: the binding is snapshot-baseline.json; DOM
// events bubble through parentNode as input and change events do in a browser (the fixed tabs listen
// on their panel); querySelector understands `input[name="x"]:checked`; a replacement may point at
// a real source file, which is then loaded and hash-checked too. No Worker, WASM, Argon2, timer or
// network is used.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, resolve } from "node:path";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

export const ROOT = resolve(import.meta.dirname, "../../..");
export const UI = resolve(ROOT, "apps/key-derivation/src/ui");
/** The public BIP39 test phrase (all-zero entropy). */
export const PUBLIC_PHRASE = `${"abandon ".repeat(11)}about`;
const SNAPSHOT_PATH = "docs/audits/AUD-023-evidence/snapshot-baseline.json";
const snapshot = JSON.parse(readFileSync(resolve(ROOT, SNAPSHOT_PATH), "utf8"));
const loadedHashes = new Map();
// Optional mutation check: REMEDIATION_MUTATION='{"file":"…/x.ts","from":"text","to":"text"}'
// rewrites that text in memory after the hash check, so that a run can show that the probe fails
// when the fix is taken out. The file on disk is never touched; output names the mutation.
const mutation = process.env.REMEDIATION_MUTATION
  ? JSON.parse(process.env.REMEDIATION_MUTATION)
  : undefined;
let mutationApplied = false;

/** Marks a replacement that loads a real file (path relative to the repository root). */
export const realFile = (path) => ({ [REAL]: path });
const REAL = Symbol("real source file");

export function deferred() {
  let fulfill;
  let refuse;
  let settled = false;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    fulfill = resolvePromise;
    refuse = rejectPromise;
  });
  promise.catch(() => {});
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
  readOnly = false;
  rows = 0;
  type = "";
  id = "";
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

  /** Fires `type` at this element and, as input/change/click do, at each ancestor in turn. */
  emit(type) {
    const event = { type, target: this, bubbles: true, preventDefault() {} };
    for (let node = this; node !== null; node = node.parentNode ?? null) {
      event.currentTarget = node;
      for (const listener of [...(node.listeners.get(type) ?? [])]) listener(event);
    }
    if (type === "click") this.onclick?.(event);
  }

  dispatchEvent(event) {
    this.emit(event.type);
    return true;
  }

  click() {
    if (!this.disabled) this.emit("click");
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }

  replaceChildren(...children) {
    for (const child of this.children) if (typeof child === "object") child.parentNode = null;
    this.children = [];
    this.#text = "";
    this.append(...children);
  }

  append(...children) {
    for (const child of children) {
      if (typeof child === "object") child.parentNode = this;
      this.children.push(child);
    }
  }

  prepend(...children) {
    for (const child of children) if (typeof child === "object") child.parentNode = this;
    this.children.unshift(...children);
  }

  after() {}

  setAttribute(name, value) {
    this.attributes.set(name, value);
    if (name === "hidden") this.hidden = true;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "hidden") this.hidden = false;
  }

  contains(node) {
    return this === node || this.children.some((child) => child?.contains?.(node));
  }

  closest() {
    return null;
  }

  descendants() {
    return this.children.flatMap((child) =>
      typeof child === "object" ? [child, ...child.descendants()] : [],
    );
  }

  querySelectorAll(selector) {
    const named = /^input\[name="([^"]+)"\](:checked)?$/u.exec(selector);
    if (named !== null)
      return this.descendants().filter(
        (node) => node.name === named[1] && (named[2] === undefined || node.checked),
      );
    return this.descendants().filter((node) => node.tagName === selector.toUpperCase());
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  focus() {}
  scrollIntoView() {}
}

export function browserStub() {
  const fields = new Map();
  const window = new ElementStub("window");
  const documentEvents = new ElementStub("document");
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
    if (!fields.has(selector)) {
      const element = new ElementStub();
      element.id = selector.slice(1);
      fields.set(selector, element);
    }
    return fields.get(selector);
  };
  const named = (name, checkedOnly) =>
    [...fields.values()].filter(
      (element) => element.name === name && (!checkedOnly || element.checked),
    );
  const document = {
    querySelector: (selector) => {
      const match = /^input\[name="([^"]+)"\]:checked$/u.exec(selector);
      if (match !== null) return named(match[1], true)[0] ?? null;
      return fields.get(selector) ?? null;
    },
    querySelectorAll: (selector) => {
      const match = /^input\[name="([^"]+)"\]$/u.exec(selector);
      assert.ok(match, `Unsupported selector: ${selector}`);
      return named(match[1], false);
    },
    createElement: (tag) => new ElementStub(tag),
    addEventListener: (type, listener) => documentEvents.addEventListener(type, listener),
    removeEventListener: (type, listener) => documentEvents.removeEventListener(type, listener),
    dispatchEvent: (event) => documentEvents.dispatchEvent(event),
    body: new ElementStub("body"),
  };
  return {
    field,
    document,
    window,
    /** Makes every existing field whose id starts with `prefix` a child of `parentId`. */
    attachAll(prefix, parentId) {
      const parent = field(parentId);
      for (const element of fields.values())
        if (element !== parent && element.id.startsWith(prefix) && element.parentNode === null)
          element.parentNode = parent;
    },
    /** Names a group of radio fields, as `<input name>` does. */
    radios(name, ids) {
      for (const id of ids) field(id).name = name;
    },
    globals: {
      document,
      window,
      Node: ElementStub,
      console,
      Uint8Array,
      Event: class {
        constructor(type) {
          this.type = type;
        }
      },
      CustomEvent: class {
        constructor(type, init) {
          this.type = type;
          this.detail = init?.detail;
        }
      },
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
      queueMicrotask,
      __DASH_COMMUNITY__: false,
    },
    dispose() {
      timers.clear();
      window.listeners.clear();
      documentEvents.listeners.clear();
      for (const element of fields.values()) {
        element.listeners.clear();
        element.value = "";
        element.replaceChildren();
      }
      fields.clear();
    },
  };
}

function checkedSource(path) {
  const relative = path.slice(ROOT.length + 1);
  const bytes = readFileSync(path);
  const hash = createHash("sha256").update(bytes).digest("hex");
  assert.equal(hash, snapshot.files[relative], `Source drift from AUD-023 baseline: ${relative}`);
  loadedHashes.set(relative, hash);
  let text = bytes.toString("utf8");
  if (mutation !== undefined && mutation.file === relative) {
    assert.ok(text.includes(mutation.from), `Mutation text not found in ${relative}`);
    text = text.split(mutation.from).join(mutation.to);
    mutationApplied = true;
  }
  return path.endsWith(".ts") ? stripTypeScriptTypes(text) : text;
}

export function sourceLoader(browser, replacements, extraGlobals = {}) {
  const context = createContext({ ...browser.globals, ...extraGlobals });
  const cache = new Map();
  function source(path) {
    if (cache.has(path)) return cache.get(path);
    const module = new SourceTextModule(checkedSource(path), { context, identifier: path });
    cache.set(path, module);
    return module;
  }
  function replacement(specifier) {
    const exports = replacements[specifier];
    if (exports[REAL] !== undefined) return source(resolve(ROOT, exports[REAL]));
    if (cache.has(specifier)) return cache.get(specifier);
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
  const link = (specifier, importer) => {
    if (Object.hasOwn(replacements, specifier)) return replacement(specifier);
    if (!specifier.startsWith(".")) throw new Error(`Unstubbed import: ${specifier}`);
    const target = resolve(dirname(importer.identifier), specifier);
    return source(
      target.endsWith(".js") && importer.identifier.endsWith(".ts")
        ? target.replace(/\.js$/u, ".ts")
        : target,
    );
  };
  return async (filename) => {
    const module = source(resolve(UI, filename));
    if (module.status === "unlinked") await module.link(link);
    if (module.status !== "evaluated") await module.evaluate({ timeout: 1000 });
    return module.namespace;
  };
}

export async function drainUntil(predicate, description) {
  // A finite microtask budget prevents a missing production branch from hanging the probe.
  for (let turn = 0; turn < 256 && !predicate(); turn += 1) await Promise.resolve();
  assert.ok(predicate(), `Did not reach ${description} within 256 microtask turns`);
}

export async function flush() {
  for (let turn = 0; turn < 64; turn += 1) await Promise.resolve();
}

/** The workspace helpers the tabs use, over the stub document. */
export function sharedReplacement(browser) {
  const paragraph = (text, className = "") => {
    const element = browser.document.createElement("p");
    element.textContent = text;
    element.className = className;
    return element;
  };
  return {
    required: browser.field,
    paragraph,
    installSecretToggle() {},
    renderReadBackWords() {},
    renderRecoveredMnemonic() {},
  };
}

/** The AUD-022 MHFE stubs, updated to the current field API (choose(run, …), assertCurrent). */
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
    get searchText() {
      return "";
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
  const given = new WeakSet();
  return {
    "@ckd/recovery-mhfe-wasm/core/client.js": { MhfeError, MhfeClient: class {} },
    "@ckd/recovery-mhfe-wasm/passwords/passwords.js": { MhfePasswords: class {} },
    "@ckd/recovery-mhfe-wasm/repair/repair.js": { MhfeRepair: class {} },
    "@ckd/recovery-mhfe-wasm/wallet/wallet.js": { MhfeWallet: class {} },
    "@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm": { default: new Uint8Array() },
    "@ckd/recovery-mhfe-wasm/runtime/runtime.js": realFile(
      "packages/recovery-mhfe-wasm/generated/runtime/runtime.js",
    ),
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
          const choice = { repair: "asTyped", outcome: "" };
          given.add(choice);
          return choice;
        }
        assertCurrent(choice) {
          assert.ok(given.has(choice));
        }
        reset() {}
      },
      StrengthNote: class {},
      selectedRepairCount: () => 0,
    },
    "./recovery-mhfe-reference.js": { WalletReferenceField },
    "./recovery-mhfe-decode.js": { showContainerFacts() {} },
    "./recovery-mhfe-encode.js": { weakPasswordText: () => "Synthetic password note" },
    "./recovery-mhfe-cards.js": {
      ContainerCard: class {
        constructor(host) {
          host?.append?.(browser.document.createElement("article"));
        }
        seal() {}
        markWrong() {}
        markUnfinished() {}
      },
      fingerprintLine: () => "Synthetic public fingerprint",
      renderPhrase() {},
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
    "./recovery-workspace-shared.js": sharedReplacement(browser),
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
      console.error(
        JSON.stringify({ probe: name, case: label, harnessError: error.stack ?? error.message }),
      );
    }
  }
  console.log(
    JSON.stringify({
      probe: name,
      snapshot: snapshot.sourceFingerprint,
      sourceHashes: Object.fromEntries(loadedHashes),
      mutation: mutation === undefined ? null : { ...mutation, applied: mutationApplied },
      failingCases: defects,
      harnessErrors: errors,
    }),
  );
  process.exitCode = errors > 0 ? 2 : defects > 0 ? 1 : 0;
}

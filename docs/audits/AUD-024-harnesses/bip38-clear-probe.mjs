// Actual Inspector feature with an in-memory DOM and deferred synthetic decryptor. No scrypt.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";
import { parsers } from "prettier/plugins/babel";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const path = "apps/psbt-inspector/src/bip38-feature.ts";
const source = readFileSync(resolve(root, path), "utf8");
const ast = await parsers["babel-ts"].parse(source);
const node = ast.program.body.find(
  (item) =>
    item.type === "ExportNamedDeclaration" && item.declaration?.id?.name === "installBip38Feature",
)?.declaration;
if (!node) throw new Error("Inspector installer changed; reassess the probe.");
const fragment = await transform(source.slice(node.start, node.end), {
  loader: "ts",
  format: "esm",
});

class MemoryElement {
  children = [];
  listeners = new Map();
  dataset = {};
  value = "";
  textContent = "";
  hidden = false;
  disabled = false;
  type = "password";
  addEventListener(event, handler) {
    this.listeners.set(event, handler);
  }
  setAttribute() {}
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren() {
    this.children = [];
  }
  querySelectorAll(selector) {
    const key = selector === "[data-bip38-secret]" ? "bip38Secret" : "copyBip38Secret";
    const walk = (element) => element.children.flatMap((child) => [child, ...walk(child)]);
    return walk(this).filter((element) => element.dataset[key] !== undefined);
  }
  click() {
    this.listeners.get("click")?.();
  }
}
function fixture() {
  const elements = new Map(),
    pending = [];
  const required = (id) => {
    if (!elements.has(id)) elements.set(id, new MemoryElement());
    return elements.get(id);
  };
  const textElement = (_tag, _class, text) => {
    const element = new MemoryElement();
    element.textContent = text;
    return element;
  };
  const context = {
    required,
    textElement,
    copyPlainText() {},
    syncNetworkChoice() {},
    document: { createElement: () => new MemoryElement(), addEventListener() {} },
    window: { addEventListener() {} },
    decryptBip38Key: () => new Promise((resolve) => pending.push(resolve)),
  };
  runInNewContext(`${fragment.code}\ninstallBip38Feature();`, context, { timeout: 1000 });
  const start = (password) => {
    required("bip38-encrypted-key").value = "synthetic-encrypted-key";
    required("bip38-password").value = password;
    required("bip38-chain").value = "bitcoin";
    required("bip38-network").value = "mainnet";
    required("decrypt-bip38").click();
  };
  return { required, pending, start };
}
const syntheticResult = {
  address: "synthetic-public-address",
  compressed: true,
  wif: "synthetic-wif",
  privateKeyHex: "11".repeat(32),
};
const settle = async () => new Promise((resolve) => setTimeout(resolve, 0));
const first = fixture();
first.start("public-test-password");
first.required("clear-bip38").click();
first.pending[0](syntheticResult);
await settle();
const afterClear = {
  retainedSecretInputs: first.required("bip38-result-list").querySelectorAll("[data-bip38-secret]")
    .length,
  revealEnabled: !first.required("toggle-bip38-result").disabled,
  resultsHidden: first.required("bip38-results").hidden,
};
const second = fixture();
second.start("old-public-test-password");
second.required("clear-bip38").click();
second.start("replacement-public-test-password");
second.pending[0](syntheticResult);
await settle();
const replacementRun = {
  retainedOldSecretInputs: second
    .required("bip38-result-list")
    .querySelectorAll("[data-bip38-secret]").length,
  replacementPasswordCleared: second.required("bip38-password").value === "",
  resultsHidden: second.required("bip38-results").hidden,
};
second.pending[1](syntheticResult);
await settle();
const contractPassed =
  afterClear.retainedSecretInputs === 0 &&
  !afterClear.revealEnabled &&
  replacementRun.retainedOldSecretInputs === 0 &&
  !replacementRun.replacementPasswordCleared;
console.log(
  JSON.stringify(
    {
      source: path,
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      executionScope:
        "Actual installer with injected memory DOM/deferred synthetic decryptor; no browser, clipboard or real KDF",
      afterClear,
      replacementRun,
      contractPassed,
    },
    null,
    2,
  ),
);
process.exitCode = contractPassed ? 0 : 1;

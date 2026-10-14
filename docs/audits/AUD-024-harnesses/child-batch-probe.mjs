// Real child orchestration and core batch guard; fake rows, no wallet generation or browser.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { build, transform } from "esbuild";
import { parsers } from "prettier/plugins/babel";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const path = "apps/key-derivation/src/ui/bip85-child-wallet-feature.ts";
const source = readFileSync(resolve(root, path), "utf8");
const ast = await parsers["babel-ts"].parse(source);
let selected;
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration" && node.id?.name === "deriveBip85Wallet") selected = node;
  for (const [key, child] of Object.entries(node))
    if (!["loc", "extra", "comments"].includes(key)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
}
visit(ast);
if (!selected) throw new Error("Child derivation entry changed; reassess the probe.");
const fragment = await transform(source.slice(selected.start, selected.end), {
  loader: "ts",
  format: "esm",
});
const bundled = await build({
  absWorkingDir: root,
  stdin: {
    contents: `export { assertBatch } from "./packages/crypto-core/src/bip32.ts";
      export { runStreamedDerivation } from "./apps/key-derivation/src/ui/streamed-derivation.ts";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
const input = {
  network: "mainnet",
  account: 0,
  branch: 0,
  start: 0,
  count: 51,
  includeChange: false,
  includeCoinJoin: false,
};
const adapter = { id: "dash-core" };
const branches = [{ kind: "receive", branch: 0 }];
const sharedBatchCounts = [],
  childBatchCounts = [];
const worker = (counts) => ({
  async derive(_id, request) {
    counts.push(request.count);
    api.assertBatch(request.start, request.count);
    return {
      id: "dash-core",
      basicSummary: [],
      summary: [],
      notices: [],
      rows: Array.from({ length: request.count }, (_, index) => ({
        index: request.start + index,
        path: "",
        basic: [],
        advanced: [],
      })),
    };
  },
  terminate() {},
});
await api.runStreamedDerivation({
  worker: worker(sharedBatchCounts),
  adapter,
  input,
  branches,
  seed: new Uint8Array(64),
  isStale: () => false,
  isCancelled: () => false,
  onInitialBatch() {},
  onAppendedBatch() {},
  onProgress() {},
  async yieldTurn() {},
});
const context = {
  options: { mnemonic: () => "public-fixture-placeholder", cryptoReady: () => true },
  bip85WalletAdapter: adapter,
  bip85WalletControls: {},
  deriveBip85WalletButton: { disabled: false },
  bip85WalletError: { textContent: "", hidden: true },
  bip85WalletStatus: { textContent: "", hidden: true },
  bip85WalletRevision: 0,
  activeBip85WalletWorker: null,
  bip85WalletBranchResults: new Map(),
  bip85WalletSelected: new Set(),
  bip85WalletActiveBranch: "receive",
  SELF_TEST_NOT_PASSED: "self-test gate",
  readControls: () => input,
  clearBip85WalletResults() {},
  updatePathPreview() {},
  createWorker: () => worker(childBatchCounts),
  optionalElement: () => null,
  mnemonicToSeed: () => new Uint8Array(64),
  planResultBranches: () => branches,
  clearDerivationResult() {},
  renderBip85WalletBranches() {},
  renderBip85Wallet() {},
  DerivationCancelledError: Error,
};
await runInNewContext(`${fragment.code}\nderiveBip85Wallet();`, context, { timeout: 1000 });
const contractPassed =
  context.bip85WalletError.hidden && childBatchCounts.every((count) => count <= 50);
console.log(
  JSON.stringify(
    {
      source: path,
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      executionScope:
        "Actual extracted deriveBip85Wallet function with host/UI stubs, real shared stream function and core assertBatch; installer and browser not run",
      requestedCount: input.count,
      sharedBatchCounts,
      childBatchCounts,
      childError: context.bip85WalletError.textContent,
      contractPassed,
    },
    null,
    2,
  ),
);
process.exitCode = contractPassed ? 0 : 1;

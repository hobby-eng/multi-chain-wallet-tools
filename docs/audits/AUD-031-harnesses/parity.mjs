/** Validate every handed-over area against actual host controls, owners and frozen source bytes. */
import { createHash } from "node:crypto";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { MNEMOCODE_FILES, verifyMnemoCodeSource } from "../../../tooling/sync-mnemocode-source.mjs";
import { MnemoCodeWalletTemplate } from "../../../tooling/mnemocode-wallet-template.mjs";
import { OPERATIONS } from "./operations.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const incoming = resolve(root, "../tmp/mnemocode-remediation-2026-10-14");
const evidence = resolve(root, "docs/audits/AUD-031-evidence");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const manifest = JSON.parse(readFileSync(resolve(incoming, "handover-source-manifest.json")));
const inventory = JSON.parse(readFileSync(resolve(incoming, "browser-operation-checklist.json")));
const retained = JSON.parse(readFileSync(resolve(evidence, "vendor-input.json")));
const sourceHashes = new Map(manifest.sourceFiles.map(({ path, sha256 }) => [path, sha256]));
const retainedHashes = new Map(retained.retained.map(({ path, sha256 }) => [path, sha256]));
verifyMnemoCodeSource({ root });
for (const [source, target] of Object.entries(MNEMOCODE_FILES)) {
  const expected = sourceHashes.get(source) ?? retainedHashes.get(source);
  if (
    expected === undefined ||
    hash(resolve(root, "../mnemocode", source)) !== expected ||
    hash(resolve(root, "packages/recovery-mnemocode/source", target)) !== expected
  )
    throw new Error(`Source binding mismatch: ${source}`);
}
if (
  inventory.sourceFingerprint !== manifest.sourceFingerprint ||
  OPERATIONS.length !== 37 ||
  inventory.operations.length !== 37
)
  throw new Error("The operation inventory does not match the frozen handover.");
const html =
  new MnemoCodeWalletTemplate().expand(read("apps/key-derivation/src/index.html")) +
  read("apps/discovery-scanner/src/index.html");

function hostPath(stem, kind) {
  if (stem.startsWith("../discovery-scanner/")) return `apps/${stem.slice(3)}.ts`;
  if (stem.startsWith("../shared-ui/")) return `packages/${stem.slice(3)}.ts`;
  return kind === "ui"
    ? `apps/key-derivation/src/ui/${stem}.ts`
    : `packages/recovery-backup/src/${stem}.ts`;
}

function testPath(stem) {
  const candidates = stem.startsWith("../")
    ? [hostPath(stem, "adapter").replace(/\.ts$/u, ".test.ts")]
    : [
        `packages/recovery-backup/tests/${stem}.test.ts`,
        `apps/key-derivation/tests/${stem}.test.ts`,
      ];
  const found = candidates.find((path) => existsSync(resolve(root, path)));
  if (found === undefined) throw new Error(`Missing referenced regression: ${stem}`);
  return found;
}

const rows = OPERATIONS.map(([control, ui, adapter, semantics, test], index) => {
  if (!html.includes(`id="${control}"`)) throw new Error(`Missing real control: ${control}`);
  const controller = hostPath(ui, "ui");
  const owner = hostPath(adapter, "adapter");
  const regression = testPath(test);
  for (const path of [controller, owner, regression])
    if (!existsSync(resolve(root, path))) throw new Error(`Missing host binding: ${path}`);
  return {
    ...inventory.operations[index],
    browserParityStatus: "source-covered; actual browser acceptance unexecuted",
    control,
    controller,
    owner,
    semantics,
    regression,
    bindingSha256: Object.fromEntries(
      [controller, owner, regression].map((path) => [path, hash(resolve(root, path))]),
    ),
    evidenceScope:
      "Coordinator source trace and reachable controls. A regression reference is not a claim it ran; executed subsets are listed in AUD-031.",
  };
});
const record = {
  sourceFingerprint: manifest.sourceFingerprint,
  ownerCommit: manifest.commit,
  incomingManifestSha256: hash(resolve(incoming, "handover-source-manifest.json")),
  incomingChecklistSha256: hash(resolve(incoming, "browser-operation-checklist.json")),
  vendoredManifestSha256: hash(resolve(root, "packages/recovery-mnemocode/source.json")),
  mappedFiles: Object.keys(MNEMOCODE_FILES).length,
  retainedAssetsAndVectorFiles: retained.retained.length,
  operations: rows,
  missingConfirmedOperations: [],
  limitations:
    "No actual browser, complete feature matrix, rendering gallery, full vectors or release acceptance. Services are not separate user operations; host entry routes above expose them through their owning workflows. Dash uses its admitted coin/evidence modules.",
};
writeFileSync(resolve(evidence, "parity-final.json"), JSON.stringify(record, null, 2) + "\n", {
  flag: "wx",
});
console.log(
  `Verified ${rows.length} real control/owner/regression references and ${record.mappedFiles} exact vendor bindings; runtime browser acceptance not claimed. Evidence: ${relative(root, resolve(evidence, "parity-final.json"))}`,
);

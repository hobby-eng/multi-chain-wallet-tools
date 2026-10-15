/** Inventory every independently exported part and actual control in both current editions. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MNEMOCODE_FILES, verifyMnemoCodeSource } from "../../../tooling/sync-mnemocode-source.mjs";
import { MnemoCodeSskrSource } from "../../../tooling/sync-mnemocode-sskr.mjs";
import { OPERATIONS } from "../AUD-031-harnesses/operations.mjs";
import { OperationContract } from "./contracts.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const evidence = resolve(root, "docs/audits/AUD-032-evidence");
const output = process.argv[2] ?? "parity-final.json";
if (!/^[a-z0-9-]+\.json$/u.test(output)) throw new Error("Choose a fresh evidence filename.");
const upstream = resolve(root, "../mnemocode");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const incoming = JSON.parse(read("docs/audits/AUD-032-evidence/incoming-source.json"));
const upstreamPins = new Map(incoming.files.map(({ path, sha256 }) => [path, sha256]));
for (const { path, sha256 } of incoming.files)
  if (hash(resolve(upstream, path)) !== sha256)
    throw new Error(`Frozen MnemoCode source changed: ${path}`);
// The owner's retained recorder hashes the compact JSON array, not the wallet report's text list.
const canonical = JSON.stringify(incoming.files);
if (createHash("sha256").update(canonical).digest("hex") !== incoming.fingerprint)
  throw new Error("The incoming source fingerprint does not match its full file inventory.");
const vendor = verifyMnemoCodeSource({ root });
for (const [source, target] of Object.entries(MNEMOCODE_FILES))
  if (
    hash(resolve(root, "packages/recovery-mnemocode/source", target)) !== upstreamPins.get(source)
  )
    throw new Error(`Vendored source differs from the handover: ${source}`);
const bridge = new MnemoCodeSskrSource(root).verify();
if (bridge.sourceFingerprint !== incoming.fingerprint) throw new Error("SSKR provenance is stale.");

const artifacts = {};
for (const edition of ["multi-chain", "dash-community"]) {
  const deriver =
    edition === "multi-chain" ? "Wallet_Key_Derivation_Tool" : "Dash_Community_Key_Derivation_Tool";
  const scanner =
    edition === "multi-chain" ? "Wallet_Discovery_Scanner" : "Dash_Community_Discovery_Scanner";
  artifacts[edition] = Object.fromEntries(
    [
      ["deriver", `dist/${edition}-edition/key-derivation/${deriver}.html`],
      ["scanner", `dist/${edition}-edition/discovery-scanner/${scanner}.html`],
    ].map(([tool, path]) => [tool, { path, sha256: hash(resolve(root, path)), html: read(path) }]),
  );
}
const hostPath = (stem, kind) =>
  stem.startsWith("../discovery-scanner/") || stem.startsWith("../key-derivation/")
    ? `apps/${stem.slice(3)}.ts`
    : stem.startsWith("../shared-ui/")
      ? `packages/${stem.slice(3)}.ts`
      : kind === "ui"
        ? `apps/key-derivation/src/ui/${stem}.ts`
        : `packages/recovery-backup/src/${stem}.ts`;
const rows = [
  ...OPERATIONS,
  [
    "mnemocode-table-look-up",
    "recovery-mnemocode-word-table",
    "mnemocode-word-table",
    "Word table: word, index or Unicode code lookup; full TSV export",
    "../key-derivation/tests/recovery-mnemocode-word-hints",
  ],
];
const previous = JSON.parse(
  read("../tmp/mnemocode-remediation-2026-10-14/browser-operation-checklist.json"),
);
const operations = rows.map(([control, ui, adapter, semantics, test], index) => {
  const controller = hostPath(ui, "ui");
  const owner = hostPath(adapter, "adapter");
  const candidates = test.startsWith("../")
    ? [hostPath(test, "adapter").replace(/\.ts$/u, ".test.ts")]
    : [
        `packages/recovery-backup/tests/${test}.test.ts`,
        `apps/key-derivation/tests/${test}.test.ts`,
      ];
  const regression = candidates.find((path) => existsSync(resolve(root, path)));
  if (regression === undefined) throw new Error(`No regression reference for ${control}`);
  for (const path of [controller, owner])
    if (!existsSync(resolve(root, path))) throw new Error(`No host owner: ${path}`);
  const scanner = control.startsWith("candidate-list-");
  const editions = Object.fromEntries(
    Object.entries(artifacts).map(([edition, files]) => {
      const file = files[scanner ? "scanner" : "deriver"];
      const offered = !(edition === "dash-community" && index === 5);
      const present = file.html.includes(`id="${control}"`);
      if (present !== offered) throw new Error(`Edition control mismatch: ${edition} ${control}`);
      return [
        edition,
        {
          offered,
          artifact: file.path,
          reason: offered
            ? "Source and artifact control traced; runtime browser acceptance unexecuted."
            : "Bitcoin key/WIF/xpub evidence is excluded from the Dash edition.",
        },
      ];
    }),
  );
  return {
    operation: previous.operations[index]?.operation ?? "Word table",
    library: previous.operations[index]?.library ?? "core/words.ts and core/word-hints.ts",
    hostNeeds: previous.operations[index]?.hostNeeds ?? "Public text/table download service",
    contract: OperationContract.at(index),
    control,
    controller,
    owner,
    semantics,
    regression,
    editions,
    bindingSha256: Object.fromEntries(
      [controller, owner, regression].map((path) => [path, hash(resolve(root, path))]),
    ),
    evidenceScope:
      "A source/regression reference and compiled control are not a claim that every scenario ran.",
  };
});

const packageManifest = JSON.parse(readFileSync(resolve(upstream, "package.json"), "utf8"));
const exportedParts = Object.entries(packageManifest.exports).map(([name, entry]) => {
  const source = entry.import.replace(/^\.\/dist\//u, "src/").replace(/\.js$/u, ".ts");
  const mapped = MNEMOCODE_FILES[source];
  if (mapped === undefined && !["src/index.ts", "src/sskr/index.ts"].includes(source))
    throw new Error(`Independently exported part not mapped: ${name}`);
  return {
    name,
    source,
    sourceSha256: upstreamPins.get(source),
    vendoredPath: mapped === undefined ? null : `packages/recovery-mnemocode/source/${mapped}`,
    role:
      mapped === undefined
        ? "Node aggregator: equivalent host-neutral operations and injected browser services; no Node filesystem/PTY imports."
        : "Portable library/service entry; internal helpers do not need separate UI controls.",
  };
});
const declarations = Object.entries(MNEMOCODE_FILES)
  .filter(([source]) => source.endsWith(".ts"))
  .map(([source, target]) => {
    const text = readFileSync(resolve(upstream, source), "utf8");
    return {
      source,
      target,
      exportedDeclarations: [
        ...text.matchAll(
          /^export (?:async )?(?:abstract )?(?:class|function|const|type|interface)\s+([A-Za-z_$][\w$]*)/gmu,
        ),
      ].map((match) => match[1]),
      role: /-self-test\.ts$/u.test(source)
        ? "Startup/full check owned by feature composition"
        : "Shared library/data contract used by owning workflows; not a standalone user operation",
    };
  });
const controls = Object.fromEntries(
  Object.entries(artifacts).map(([edition, files]) => [
    edition,
    Object.fromEntries(
      Object.entries(files).map(([tool, file]) => [
        tool,
        [
          ...file.html.matchAll(
            /<(input|select|textarea|button)\b[^>]*\bid="((?:mnemocode-|candidate-list-)[^"]+)"[^>]*>/gu,
          ),
        ].map(([tag, type, id]) => ({ id, type, markup: tag })),
      ]),
    ),
  ]),
);
const result = {
  incomingFingerprint: incoming.fingerprint,
  incomingFiles: incoming.files.length,
  vendorFiles: Object.keys(vendor.files).length,
  bridgePins: Object.keys(JSON.parse(read("packages/recovery-sskr-wasm/integrity.json"))).length,
  bridgeSource: bridge,
  operations,
  exportedParts,
  declarations,
  controls,
  artifacts: Object.values(artifacts).flatMap((files) =>
    Object.values(files).map(({ html: _html, ...record }) => record),
  ),
  substitutions: [
    "WebCrypto PBKDF2/X25519 and injected CSPRNG; offline document/worker lifetime instead of native process/PTY protection.",
    "Canvas image conversion instead of native Poppler; download and object-URL disposal instead of filesystem staging.",
    "Dash offers its own coin/address evidence plus master fingerprint; full edition offers every MnemoCode coin/reference.",
    "Broad color Unicode patterns remain symbolic through library admission; no eager expansion added by the host.",
    "CLI fresh-step screens, private-file flags and automatic terminal retry are host presentation; browser save/cancel ownership is separately traced.",
  ],
  missingConfirmedOperations: [],
  limitations: [
    "No real-browser acceptance or gallery/vector replay.",
    "Inventory distinguishes portable services and Node aggregators from user operations; it is not proof of absence of all defects.",
    "Wallet-tools canonical Docker comparison is pending; imported upstream pins are not a replacement.",
  ],
};
writeFileSync(resolve(evidence, output), JSON.stringify(result, null, 2) + "\n", {
  flag: "wx",
});
console.log(
  `Bound ${result.vendorFiles} vendor inputs, ${result.bridgePins} bridge pins, ${exportedParts.length} package entries and ${operations.length} operation areas to both edition artifacts; browsers unexecuted.`,
);

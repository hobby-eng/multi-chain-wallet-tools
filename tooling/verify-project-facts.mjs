import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_PROFILES, getToolBuild, profileToolIds } from "./build-profiles.mjs";
import { formatEnglishList, PRODUCT_FACTS, readReleaseMetadata } from "./project-metadata.mjs";
import { renderDashDistributionDocs } from "./sync-dash-distribution-docs.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const release = readReleaseMetadata(root);
renderDashDistributionDocs(root, "0".repeat(40));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const requireText = (text, expected, label) => {
  if (!text.includes(expected)) throw new Error(`${label} is out of sync; expected: ${expected}`);
};
const integerConstant = (text, name) => {
  const match = text.match(new RegExp(`export const ${name} = (\\d+);`, "u"));
  if (match === null) throw new Error(`Missing canonical constant ${name}.`);
  return Number(match[1]);
};

const dashProtocol = read("packages/network-boundary/src/dash-recovery-protocol.ts");
const publicProtocol = read("packages/network-boundary/src/public-recovery-protocol.ts");
const recoveryProtocol = read("packages/network-boundary/src/recovery-protocol.ts");
const identity = read("apps/discovery-scanner/src/coins/dash/identity-scanner.ts");
const requestProtocols = `${recoveryProtocol}\n${dashProtocol}\n${publicProtocol}`;
const networkOperationCount = new Set(
  [...requestProtocols.matchAll(/operation:\s*["']([^"']+)["']/gu)].map((match) => match[1]),
).size;
const coreBatch = integerConstant(dashProtocol, "RECOVERY_CORE_ADDRESS_BATCH");
const platformBatch = integerConstant(dashProtocol, "RECOVERY_PLATFORM_ADDRESS_BATCH");
const identityConcurrency = Number(
  identity.match(/^const IDENTITY_QUERY_CONCURRENCY = (\d+);/mu)?.[1],
);
if (!Number.isSafeInteger(identityConcurrency))
  throw new Error("Missing canonical Identity concurrency.");

const rootReadme = read("README.md");
const audit = read("SECURITY_AUDIT.md");
const architecture = read("docs/ARCHITECTURE.md");
const dashReport = read("docs/reference/DASH_IMPLEMENTATION.md");
const scannerSecurity = read("apps/discovery-scanner/SECURITY.md");
const scannerEstimate = read("apps/discovery-scanner/src/scan-estimate.ts");
const scannerRegistry = read("apps/discovery-scanner/src/coins/index.ts");
const multiChainDerivationRegistry = read(
  "packages/coin-protocols/src/coins/multi-chain-registry-profile.ts",
);
const buildProfiles = `${read("tooling/build-profiles.mjs")}\n${read("tooling/profile-template.mjs")}`;
const reproducibleBuildWrapper = read("tooling/build-reproducible.sh");

requireText(
  rootReadme,
  formatEnglishList(PRODUCT_FACTS.multiChainCoins),
  "README Multi-Chain coin list",
);
for (const capability of PRODUCT_FACTS.dashCommunityCapabilities) {
  requireText(audit, capability, "Dash Community capability list");
}
for (const [index, coinId] of PRODUCT_FACTS.multiChainCoinIds.entries()) {
  const adapterName = `${coinId.toUpperCase()}_RECOVERY_ADAPTER`;
  requireText(scannerRegistry, adapterName, `Multi-Chain discovery registry coin ${index + 1}`);
  requireText(
    multiChainDerivationRegistry,
    `${coinId.toUpperCase()}_COIN_ADAPTERS`,
    `Multi-Chain derivation registry coin ${index + 1}`,
  );
  requireText(
    buildProfiles,
    `<option value="${coinId}"`,
    `Multi-Chain Activity Viewer coin ${index + 1}`,
  );
}
for (const tool of PRODUCT_FACTS.tools) requireText(audit, tool, "Security audit tool list");
requireText(
  scannerSecurity,
  `only ${networkOperationCount} fixed read operations`,
  "Discovery network-operation count",
);
requireText(dashReport, `batches of ${coreBatch}`, "Dash Core batch size");
requireText(dashReport, `batches of ${platformBatch}`, "Dash Platform batch size");
requireText(
  dashReport,
  `At most ${identityConcurrency} Identity proof requests`,
  "Identity concurrency",
);
requireText(
  scannerEstimate,
  "about ${identities.toLocaleString()} identity proof calls per seed phrase",
  "Identity request estimate",
);

const multiChainReleaseManifest = `${BUILD_PROFILES["multi-chain"].releaseDirectory.replace(/^dist\//u, "")}/SHA256SUMS`;
requireText(
  reproducibleBuildWrapper,
  `expected_path=\"${multiChainReleaseManifest}\"`,
  "Canonical build wrapper release-manifest path",
);

for (const profile of Object.values(BUILD_PROFILES)) {
  for (const toolId of profileToolIds(profile)) {
    const relative = `dist/${getToolBuild(profile, toolId).artifactRelativePath}`;
    const documentation = `${rootReadme}\n${architecture}\n${read(`apps/${toolId}/README.md`)}`;
    requireText(documentation, relative, `${profile.editionName} ${toolId} artifact path`);
  }
}

const forbiddenCurrentText = [
  "Taproot_Key_Deriver.html",
  "Historical Bitcoin-only baseline",
  "Mnemonic recovery scanner",
  "currently its only adapter",
  "batches of 50",
  "only ten fixed read operations",
  "prior Recovery artifact",
];
for (const [path, text] of [
  ["README.md", rootReadme],
  ["SECURITY_AUDIT.md", audit],
  ["docs/reference/DASH_IMPLEMENTATION.md", dashReport],
  ["docs/ARCHITECTURE.md", architecture],
  ["apps/activity-viewer/README.md", read("apps/activity-viewer/README.md")],
  ["apps/discovery-scanner/README.md", read("apps/discovery-scanner/README.md")],
]) {
  for (const forbidden of forbiddenCurrentText) {
    if (text.includes(forbidden))
      throw new Error(`${path} contains stale current-release text: ${forbidden}`);
  }
}

function markdownFiles(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if ([".git", ".pnpm-store", "dist", "node_modules", "target"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) markdownFiles(path, output);
    else if (entry.name.endsWith(".md")) output.push(path);
  }
  return output;
}
for (const path of markdownFiles(root)) {
  const text = readFileSync(path, "utf8");
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    const target = match[1].split("#")[0];
    if (target === "" || /^[a-z]+:/iu.test(target)) continue;
    if (!existsSync(resolve(dirname(path), target)))
      throw new Error(`Broken relative Markdown link in ${path}: ${target}`);
  }
}

// GitHub renders a Markdown list "loose", as separate paragraphs with wider spacing than every other
// list, when a blank line separates two of its items or two blocks of one item. Audit records are
// frozen and vendored notices are upstream text, so both are left out.
const FROZEN_MARKDOWN = [
  "docs/audits/",
  "packages/recovery-mhfe-wasm/notices/",
  "packages/recovery-mnemocode/source/",
];
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/u;
const CODE_FENCE = /^\s*(?:```|~~~)/u;
const INDENTED_TEXT = /^\s{2,}\S/u;

/** The 1-based number of the first blank line that makes a list loose, or undefined. */
function looseListLine(lines) {
  let inFence = false;
  let inList = false;
  let blankInList = false;
  for (const [index, line] of lines.entries()) {
    if (CODE_FENCE.test(line)) {
      const indented = /^\s/u.test(line);
      // A fence opened with indentation right after a blank line is a second block of the item.
      if (!inFence && blankInList && indented) return index;
      // A fence at the left margin belongs to no list item, so it ends the list.
      if (!inFence && !indented) inList = false;
      inFence = !inFence;
      blankInList = false;
      continue;
    }
    if (inFence) continue;
    if (line.trim() === "") {
      if (inList) blankInList = true;
      continue;
    }
    if (LIST_ITEM.test(line) || (blankInList && INDENTED_TEXT.test(line))) {
      if (blankInList) return index;
      inList = true;
      continue;
    }
    if (blankInList || line.startsWith("#")) inList = false;
    blankInList = false;
  }
  return undefined;
}
for (const path of markdownFiles(root)) {
  const relativePath = path.slice(root.length + 1);
  if (FROZEN_MARKDOWN.some((prefix) => relativePath.startsWith(prefix))) continue;
  const line = looseListLine(readFileSync(path, "utf8").split("\n"));
  if (line !== undefined)
    throw new Error(
      `${relativePath}:${line} has a blank line inside a list, so GitHub renders it with wider spacing.`,
    );
}

requireText(
  read(`docs/releases/${release.tag}.md`),
  `# Multi-Chain Wallet Tools ${release.tag}`,
  "Current release notes",
);
console.log(
  `Verified current project facts for ${release.tag}: ${networkOperationCount} network operations, Core/Platform batches ${coreBatch}/${platformBatch}, Identity concurrency ${identityConcurrency}.`,
);

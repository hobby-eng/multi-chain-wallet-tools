import { isMainScript } from "./run-script.mjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_PROFILES, getToolBuild, profileToolIds } from "./build-profiles.mjs";
import { EVM_NETWORKS, evmProviderHosts } from "./evm-networks.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profile = BUILD_PROFILES["dash-community"];
const DASH_FORBIDDEN_ARTIFACT_PATTERNS = [
  [/\bbitcoin(?:\s+cash)?\b/iu, "Bitcoin"],
  [/\blitecoin\b/iu, "Litecoin"],
  [/\bdogecoin\b/iu, "Dogecoin"],
  [/\bethereum\b/iu, "Ethereum"],
  [/\bSilent Payments?\b/iu, "Silent Payments"],
  [/\bBIP[- ]?352\b/iu, "BIP-352"],
  [/bitcoin-(?:legacy|nested-segwit|native-segwit|taproot)/u, "Bitcoin adapter registration"],
  [/\bethereum\b/u, "Ethereum adapter registration"],
  [
    /\b(?:BIP49|BIP84|BIP86|EIP-55|P2SH-P2WPKH|P2WPKH|P2TR|Ethereum EOA)\b/u,
    "non-Dash protocol copy",
  ],
  [/Multi-Chain (?:Wallet Tools|Edition)/u, "Multi-Chain branding"],
  // The single-key coins of the Multi-Chain Deriver. "Zcash" alone is not one: Dash's Orchard notes
  // name Zcash's protocol, so the transparent adapter is found by its id.
  [/\bbitcoincash\b|\bCashAddr\b/iu, "Bitcoin Cash"],
  [/\b(?:XRP|Tron|Cosmos|Injective|Solana|Stellar|NEAR|Hedera)\b/u, "single-key coin"],
  [/\bzcash\b|Zcash transparent|\bTransparent · BIP44\b/u, "Zcash transparent adapter"],
  // The EVM networks of the connected tools, by name ("Base" is too common a word; the endpoint
  // pattern finds it), by endpoint and by their chain-id request.
  ...EVM_NETWORKS.filter(({ label }) => label !== "Base").map(({ label }) => [
    new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`, "u"),
    `EVM network ${label}`,
  ]),
  [
    new RegExp(
      [
        ...EVM_NETWORKS.flatMap(evmProviderHosts).map((host) => host.replaceAll(".", "\\.")),
        "\\beth_chainId\\b",
      ].join("|"),
      "u",
    ),
    "EVM endpoint",
  ],
];

const DASH_DERIVATION_ADAPTER_IDS = new Set([
  "dash-core",
  "dash-legacy-mobile",
  "dash-platform",
  "dash-identity",
  "dash-identity-funding",
  "dash-masternode",
  "dash-dashpay",
  "dash-multisig-p2sh",
  "dash-multisig-core-pkh",
  "dash-shielded",
]);
const DASH_RECOVERY_ADAPTER_IDS = new Set(["dash"]);

function registeredAdapterViolations(html) {
  const violations = [];
  const normalized = html.replaceAll('\\"', '"');
  for (const match of normalized.matchAll(/\bid:"([^"]+)",group:"([^"]+)"/gu)) {
    if (!DASH_DERIVATION_ADAPTER_IDS.has(match[1]) || match[2] !== "Dash") {
      violations.push(`non-Dash derivation adapter registration: ${match[1]}`);
    }
  }
  for (const match of normalized.matchAll(/\bid:"([^"]+)",label:"([^"]+)",networks:\[/gu)) {
    if (!DASH_RECOVERY_ADAPTER_IDS.has(match[1]) || match[2] !== "Dash") {
      violations.push(`non-Dash recovery adapter registration: ${match[1]}`);
    }
  }
  return violations;
}

/** The shortest base64 run taken for an embedded binary rather than text or code. */
const EMBEDDED_BINARY_RUN = 512;

/** Whether the UTF-16 code is a base64 character (A–Z, a–z, 0–9, "+", "/", "="). */
function isBase64Code(code) {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    code === 0x2b ||
    code === 0x2f ||
    code === 0x3d
  );
}

/**
 * `html` without its base64 runs of embedded WebAssembly, images and compressed data: a short word
 * could appear in them by chance, as "+XRP/" might, and no word of their content can, so the
 * lexical scan leaves them out. Adapter registrations are code, which no such run holds. A linear
 * scan, since a regular expression over a 12 MB run exhausts the stack.
 */
function withoutEmbeddedBinary(html) {
  const kept = [];
  let from = 0;
  let run = -1;
  for (let at = 0; at <= html.length; at += 1) {
    if (at < html.length && isBase64Code(html.charCodeAt(at))) {
      if (run < 0) run = at;
      continue;
    }
    if (run >= 0 && at - run >= EMBEDDED_BINARY_RUN) {
      kept.push(html.slice(from, run));
      from = at;
    }
    run = -1;
  }
  kept.push(html.slice(from));
  return kept.join("");
}

export function findDashArtifactViolations(html) {
  const protocolNeutralHtml = withoutEmbeddedBinary(html).replace(/(['"`])Bitcoin seed\1/gu, "");
  const lexicalViolations = DASH_FORBIDDEN_ARTIFACT_PATTERNS.filter(([pattern]) =>
    pattern.test(protocolNeutralHtml),
  ).map(([, label]) => label);
  return [...new Set([...lexicalViolations, ...registeredAdapterViolations(protocolNeutralHtml)])];
}

const DASH_INSPECTOR_SHARED_DECODER_ALLOWLIST = [
  // Refusal/descriptive branches in the shared descriptor decoder, no implementation on Dash.
  [/\bSilent Payments?\b/giu, 4, "Silent Payments shared-decoder terms"],
  [/\bBIP[- ]?352\b/giu, 1, "BIP-352 shared-decoder terms"],
  [/\bbitcoin\b/giu, 71, "Bitcoin shared-decoder terms"],
  [/\bP2WPKH\b/gu, 2, "P2WPKH shared-decoder terms"],
  [/\bP2TR\b/gu, 3, "P2TR shared-decoder terms"],
  [/\bTaproot\b/gu, 48, "Taproot shared-decoder terms"],
  [/\bMuSig(?:2)?\b/gu, 41, "MuSig shared-decoder terms"],
  [/\brawtr\b/gu, 13, "rawtr shared-decoder terms"],
  [/\bmulti_a\b/gu, 43, "multi_a shared-decoder terms"],
];

export function findDashInspectorArtifactViolations(html) {
  const scriptStart = html.indexOf("<script>");
  const scriptEnd = html.lastIndexOf("</script>");
  if (scriptStart < 0 || scriptEnd <= scriptStart)
    return ["missing Inspector inline script boundary"];
  const markup = html.slice(0, scriptStart) + html.slice(scriptEnd + "</script>".length);
  const allowedScopeCopy = markup
    .replaceAll("SegWit, Taproot, Schnorr, and MuSig2 are excluded", "")
    .replaceAll("SegWit, Taproot, Schnorr, MuSig2, and their PSBT fields are rejected", "");
  const violations = findDashArtifactViolations(allowedScopeCopy);
  for (const [pattern, maximum, label] of DASH_INSPECTOR_SHARED_DECODER_ALLOWLIST) {
    const count = [...html.matchAll(pattern)].length;
    if (count > maximum)
      violations.push(`${label} exceed reviewed allowlist: ${count} > ${maximum}`);
  }
  for (const [pattern, label] of [
    [/btcutil-js/u, "Bitcoin BIP322 implementation"],
    [/BIP0322-signed-message/u, "Bitcoin BIP322 message framing"],
    [/TapTweak/u, "Bitcoin Taproot tweak implementation"],
    [/keyAggregate/u, "Bitcoin MuSig2 aggregation implementation"],
    [/\bethereum\b/iu, "Ethereum code or copy"],
    [
      /\b(?:BIP49|BIP84|BIP86|EIP-55|P2SH-P2WPKH|Ethereum EOA)\b/u,
      "non-Dash protocol implementation",
    ],
  ])
    if (pattern.test(html)) violations.push(label);
  return [...new Set(violations)];
}

function verifyDashCommunityArtifacts(projectRoot = root) {
  for (const toolId of profileToolIds(profile)) {
    const tool = getToolBuild(profile, toolId);
    const path = resolve(projectRoot, "dist", tool.artifactRelativePath);
    const html = readFileSync(path, "utf8");
    for (const marker of [
      profile.editionName,
      `profile:"${profile.id}"`,
      `edition:"${profile.editionName}"`,
      `releaseRepository:"${profile.releaseRepository}"`,
      `<title>${tool.documentTitle}</title>`,
      ".primary{background:#008de4",
      /--bg:\s*#0b0f3b/u,
      "var(--dash-deep-blue)",
    ]) {
      if (typeof marker === "string" ? !html.includes(marker) : !marker.test(html)) {
        throw new Error(`${tool.artifactName} is missing Dash Community marker: ${marker}`);
      }
    }
    const violations =
      toolId === "psbt-inspector"
        ? findDashInspectorArtifactViolations(html)
        : findDashArtifactViolations(html);
    if (violations.length > 0) {
      throw new Error(
        `${tool.artifactName} contains forbidden non-Dash adapter, registration, or user-facing copy: ${violations.join(", ")}`,
      );
    }
    const digest = createHash("sha256").update(html).digest("hex");
    const sidecar = readFileSync(`${path}.sha256`, "utf8").trim();
    if (sidecar !== `${digest}  ${tool.artifactName}`) {
      throw new Error(
        `${tool.artifactName} metadata sidecar does not use the Dash Community filename.`,
      );
    }
  }

  const keyTool = getToolBuild(profile, "key-derivation");
  const keyArtifact = readFileSync(
    resolve(projectRoot, "dist", keyTool.artifactRelativePath),
    "utf8",
  );
  for (const adapterId of [
    "dash-core",
    "dash-legacy-mobile",
    "dash-platform",
    "dash-identity",
    "dash-identity-funding",
    "dash-masternode",
    "dash-dashpay",
    "dash-multisig-p2sh",
    "dash-multisig-core-pkh",
    "dash-shielded",
  ]) {
    if (!keyArtifact.includes(adapterId)) {
      throw new Error(`Dash Community key derivation artifact omitted ${adapterId}.`);
    }
  }
  console.log(
    "Verified Dash Community artifact branding, filenames, metadata, and non-Dash code/copy exclusion.",
  );
}

if (isMainScript(import.meta.url)) {
  verifyDashCommunityArtifacts();
}

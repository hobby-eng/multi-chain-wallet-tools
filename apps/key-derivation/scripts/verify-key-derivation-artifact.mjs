import {
  assertReviewedDynamicCode,
  assertRecordedChecksum,
  assertSingleDocument,
  currentArtifact,
  occurrences,
  uniqueIds,
} from "../../../tooling/artifact-checks.mjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBuildProfile } from "../../../tooling/build-profiles.mjs";
import {
  TON_PHRASE_SECURITY_URL,
  vendoredMnemoCodeVersion,
} from "../../../tooling/key-derivation-features.mjs";
import { assertDesktopVersionNote } from "../../../tooling/key-derivation-launchers.mjs";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const profile = parseBuildProfile();
const { tool, html, pagePath } = currentArtifact(root, profile, "key-derivation", "Standalone");
const wasmPaths = [
  ["Orchard", resolve(root, "packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm")],
  [
    "Codex32",
    resolve(root, "packages/recovery-codex32-wasm/generated/recovery_codex32_wasm_bg.wasm"),
  ],
  ["SSKR", resolve(root, "packages/recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm")],
  [
    "Gordian Envelope",
    resolve(root, "packages/recovery-envelope-wasm/generated/recovery_envelope_wasm_bg.wasm"),
  ],
  ["MHFE", resolve(root, "packages/recovery-mhfe-wasm/generated/runtime/mhfe.wasm")],
];
const rootPackage = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

assertSingleDocument(html, "standalone");
assertReviewedDynamicCode(html, "key-derivation");

const scriptStart = html.indexOf("<script>");
const scriptEnd = html.lastIndexOf("</script>");
if (scriptStart === -1 || scriptEnd <= scriptStart) {
  throw new Error("Standalone artifact has no inline application script.");
}
const inlineScript = html.slice(scriptStart + "<script>".length, scriptEnd);
try {
  // Parse without executing browser or cryptographic code.
  Function(inlineScript);
} catch (cause) {
  throw new Error(`Standalone application JavaScript is syntactically invalid: ${String(cause)}`);
}

const inlineScriptHash = `'sha256-${createHash("sha256").update(inlineScript).digest("base64")}'`;
const expectedCsp = `default-src 'none'; script-src ${inlineScriptHash} 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; worker-src blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
const csp = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?\s*>/su.exec(
  html,
)?.[1];
if (csp !== expectedCsp)
  throw new Error("Standalone artifact CSP changed from the reviewed offline policy.");
if (/script-src[^;]*'unsafe-inline'/u.test(csp)) {
  throw new Error(
    "Standalone CSP must authorize its immutable inline script by hash, not unsafe-inline.",
  );
}
// 'wasm-unsafe-eval' only compiles the embedded module; the separate
// 'unsafe-eval' keyword would additionally enable the Function constructor.
// The quotes matter: they are what distinguishes the two tokens.
if (csp.includes("'unsafe-eval'"))
  throw new Error("Standalone CSP must never grant 'unsafe-eval'.");
if (html.includes("__INLINE_SCRIPT_CSP__") || html.includes("/*__INLINE_")) {
  throw new Error("Standalone artifact still contains an unexpanded build marker.");
}
if (
  html.includes("MNEMOCODE_WALLET_FIELDS") ||
  /__MNEMOCODE_(?:PREFIX|WALLET_[A-Z_]+)__/u.test(html)
)
  throw new Error("Standalone artifact still contains an unexpanded MnemoCode wallet marker.");

const ids = uniqueIds(html, "Standalone artifact");
const requiredIds = [
  "derive-form",
  "recovery-workspace",
  "wallet-matcher-panel",
  "matcher-seeds",
  "matcher-passphrases",
  "matcher-addresses",
  "run-wallet-matcher",
  "slip39-panel",
  "slip39-source-mnemonic",
  "slip39-format",
  "create-slip39-shares",
  "slip39-shares",
  "restore-slip39-shares",
  "codex32-panel",
  "codex32-secret-type",
  "codex32-restore-type",
  "create-codex32",
  "restore-codex32",
  "sskr-panel",
  "create-sskr",
  "restore-sskr",
  "gordian-envelope-panel",
  "create-envelope",
  "restore-envelope",
  "derive-envelope-recipient",
  "mnemonic",
  "passphrase",
  "passphrase-need",
  "passphrase-help",
  "toggle-passphrase",
  "passphrase-warning",
  "seed-diagnostic",
  "seed-diagnostic-title",
  "generate-12",
  "generate-15",
  "generate-18",
  "generate-21",
  "generate-24",
  "generation-progress",
  "generation-line",
  "generation-count",
  "generation-stop",
  "generation-error",
  "generation-outlook",
  "generation-bits",
  "generation-time",
  "generation-note",
  "wallet-check-generation",
  "wallet-check-help",
  "wallet-check-enabled",
  "wallet-check-status",
  "wallet-check-options",
  "draw-threads",
  "draw-threads-note",
  "coin",
  "protocol-tabs",
  "network",
  "include-change-addresses",
  "derive-button",
  "cancel-derivation",
  "toggle-sensitive-values",
  "toggle-result-secrets",
  "copy-mnemonic",
  "account-descriptor-export",
  "open-account-export",
  "account-export-dialog",
  "close-account-export",
  "download-public-descriptors",
  "download-private-descriptors",
  "copy-watch-only",
  "download-watch-only",
  "download-selection",
  "watch-only-export",
  "clear-all",
  "main-recovery-source-menu",
  "seedqr-panel",
  "seedqr-create-result",
  "mnemocode-panel",
  "mnemocode-source",
  "encode-mnemocode",
  "mnemocode-encode-mode",
  "mnemocode-encode-format",
  "mnemocode-input",
  "decode-mnemocode",
  "mnemocode-decode-mode",
  "mnemocode-decode-format",
  "mnemocode-reencode-panel",
  "mnemocode-reencode-input",
  "mnemocode-reencode-mode",
  "mnemocode-reencode-format",
  "mnemocode-reencode-read",
  "mnemocode-reencode-result",
  "mnemocode-reencode-confirmation",
  "mnemocode-reencode-person",
  "mnemocode-reencode-wallet-check",
  "mnemocode-reencode-continue",
  "mnemocode-reencode-wallet-fingerprint",
  "mnemocode-reencode-wallet-passphrase",
  "mnemocode-reencode-status",
  "mnemocode-forgotten-panel",
  "mnemocode-forgotten-mode",
  "mnemocode-forgotten-format",
  "mnemocode-forgotten-phrase",
  "mnemocode-forgotten-search",
  "mnemocode-split-section",
  "mnemocode-table-export-format",
  "mnemocode-table-save",
  "mnemocode-table-guide",
  "mnemocode-table-export-status",
  "mnemocode-table-full-set",
  "mnemocode-split",
  "mnemocode-restore-panel",
  "mnemocode-restore-shares",
  "mnemocode-restore",
  "mnemocode-forgotten-shares",
  "mnemocode-forgotten-shares-repair",
  "mnemocode-cards-section",
  "mnemocode-card-template",
  "export-mnemocode-cards",
  "mhfe-panel",
  "mhfe-source",
  "mhfe-container",
  "mhfe-encrypt",
  "mhfe-rekey-wallet-passphrase",
  "mhfe-decrypt",
  "mhfe-runtime",
  "matcher-seed-lines",
  "matcher-passphrase-lines",
  "matcher-address-lines",
  "results",
  "result-branch-tabs",
  "result-receive-tab",
  "result-change-tab",
  "branch-result-content",
  "address-list",
  "build-version",
  "build-date",
  "build-edition",
  "build-profile",
  "worker-runtime",
  "build-fingerprint",
  "crypto-self-test-status",
  "crypto-self-test-details",
  "artifact-checksum-file",
];
if (
  new Set(requiredIds).size !== requiredIds.length ||
  requiredIds.some((id) => !/^[A-Za-z][\w:.-]*$/u.test(id))
) {
  throw new Error("Key Derivation verifier contains an invalid or duplicate required element id.");
}
for (const requiredId of requiredIds) {
  if (!ids.includes(requiredId))
    throw new Error(`Standalone artifact is missing required element #${requiredId}.`);
}
if (profile.capabilities.bip85) {
  for (const requiredId of [
    "include-bip85",
    "bip85-tab",
    "bip85-words",
    "bip85-wallet-toggle-secrets",
    "bip85-wallet-export-format",
    "bip85-wallet-account-export-dialog",
    "bip85-recovery-source-menu",
  ]) {
    if (!ids.includes(requiredId))
      throw new Error(`BIP85 workspace is missing required element #${requiredId}.`);
  }
  for (const words of [12, 15, 18, 21, 24]) {
    if (!html.includes(`<option>${words}</option>`)) {
      throw new Error(`BIP85 workspace is missing the ${words}-word BIP39 option.`);
    }
  }
}
for (const match of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/gu)) {
  if (!ids.includes(match[1])) throw new Error(`Label references missing control #${match[1]}.`);
}

const required = [
  "<!doctype html>",
  "connect-src 'none'",
  "worker-src blob:",
  "'wasm-unsafe-eval'",
  "Wallet Key Derivation Tool",
  "Recovery seed phrase",
  "Seed Diagnostic",
  "BIP32 master fingerprint",
  "Show phrase",
  "Show private keys",
  "Derivation type",
  "dash-identity",
  "dash-identity-funding",
  "dash-masternode",
  "dash-dashpay",
  "protocol-text-controls",
  "dash-legacy-mobile",
  "DIP13",
  "Official Platform Wallet v5.0.3",
  "Identity ID",
  "Also generate change addresses",
  "Receive addresses",
  "Change addresses",
  "Payment QR",
  "Encoded payload:",
  "aria-haspopup",
  "Watch-only export",
  "Cancel",
  "Save selected",
  "Release passport",
  "Embedded dependency versions and licenses:",
  "passport-mnemocode-dependency",
  "passport-mhfe-dependency",
  "Cryptographic self-test running",
  "Dedicated Web Worker",
  "wallet-key-derivation",
  'type:"ready"',
  "The derivation worker stopped unexpectedly.",
  "Only this visible window is kept in the page DOM.",
  "Confirm large request",
  "visibilitychange",
  "ACCOUNT-SCOPED MATERIAL",
  "dashified-0.14.1",
];
for (const marker of required) {
  if (!html.includes(marker))
    throw new Error(`Standalone artifact is missing required marker: ${marker}`);
}
for (const marker of [profile.editionName, profile.id, tool.documentTitle]) {
  if (!html.includes(marker))
    throw new Error(`Standalone artifact is missing profile marker: ${marker}`);
}
if (
  profile.id === "dash-community" &&
  !html.includes("Dash master/account extended-key integrity")
) {
  throw new Error("Dash Community artifact is missing its Dash-only extended-key startup vector.");
}
// The single-key coins' startup vectors come with the full Multi-Chain build (CORE-31). Their check
// names are built at run time, so the markers are the vectors' literal first addresses.
if (profile.id === "multi-chain")
  for (const marker of [
    "LUWPbpM43E2p7ZSh8cyTBEkvpHmr3cB8Ez",
    "DBus3bamQjgJULBJtYXpEzDWQRwF5iwxgC",
    "bitcoincash:qqyx49mu0kkn9ftfj6hje6g2wfer34yfnq5tahq3q6",
    "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F",
    "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3",
    "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH",
    "0xFA22515E43658ce56A7682B801e9B5456f511420",
    "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4",
    "inj1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dz",
    "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
    "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX",
    "5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412",
    "0xC283f34aDafdB758a557304C5F5e4c1E0A554713",
    "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY",
    "UQAhEnZmOZ4XCJ1BKsvvt4D1DobiFgIf8nbZdTiT0l-8mOpj",
    "UQDSLOFVamNZzdy4LulclcCBEFkRReZ7WscBCLAw3Pg53h3h",
    // Cardano's: cardano-serialization-lib's mainnet base and stake addresses.
    "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwqfjkjv7",
    "stake1uyevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqxdekzz",
  ])
    if (!html.includes(marker))
      throw new Error(
        `Multi-Chain artifact is missing a single-key coin startup vector: ${marker}`,
      );
for (const marker of [
  "Wallet Matcher / Derivation Discovery",
  "SeedSigner SeedQR",
  `MnemoCode ${vendoredMnemoCodeVersion()}`,
  // The guide itself is in MnemoCode's WebAssembly; mnemocode-public-references reads it.
  "mnemocode-manual-recovery.md",
  "MHFE encrypted BIP39 backup",
  "MHFE specification",
  'aria-label="MHFE operation"',
  "Import QR images",
  // The passport names the locked QR reader; tooling/verify-project-facts.mjs checks the same.
  `qr ${rootPackage.dependencies.qr}`,
  "CompactSeedQR",
  // A SeedQR hidden in a decoy QR, with MnemoCode in both editions.
  'id="seedqr-qr-form-hidden"',
  "SLIP-39 mnemonic shares",
  'aria-label="SeedQR operation"',
  'aria-label="SLIP-39 operation"',
  'aria-label="Codex32 operation"',
  'aria-label="SSKR operation"',
  'aria-label="Seed Envelope operation"',
  "Codex32 · BIP93",
  "SSKR · Blockchain Commons",
  "Gordian Seed Envelope",
  "Mnemonic construction details",
  "seed-construction-details",
  "seed-word-table",
  "entropyBinary",
  "providedChecksum",
  "expectedChecksum",
  "BIP39 index",
  "Search every supported coin and derivation profile",
  "SeedQR encode/decode",
  "Decoy QR texts: vCard and Wi-Fi escaping",
  "SLIP-39 official + encode/decode",
  "encode/decode",
  "Codex32 official + entropy encode/decode",
  "SSKR BCR-2020-011 grouped vector",
  "SSKR Compact UR encode/decode",
  "SSKR Bytewords encode/decode",
  "BIP85 BIP39 / WIF / XPRV / HEX",
  "Gordian Seed Envelope encrypted entropy/passphrase encode/decode",
]) {
  if (!html.includes(marker))
    throw new Error(`Standalone artifact is missing recovery workspace marker: ${marker}`);
}
// One popover per method: nine methods are in Recover & Back Up.
if (occurrences(html, "<summary>What is this?</summary>") !== 9) {
  throw new Error("Every Recover & Back Up method must include one explanatory help popover.");
}
if (profile.id === "dash-community") {
  for (const marker of [
    "matcher-targets-multichain",
    "bitcoin-taproot",
    "bitcoin-native-segwit",
    "adapterIds:['ethereum']",
    // The single-key coins, by their adapter ids and names.
    "litecoin-native-segwit",
    "bitcoin-cash-coin-type-0",
    "ethereum-classic",
    "Injective",
    "solana-ledger",
    "hedera-ecdsa",
    "Stellar",
    "ton-trust",
    "ton-generation",
    "TON default seed",
    "TON seed version",
    "Telegram wallet",
    "TON check",
  ]) {
    if (html.includes(marker)) {
      throw new Error(
        `Dash Community artifact contains excluded multi-chain matcher marker: ${marker}`,
      );
    }
  }
}
if (occurrences(html, "Embedded dependency versions and licenses") !== 1) {
  throw new Error("Dependency versions must appear exactly once inside the Release passport.");
}
if (html.includes('<details class="dependency-info">')) {
  throw new Error(
    "The obsolete duplicated dependency disclosure remains outside the Release passport.",
  );
}
if (html.includes("Advanced cryptographic details")) {
  throw new Error("Advanced result fields are still hidden behind a redundant disclosure control.");
}
if (ids.includes("toggle-input-secrets")) {
  throw new Error(
    "Standalone artifact still contains the obsolete duplicate recovery-source reveal control.",
  );
}
if (
  html.includes(
    "To inspect activity on a connected computer, use the separate Wallet_Activity_Viewer.html",
  )
) {
  throw new Error(
    "Standalone artifact still contains the removed repeated Shielded viewer notice.",
  );
}

const forbidden = [
  [/\bfetch\s*\(/u, "fetch"],
  [/\bXMLHttpRequest\b/u, "XMLHttpRequest"],
  [/\bWebSocket\b/u, "WebSocket"],
  [/\bEventSource\b/u, "EventSource"],
  [/\bRTCPeerConnection\b/u, "WebRTC"],
  [/\bWebTransport\b/u, "WebTransport"],
  [/\bsendBeacon\b/u, "sendBeacon"],
  [/\blocalStorage\b/u, "localStorage"],
  [/\bsessionStorage\b/u, "sessionStorage"],
  [/\bindexedDB\b/u, "IndexedDB"],
  [/\bMath\.random\b/u, "Math.random"],
  [/\binnerHTML\b/u, "innerHTML"],
  [/\bouterHTML\b/u, "outerHTML"],
  [/\binsertAdjacentHTML\b/u, "insertAdjacentHTML"],
  [/\bdocument\.cookie\b/u, "cookie access"],
  [/\bdata-(?:copy-value|value)\s*=/iu, "secret-bearing data attribute"],
  [/sourceMappingURL/u, "source map reference"],
  [/https?:\/\//iu, "HTTP URL"],
  [/(?:src|href)\s*=\s*["'](?:https?:|\/\/|\.\/|\.\.\/|file:)/iu, "external or sibling resource"],
];
const allowedOpenSourceLinks = [
  "https://github.com/SeedSigner/seedsigner/tree/dev/docs/seed_qr",
  "https://github.com/unjs/uqr",
  "https://github.com/paulmillr/qr",
  "https://github.com/hobby-eng/mnemocode",
  "https://github.com/trezor/python-shamir-mnemonic",
  "https://github.com/BlockchainCommons/bc-sskr-rust",
  "https://github.com/BlockchainCommons/bc-envelope-rust",
  "https://github.com/BlockchainCommons/bc-components-rust",
  "https://github.com/apoelstra/rust-codex32",
  "https://github.com/hobby-eng/mhfe-spec",
  "https://github.com/hobby-eng/mhfe",
  // The security note that the "?" of the Telegram option links to, only in a build with TON.
  ...(ids.includes("ton-generation") ? [TON_PHRASE_SECURITY_URL] : []),
];
let securityScanSource = html.replaceAll("http://www.w3.org/2000/svg", "");
for (const link of allowedOpenSourceLinks) {
  const marker = `href="${link}"`;
  if (occurrences(securityScanSource, marker) !== 1) {
    throw new Error(`Expected exactly one reviewed open-source documentation link: ${link}`);
  }
  securityScanSource = securityScanSource.replace(marker, 'href="#reviewed-open-source-source"');
}
for (const [pattern, label] of forbidden) {
  if (pattern.test(securityScanSource))
    throw new Error(`Standalone artifact contains forbidden ${label}.`);
}
for (const [label, wasmPath] of wasmPaths) {
  const expectedWasmBase64 = readFileSync(wasmPath).toString("base64");
  const wasmCopies = occurrences(html, expectedWasmBase64);
  if (wasmCopies !== 1)
    throw new Error(`Expected exactly one embedded ${label} WASM module; found ${wasmCopies}.`);
}
const wordlistMarker = "abandon\nability\nable\nabout\nabove\nabsent";
const escapedWordlistMarker = "abandon\\nability\\nable\\nabout\\nabove\\nabsent";
const wordlistCopies = occurrences(html, wordlistMarker) + occurrences(html, escapedWordlistMarker);
if (wordlistCopies !== 1)
  throw new Error(`Expected exactly one embedded BIP39 English wordlist; found ${wordlistCopies}.`);
for (const deceptiveWipe of [".repeat(mnemonicLength)", ".repeat(passphraseLength)"]) {
  if (html.includes(deceptiveWipe))
    throw new Error("Artifact contains a misleading JavaScript string-overwrite pattern.");
}

assertDesktopVersionNote(html, profile);
const actual = assertRecordedChecksum(html, pagePath, tool.artifactName, "Standalone artifact");
console.log(`Verified standalone offline artifact: ${actual}`);

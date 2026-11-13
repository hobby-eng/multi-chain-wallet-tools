import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MNEMOCODE_WASM_DIRECTORY } from "./sync-mnemocode-wasm.mjs";
import { removeElementById } from "./html-elements.mjs";
import { SOURCE_REPOSITORY_URL } from "./project-metadata.mjs";
import { ToolBuildPolicy } from "./tool-build-policy.mjs";
import { commaOptionValues, requestedArtifact } from "./tool-feature-options.mjs";
import { TOOL_MANIFESTS } from "./tool-manifests.mjs";

export const KEY_DERIVATION_COINS = TOOL_MANIFESTS["key-derivation"].coins;
export const KEY_DERIVATION_FEATURES = TOOL_MANIFESTS["key-derivation"].features;

const RECOVERY_FEATURES = Object.freeze([
  "wallet-matcher",
  "multisig",
  "seedqr",
  "mnemocode",
  "mhfe",
  "slip39",
  "codex32",
  "sskr",
  "gordian-envelope",
]);

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MNEMOCODE_VERSION_MARKER = "__MNEMOCODE_VERSION__";
const TON_PHRASE_SECURITY_MARKER = "__TON_PHRASE_SECURITY_URL__";

/**
 * The security note that the "?" of the option "Generate a phrase the Telegram wallet accepts" links
 * to: `path` from the repository root, and `anchor` the id GitHub gives the note's heading.
 */
export const TON_PHRASE_SECURITY_NOTE = Object.freeze({
  path: "apps/key-derivation/SECURITY.md",
  anchor: "a-phrase-the-telegram-wallet-accepts-protected-with-mhfe",
});

/** The note on GitHub, on the main branch. */
export const TON_PHRASE_SECURITY_URL = `${SOURCE_REPOSITORY_URL}/blob/main/${TON_PHRASE_SECURITY_NOTE.path}#${TON_PHRASE_SECURITY_NOTE.anchor}`;

/** The manifest of the multi-chain Deriver's MnemoCode file; every profile has the same version. */
const MNEMOCODE_MANIFEST = `${MNEMOCODE_WASM_DIRECTORY}/generated/multi-chain/key-derivation/modules.json`;

/**
 * Version of the vendored MnemoCode WebAssembly. The page shows this value and has no version
 * text of its own, so an update of MnemoCode cannot leave an old number on the page.
 */
export function vendoredMnemoCodeVersion() {
  const { version } = JSON.parse(readFileSync(resolve(PROJECT_ROOT, MNEMOCODE_MANIFEST), "utf8"));
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/u.test(version))
    throw new Error(`${MNEMOCODE_MANIFEST} has no usable version.`);
  return version;
}

export function parseKeyDerivationFeatures(profile, args = process.argv.slice(2)) {
  const policy = new ToolBuildPolicy("key-derivation", profile);
  const included = policy.normalize(commaOptionValues(args, "--features"), "--features");
  const excluded = policy.normalize(commaOptionValues(args, "--exclude"), "--exclude");
  const includedCoins = policy.normalize(commaOptionValues(args, "--coins"), "--coins");
  const excludedCoins = policy.normalize(
    commaOptionValues(args, "--exclude-coins"),
    "--exclude-coins",
  );
  const coins = policy.coins(includedCoins, excludedCoins);
  const profileDefaults = policy.defaultFeatures(coins);
  const ordered = policy.features(coins, included, excluded);
  const selectedCoins = new Set(coins);
  const selected = new Set(ordered);
  const custom =
    included.length + excluded.length + includedCoins.length + excludedCoins.length > 0;
  return Object.freeze({
    custom,
    coins: Object.freeze(KEY_DERIVATION_COINS.filter((coin) => selectedCoins.has(coin))),
    hasCoin: (coin) => selectedCoins.has(coin),
    selected: Object.freeze(ordered),
    excluded: Object.freeze(profileDefaults.filter((feature) => !selected.has(feature))),
    has: (feature) => selected.has(feature),
    hasRecovery: RECOVERY_FEATURES.some((feature) => selected.has(feature)),
    // The Dash Community Edition names no other coin, not even as the first of a list.
    dashCommunity: profile.id === "dash-community",
  });
}

export function customKeyDerivationArtifact(root, profile, features, requestedOutput) {
  if (!features.custom && requestedOutput === undefined) return undefined;
  if (requestedOutput !== undefined) return requestedArtifact(root, requestedOutput);
  const slug = `${features.coins.join("-")}__${features.selected.join("_")}`;
  return resolve(root, "dist", "custom-builds", profile.id, `Key_Derivation_${slug}.html`);
}

function removeBalancedElement(source, id) {
  return removeElementById(source, id, "Key Derivation template");
}

function removeButtons(source, attribute, value) {
  const pattern = new RegExp(
    `<button\\b(?=[^>]*\\b${attribute}=["']${value}["'])[^>]*>[\\s\\S]*?<\\/button>`,
    "giu",
  );
  return source.replace(pattern, "");
}

export function applyKeyDerivationFeatureTemplate(template, features) {
  let rendered = template
    .replaceAll(MNEMOCODE_VERSION_MARKER, vendoredMnemoCodeVersion())
    .replaceAll(TON_PHRASE_SECURITY_MARKER, TON_PHRASE_SECURITY_URL);
  for (const coin of ["bitcoin", "dash"]) {
    if (features.hasCoin(coin)) continue;
    rendered = rendered.replace(
      new RegExp(`<option\\b(?=[^>]*\\bdata-coin=["']${coin}["'])[^>]*>[^<]*<\/option>`, "giu"),
      "",
    );
  }
  if (!features.hasCoin("bitcoin") && !features.hasCoin("dash")) {
    rendered = rendered.replace(/<option value=["']wif["'][^>]*>[^<]*<\/option>/giu, "");
  }
  const panels = {
    "wallet-matcher": "wallet-matcher-panel",
    multisig: "multisig-panel",
    seedqr: "seedqr-panel",
    mnemocode: "mnemocode-panel",
    mhfe: ["mhfe-panel", "wallet-check-generation"],
    slip39: "slip39-panel",
    codex32: "codex32-panel",
    sskr: "sskr-panel",
    "gordian-envelope": "gordian-envelope-panel",
  };
  for (const [feature, ids] of Object.entries(panels)) {
    if (features.has(feature)) continue;
    for (const id of Array.isArray(ids) ? ids : [ids]) {
      rendered = removeBalancedElement(rendered, id);
      rendered = removeButtons(rendered, "aria-controls", id);
    }
    const menuTarget = feature === "wallet-matcher" ? "matcher" : feature;
    rendered = removeButtons(rendered, "data-recovery-target", menuTarget);
  }
  // Without Bitcoin the Bitcoin key evidence leaves every wallet question. The address stays: it
  // names its coin, and every build has a coin whose addresses MnemoCode compares
  // (packages/recovery-backup/src/mnemocode-offered-coins.ts).
  const parts = features.hasCoin("bitcoin")
    ? []
    : ["key-row", "key-help", "key-field", "network-field"];
  for (const prefix of [
    "mnemocode-forgotten",
    "mnemocode-restore",
    "mnemocode-forgotten-shares",
    "mnemocode-decode",
    "mnemocode-reencode",
  ])
    for (const part of parts)
      rendered = removeBalancedElement(rendered, `${prefix}-wallet-${part}`);
  // MnemoCode's shares need the SSKR library: without it, MnemoCode has no share tabs.
  if (features.has("mnemocode") && !features.has("sskr")) {
    rendered = removeBalancedElement(rendered, "mnemocode-split-section");
    rendered = removeBalancedElement(rendered, "mnemocode-restore-panel");
    rendered = removeButtons(rendered, "aria-controls", "mnemocode-restore-panel");
    rendered = removeBalancedElement(rendered, "mnemocode-forgotten-kind-share-row");
    rendered = removeBalancedElement(rendered, "mnemocode-heirs-backup-shares-row");
    rendered = removeBalancedElement(rendered, "mnemocode-card-source-field");
    rendered = removeBalancedElement(rendered, "mnemocode-card-share-qr-row");
    rendered = removeBalancedElement(rendered, "mnemocode-forgotten-share");
  }
  // A SeedQR hidden in a decoy QR keeps its record with MnemoCode's hidden QR: without MnemoCode,
  // the SeedQR tab makes and reads ordinary SeedQRs only.
  if (features.has("seedqr") && !features.has("mnemocode"))
    for (const id of ["seedqr-qr-form", "seedqr-decoy", "seedqr-hidden-decode-note"])
      rendered = removeBalancedElement(rendered, id);
  // A TON phrase's option and note come with TON (tooling/single-key-coins.mjs TON_PHRASE_MODULES),
  // and so does the link of its "?".
  if (!features.hasCoin("ton")) rendered = removeBalancedElement(rendered, "ton-generation");
  // The child wallet's note on its one Cardano tab, and the Matcher's on Cardano's roles, come with
  // Cardano.
  if (!features.hasCoin("cardano"))
    for (const id of ["bip85-wallet-cardano-note", "matcher-cardano-note"])
      rendered = removeBalancedElement(rendered, id);
  // The passport names only what this build contains.
  if (!features.has("mhfe")) rendered = removeBalancedElement(rendered, "passport-mhfe-dependency");
  if (!features.has("mnemocode"))
    rendered = removeBalancedElement(rendered, "passport-mnemocode-dependency");
  if (!features.has("mnemocode-cards")) {
    rendered = removeBalancedElement(rendered, "mnemocode-cards-section");
    rendered = removeBalancedElement(rendered, "mnemocode-heirs-section");
  }
  if (!features.has("bip38-encrypt"))
    rendered = removeBalancedElement(rendered, "bulk-bip38-panel");
  if (!features.has("message-signing"))
    rendered = removeBalancedElement(rendered, "message-signer-dialog");
  if (!features.hasRecovery) {
    rendered = removeBalancedElement(rendered, "recovery-workspace");
    rendered = removeBalancedElement(rendered, "recovery-backup-mode");
    rendered = rendered.replace(
      new RegExp(
        `<details\\b[^>]*class=[\"'][^\"']*recovery-source-menu[^\"']*[\"'][^>]*>[\\s\\S]*?</details>`,
        "giu",
      ),
      "",
    );
  }
  return rendered;
}

/**
 * The page's derivation feature modules of a build, as [feature, file in apps/key-derivation/src/ui,
 * exported installer]: each optional feature's, and a coin's own (the TON phrase comes with TON,
 * Cardano's phrase seed readers with Cardano).
 */
export function derivationFeatureModules(features) {
  return [
    ["bip85", "bip85-feature.ts", "installBip85Feature"],
    ["silent-payments", "silent-payment-feature.ts", "installSilentPaymentFeature"],
    ["mhfe", "checked-mnemonic-feature.ts", "installCheckedMnemonicFeature"],
  ]
    .filter(([feature]) => features.has(feature))
    .concat(
      features.hasCoin("ton") ? [["ton", "ton-phrase-feature.ts", "installTonPhraseFeature"]] : [],
    )
    .concat(
      // Cardano's Icarus variants read their CIP-3 roots on the page (tooling/single-key-coins.mjs).
      features.hasCoin("cardano")
        ? [["cardano", "cardano-seed-sources.ts", "phraseSeedReaders"]]
        : [],
    );
}

export function featureDefines(features) {
  return { __CKD_HAS_RECOVERY__: features.hasRecovery ? "true" : "false" };
}

export function describeCustomArtifact(path) {
  return basename(path);
}

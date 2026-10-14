import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MNEMOCODE_MANIFEST } from "./sync-mnemocode-source.mjs";
import { removeElementById } from "./html-elements.mjs";
import { ToolBuildPolicy } from "./tool-build-policy.mjs";
import { commaOptionValues, requestedArtifact } from "./tool-feature-options.mjs";
import { TOOL_MANIFESTS } from "./tool-manifests.mjs";

export const KEY_DERIVATION_COINS = TOOL_MANIFESTS["key-derivation"].coins;
export const KEY_DERIVATION_FEATURES = TOOL_MANIFESTS["key-derivation"].features;

const RECOVERY_FEATURES = Object.freeze([
  "wallet-matcher",
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

/**
 * Version of the vendored MnemoCode sources. The page shows this value and has no version
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
  let rendered = template.replaceAll(MNEMOCODE_VERSION_MARKER, vendoredMnemoCodeVersion());
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
  // Without Bitcoin the Bitcoin address and key evidence leaves every wallet question. "Address of
  // another coin" stays where the build offers a coin besides Bitcoin, Dash or Ethereum (every coin
  // of MnemoCode's in the full build; packages/recovery-backup/src/mnemocode-offered-coins.ts), with
  // its place and count of addresses. Without any of them, MnemoCode recognises a wallet by its
  // master fingerprint only.
  const offersCoins = features.hasCoin("dash") || features.hasCoin("ethereum");
  const parts = [
    ...(features.hasCoin("bitcoin")
      ? []
      : [
          "address-row",
          "key-row",
          "located-help",
          "address-field",
          "key-field",
          "profile-row",
          "network-field",
        ]),
    ...(offersCoins ? [] : ["coin-row", "coin-field", "coin-help"]),
    ...(features.hasCoin("bitcoin") || offersCoins ? [] : ["location-field", "addresses-field"]),
  ];
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
  // The passport names only what this build contains.
  if (!features.has("mhfe")) rendered = removeBalancedElement(rendered, "passport-mhfe-dependency");
  if (!features.has("mnemocode-cards")) {
    rendered = removeBalancedElement(rendered, "mnemocode-cards-section");
    rendered = removeBalancedElement(rendered, "mnemocode-heirs-section");
    // The passport names only what this build contains.
    rendered = removeBalancedElement(rendered, "passport-mnemocode-cards-dependency");
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

export function featureDefines(features) {
  return { __CKD_HAS_RECOVERY__: features.hasRecovery ? "true" : "false" };
}

export function describeCustomArtifact(path) {
  return basename(path);
}

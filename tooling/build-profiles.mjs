import { BUILD_PROFILES, TOOL_DEFINITIONS } from "./build-profile-definitions.mjs";
import { mnemocodeWasmFiles } from "./sync-mnemocode-wasm.mjs";
export { BUILD_PROFILES } from "./build-profile-definitions.mjs";

export function parseBuildProfile(args = process.argv.slice(2)) {
  const inline = args.find((arg) => arg.startsWith("--profile="));
  const index = args.indexOf("--profile");
  const id =
    inline?.slice("--profile=".length) ??
    (index >= 0 ? args[index + 1] : undefined) ??
    "multi-chain";
  const profile = BUILD_PROFILES[id];
  if (profile === undefined) {
    throw new Error(`Unknown build profile "${id}". Expected multi-chain or dash-community.`);
  }
  return profile;
}

export function getToolBuild(profile, toolId) {
  const definitions = TOOL_DEFINITIONS[toolId];
  if (definitions === undefined) throw new Error(`Unknown standalone tool: ${toolId}.`);
  const tool = profile.id === "dash-community" ? definitions.dashCommunity : definitions.multiChain;
  if (tool === undefined)
    throw new Error(
      `Standalone tool "${toolId}" is not available in the ${profile.id} build profile.`,
    );
  return {
    ...tool,
    buildScript: definitions.buildScript,
    artifactRelativePath: `${tool.artifactDirectory}/${tool.artifactName}`,
    checksumFile: `${tool.artifactName}.sha256`,
  };
}

export function profileToolIds(profile) {
  return Object.entries(TOOL_DEFINITIONS)
    .filter(
      ([, definitions]) =>
        (profile.id === "dash-community" ? definitions.dashCommunity : definitions.multiChain) !==
        undefined,
    )
    .map(([toolId]) => toolId)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

export { applyProfileTemplate } from "./profile-template.mjs";

export function profileArtifacts(profile) {
  return profileToolIds(profile)
    .map((toolId) => getToolBuild(profile, toolId).artifactRelativePath)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

const DASH_SHARED_INPUTS = new Set([
  "packages/secret-boundary/src/public-input-guard.ts",
  "packages/secret-boundary/src/private-material-error.ts",
  "packages/secret-boundary/src/public-input-guard-self-test.ts",
  "packages/secret-boundary/src/secret-guard.ts",
  "packages/network-boundary/src/protocol.ts",
  "packages/network-boundary/src/transport-protocol.ts",
  "packages/network-boundary/src/iframe-protocol.ts",
  "packages/network-boundary/src/dash-recovery-protocol.ts",
  "packages/network-boundary/src/public-recovery-protocol.ts",
  "packages/network-boundary/src/recovery-protocol.ts",
  "packages/network-boundary/src/data-types.ts",
  "packages/network-boundary/src/bounded-fetch.ts",
  "packages/network-boundary/src/bounded-json.ts",
  "packages/network-boundary/src/recovery-history.ts",
  "packages/network-boundary/src/client.ts",
  "packages/network-boundary/src/worker-runtime.ts",
  "packages/secret-vault/src/worker-bootstrap.ts",
  "packages/wallet-recovery/src/watch-only.ts",
  "packages/wallet-recovery/src/watch-only/types.ts",
  "packages/wallet-recovery/src/watch-only/dash.ts",
  "packages/wallet-recovery/src/watch-only/dash-profile.ts",
  "packages/wallet-recovery/src/address-search.ts",
  "packages/wallet-recovery/src/local-search-admission.ts",
  "packages/wallet-recovery/src/local-search-queue.ts",
  "packages/wallet-recovery/src/local-search-self-test.ts",
  "packages/wallet-recovery/src/recovery-source.ts",
  "packages/wallet-recovery/src/matcher-types.ts",
  "packages/wallet-recovery/src/matcher-plan.ts",
  "packages/wallet-recovery/src/matcher-scope.ts",
  "packages/wallet-recovery/src/matcher-secrets.ts",
  "packages/wallet-recovery/src/matcher-targets-dash.ts",
  "packages/wallet-recovery/src/matcher-targets.ts",
  "packages/recovery-backup/src/slip39.ts",
  "packages/recovery-backup/src/slip39-passphrase.ts",
  "packages/recovery-backup/src/slip39-restore-request.ts",
  "packages/recovery-backup/src/slip39-wordlist.ts",
  "packages/recovery-backup/src/codex32.ts",
  "packages/recovery-backup/src/sskr.ts",
  "packages/recovery-backup/src/sskr-codec.ts",
  "packages/recovery-backup/src/sskr-groups.ts",
  "packages/recovery-backup/src/sskr-bridge.ts",
  "packages/recovery-backup/src/sskr-limits.ts",
  "packages/recovery-backup/src/gordian-envelope.ts",
  "packages/recovery-backup/src/seedqr.ts",
  "packages/recovery-backup/src/mnemocode.ts",
  "packages/recovery-backup/src/mnemocode-backup-check.ts",
  "packages/recovery-backup/src/mnemocode-marked-codes.ts",
  "packages/recovery-backup/src/mnemocode-input.ts",
  "packages/recovery-backup/src/mnemocode-reencoding.ts",
  "packages/recovery-backup/src/mhfe-check-result.ts",
  "packages/recovery-backup/src/mhfe-input-text.ts",
  "packages/recovery-backup/src/mhfe-repair-choices.ts",
  "packages/recovery-backup/src/mnemocode-cards.ts",
  "packages/recovery-backup/src/mnemocode-disclosure.ts",
  "packages/recovery-backup/src/mnemocode-heirs.ts",
  "packages/recovery-backup/src/mnemocode-engine.ts",
  "packages/recovery-backup/src/mnemocode-module.ts",
  "packages/recovery-backup/src/mnemocode-facts.ts",
  "packages/recovery-backup/src/mnemocode-wallet.ts",
  "packages/recovery-backup/src/mnemocode-offered-coins.ts",
  "packages/recovery-backup/src/mnemonic-entries.ts",
  "packages/recovery-backup/src/fingerprint.ts",
  "packages/recovery-backup/src/mnemocode-search.ts",
  "packages/recovery-backup/src/mnemocode-shares.ts",
  "packages/recovery-backup/src/mnemocode-stitch.ts",
  "packages/recovery-backup/src/mnemocode-stego.ts",
  "packages/recovery-backup/src/mnemocode-stego-words.ts",
  "packages/recovery-backup/src/mnemocode-hidden-qr.ts",
  "packages/recovery-backup/src/mnemocode-word-table.ts",
  "packages/recovery-backup/src/mnemocode-self-test.ts",
  "packages/recovery-backup/src/self-test.ts",
  "packages/recovery-backup/src/self-test-helpers.ts",
  "packages/recovery-backup/src/self-test-seedqr.ts",
  "packages/recovery-backup/src/self-test-mnemocode.ts",
  "packages/recovery-backup/src/self-test-mnemocode-cards.ts",
  "packages/recovery-backup/src/self-test-slip39.ts",
  "packages/recovery-backup/src/self-test-codex32.ts",
  "packages/recovery-backup/src/self-test-sskr.ts",
  "packages/recovery-backup/src/self-test-gordian-envelope.ts",
  "packages/recovery-codex32-wasm/generated/recovery_codex32_wasm.js",
  "packages/recovery-codex32-wasm/generated/recovery_codex32_wasm_bg.wasm",
  "packages/recovery-sskr-wasm/generated/recovery_sskr_wasm.js",
  "packages/recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm",
  "packages/recovery-envelope-wasm/generated/recovery_envelope_wasm.js",
  "packages/recovery-envelope-wasm/generated/recovery_envelope_wasm_bg.wasm",
  "packages/recovery-mhfe-wasm/generated/core/argon2-mt.js",
  "packages/recovery-mhfe-wasm/generated/core/argon2-st.js",
  "packages/recovery-mhfe-wasm/generated/core/client.js",
  "packages/recovery-mhfe-wasm/generated/passwords/passwords.js",
  "packages/recovery-mhfe-wasm/generated/repair/repair.js",
  "packages/recovery-mhfe-wasm/generated/runtime/mhfe.wasm",
  "packages/recovery-mhfe-wasm/generated/runtime/runtime.js",
  "packages/recovery-mhfe-wasm/generated/runtime/worker.js",
  "packages/recovery-mhfe-wasm/generated/wallet/wallet.js",
]);

const MNEMOCODE_MARKER = "packages/recovery-mnemocode-wasm/";
let dashMnemoCodeFiles;
/**
 * The Dash Deriver's MnemoCode file and the Scanner's, which hold no coin but Dash; never the
 * multi-chain Deriver's. Read from MnemoCode's record when a graph is first checked.
 */
function isDashMnemoCodeFile(path) {
  dashMnemoCodeFiles ??= new Set(
    mnemocodeWasmFiles().filter((file) => !file.includes("/generated/multi-chain/key-derivation/")),
  );
  return dashMnemoCodeFiles.has(path);
}

export function assertDashOnlyGraph(inputs, label) {
  const normalized = inputs.map((input) => input.replaceAll("\\", "/").replace(/^\.\//u, ""));
  const unexpected = normalized.filter((input) => {
    const packageMarker = "packages/coin-protocols/src/coins/";
    const packageIndex = input.indexOf(packageMarker);
    if (packageIndex >= 0) {
      const relative = input.slice(packageIndex + packageMarker.length);
      return !(
        relative === "registry-base.ts" ||
        relative === "derivation-branches.ts" ||
        relative === "derivation-request.ts" ||
        relative === "derivation-input.ts" ||
        relative === "derivation-stream.ts" ||
        relative === "embedded-derivation.ts" ||
        // The multisig script and wallet builder name no coin; each coin brings its own scheme.
        relative === "multisig-wallet.ts" ||
        relative === "dash-registry.ts" ||
        relative === "dash-community-registry-profile.ts" ||
        relative === "dash-runtime-registry.ts" ||
        relative === "adapters/dash.ts" ||
        relative.startsWith("dash/")
      );
    }
    const newPackageMarkers = [
      "packages/public-data-providers/src/",
      "packages/secret-boundary/src/",
      "packages/network-boundary/src/",
      "packages/secret-vault/src/",
      "packages/wallet-recovery/src/",
      "packages/recovery-backup/src/",
      "packages/recovery-codex32-wasm/generated/",
      "packages/recovery-sskr-wasm/generated/",
      "packages/recovery-envelope-wasm/generated/",
      "packages/recovery-mhfe-wasm/generated/",
    ];
    const mnemocodeIndex = input.indexOf(MNEMOCODE_MARKER);
    if (mnemocodeIndex >= 0) return !isDashMnemoCodeFile(input.slice(mnemocodeIndex));
    for (const marker of newPackageMarkers) {
      const markerIndex = input.indexOf(marker);
      if (markerIndex >= 0) return !DASH_SHARED_INPUTS.has(input.slice(markerIndex));
    }
    const appMarker = "apps/discovery-scanner/src/coins/";
    const appIndex = input.indexOf(appMarker);
    if (appIndex >= 0) {
      const relative = input.slice(appIndex + appMarker.length);
      return !(
        relative === "registry.ts" ||
        relative === "dash-community.ts" ||
        relative === "custom-path.ts" ||
        relative.startsWith("dash/")
      );
    }
    return (
      input.endsWith("packages/verification/src/derivation-self-test.ts") ||
      input.endsWith("apps/discovery-scanner/src/self-test.ts")
    );
  });
  if (unexpected.length > 0) {
    throw new Error(
      `${label} graph contains inputs outside the Dash allowlist: ${unexpected.join(", ")}`,
    );
  }
}

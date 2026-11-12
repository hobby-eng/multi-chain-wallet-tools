import { RecoveryWorkerBundle } from "../../../tooling/recovery-worker-bundle.mjs";
import { BundledAssets } from "../../../tooling/bundled-assets.mjs";
import { readFileSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { embeddedBtcutilPlugin } from "../../../tooling/btcutil-offline.mjs";
import {
  BROWSER_BUNDLE,
  bundleText,
  inlineApplication,
  toolCss,
  writeToolArtifact,
} from "../../../tooling/html-artifact.mjs";
import { mnemocodeWasmPlugin } from "../../../tooling/mnemocode-wasm-plugin.mjs";
import { createBuildInfo } from "../../../tooling/build-metadata.mjs";
import {
  assertKeyDerivationComposition,
  createKeyDerivationCompositionPlugin,
  selectedMessageSigningInstaller,
  selectedUiEntry,
  selectedWorkerEntry,
} from "../../../tooling/key-derivation-composition.mjs";
import {
  applyKeyDerivationFeatureTemplate,
  customKeyDerivationArtifact,
  derivationFeatureModules,
  describeCustomArtifact,
  featureDefines,
  parseKeyDerivationFeatures,
} from "../../../tooling/key-derivation-features.mjs";
import { parseRequestedOutput } from "../../../tooling/tool-feature-options.mjs";
import {
  DESKTOP_VERSION_MARKER,
  desktopVersionNote,
  LAUNCHER_PLATFORMS,
  launcherName,
  removeLegacyLaunchers,
} from "../../../tooling/key-derivation-launchers.mjs";
import {
  applyProfileTemplate,
  assertDashOnlyGraph,
  getToolBuild,
  parseBuildProfile,
} from "../../../tooling/build-profiles.mjs";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const profile = parseBuildProfile();
const tool = getToolBuild(profile, "key-derivation");
const features = parseKeyDerivationFeatures(profile);
const featureProfile = {
  ...profile,
  capabilities: {
    ...profile.capabilities,
    bip85: features.has("bip85"),
    bitcoinSilentPayments: features.has("silent-payments"),
  },
};
const customArtifact = customKeyDerivationArtifact(root, profile, features, parseRequestedOutput());
const template = applyProfileTemplate(
  readFileSync(resolve(root, "apps/key-derivation/src/index.html"), "utf8"),
  featureProfile,
  tool,
  features,
);
// The page says how to get its executable version, from the one note of its edition: in the MHFE
// help (the template's marker, as HTML) and in the slow-mode notice (a define, as text).
const desktopNote = desktopVersionNote(profile);
const featuredTemplate = applyKeyDerivationFeatureTemplate(template, features).replaceAll(
  DESKTOP_VERSION_MARKER,
  desktopNote.html,
);
const css = await toolCss(root, profile);
const workerBuild = await build({
  absWorkingDir: root,
  stdin: { contents: selectedWorkerEntry(root, profile, features), loader: "ts", resolveDir: root },
  ...BROWSER_BUNDLE,
  loader: { ".wasm": "binary" },
  plugins: [
    createKeyDerivationCompositionPlugin(root, features),
    ...(features.hasCoin("bitcoin") ? [embeddedBtcutilPlugin(root, { replaceFetch: true })] : []),
  ],
  metafile: true,
});
const workerSource = bundleText(workerBuild, "derivation worker");
if (!/postMessage\(\{type:"ready"\}\)/u.test(workerSource)) {
  throw new Error("Derivation worker bundle is missing its explicit ready handshake.");
}
// The MHFE browser package ships its worker (shared by every module class) and both Argon2 builds
// as finished classic scripts. The page passes them to the MHFE classes as text, because under the page's Content-Security-Policy
// a worker may run only from a Blob built in the page; they are embedded unchanged.
const mhfeDirectory = resolve(root, "packages/recovery-mhfe-wasm/generated");
const readMhfeScript = (name) =>
  features.has("mhfe") ? readFileSync(resolve(mhfeDirectory, name), "utf8") : "";
const mhfeSources = {
  worker: readMhfeScript("runtime/worker.js"),
  argon2Threaded: readMhfeScript("core/argon2-mt.js"),
  argon2SingleThreaded: readMhfeScript("core/argon2-st.js"),
};
if (
  features.has("mhfe") &&
  (!mhfeSources.worker.includes("self.onmessage") ||
    !mhfeSources.argon2Threaded.includes("createArgon2Mt") ||
    !mhfeSources.argon2SingleThreaded.includes("createArgon2St"))
) {
  throw new Error("The embedded MHFE browser package is incomplete.");
}
// MnemoCode's long jobs run in a worker of their own, embedded as text like the derivation worker,
// so that Cancel can terminate them: the searches of forgotten words, date digits and marked codes,
// and the restores and repairs of Shamir shares. The worker is given the page's compiled MnemoCode,
// whose bytes the page embeds once; its glue is that of the page's own file.
const mnemocodeShares = features.has("mnemocode") && features.has("sskr");
const hiddenSeedQr = features.has("seedqr") && features.has("mnemocode");
const mnemocodeWasm = mnemocodeWasmPlugin(root, profile.id, "key-derivation");
const recoveryWorkers = new RecoveryWorkerBundle(root, features, [mnemocodeWasm]);
const mnemocodeSearchWorker = features.has("mnemocode")
  ? await recoveryWorkers.bundle("mnemocode-search-worker.ts")
  : { inputs: [], source: "" };
// The Deriver's wallet-check draw runs on a few workers at once; every one is this script.
const walletCheckDrawWorker = features.has("mhfe")
  ? await recoveryWorkers.bundle("wallet-check-draw-worker.ts")
  : { inputs: [], source: "" };
const slip39Worker = features.has("slip39")
  ? await recoveryWorkers.bundle("slip39-worker.ts")
  : { inputs: [], source: "" };
const buildInfo = createBuildInfo(root, profile, {
  coins: features.coins,
  features: features.selected,
});
const bundled = await build({
  absWorkingDir: root,
  stdin: { contents: selectedUiEntry(root), loader: "ts", resolveDir: root },
  ...BROWSER_BUNDLE,
  loader: BundledAssets.loaders,
  metafile: true,
  plugins: [
    createKeyDerivationCompositionPlugin(root, features),
    mnemocodeWasm,
    {
      name: "selected-recovery-features",
      setup(buildContext) {
        buildContext.onResolve({ filter: /derivation-feature-selection\.js$/ }, () => ({
          path: "derivation-selection",
          namespace: "ckd-derivation-selection",
        }));
        buildContext.onLoad({ filter: /.*/, namespace: "ckd-derivation-selection" }, () => {
          const definitions = derivationFeatureModules(features);
          const exports = definitions
            .map(
              ([, file, symbol]) =>
                `export { ${symbol} } from ${JSON.stringify(resolve(root, "apps/key-derivation/src/ui", file))};`,
            )
            .join("\n");
          let bip38 = "";
          if (features.has("bip38-encrypt")) {
            const supportedResultIds = [
              ...(features.hasCoin("bitcoin") ? ["bitcoin-legacy"] : []),
              ...(features.hasCoin("dash")
                ? ["dash-core", "dash-legacy-mobile", "dash-core-coinjoin"]
                : []),
            ];
            bip38 = `import { createBip38EncryptionInstaller } from ${JSON.stringify(resolve(root, "apps/key-derivation/src/ui/bip38-encryption-feature.ts"))};
export const installBip38EncryptionFeature = createBip38EncryptionInstaller(${JSON.stringify(supportedResultIds)});`;
          }
          const signing = selectedMessageSigningInstaller(root, features);
          return {
            loader: "ts",
            resolveDir: root,
            contents: `${exports}\n${bip38}\n${signing}`,
          };
        });
        // The SeedQR tab's hidden form keeps its record with MnemoCode's hidden QR: only a build
        // with MnemoCode has it.
        buildContext.onResolve({ filter: /recovery-seedqr-hidden-selection\.js$/ }, () => ({
          path: "seedqr-hidden-selection",
          namespace: "ckd-seedqr-hidden-selection",
        }));
        buildContext.onLoad({ filter: /.*/, namespace: "ckd-seedqr-hidden-selection" }, () => ({
          loader: "ts",
          resolveDir: root,
          contents: hiddenSeedQr
            ? `export { hiddenSeedQr } from ${JSON.stringify(resolve(root, "apps/key-derivation/src/ui/recovery-seedqr-hidden.ts"))};`
            : "export const hiddenSeedQr = undefined;",
        }));
        buildContext.onResolve({ filter: /recovery-feature-selection\.js$/ }, () => ({
          path: "selection",
          namespace: "ckd-recovery-selection",
        }));
        buildContext.onLoad({ filter: /.*/, namespace: "ckd-recovery-selection" }, () => {
          // Each module exports `recoveryFeature`; the order is the order of installation.
          const files = [
            ["wallet-matcher", "recovery-wallet-matcher.ts"],
            ["multisig", "recovery-multisig.ts"],
            ["seedqr", "recovery-seedqr.ts"],
            ["mnemocode", "recovery-mnemocode.ts"],
            ["mnemocode-cards", "recovery-mnemocode-cards.ts"],
            ["mnemocode-cards", "recovery-mnemocode-heirs.ts"],
            // Shares need MnemoCode and the SSKR library both.
            ...(mnemocodeShares ? [["mnemocode", "recovery-mnemocode-shares.ts"]] : []),
            ["mhfe", "recovery-mhfe.ts"],
            ["slip39", "recovery-slip39.ts"],
            ["codex32", "recovery-codex32.ts"],
            ["sskr", "recovery-sskr.ts"],
            ["gordian-envelope", "recovery-gordian-envelope.ts"],
          ]
            .filter(([feature]) => features.has(feature))
            .map(([, file]) => file);
          const imports = files
            .map(
              (file, index) =>
                `import { recoveryFeature as feature${index} } from ${JSON.stringify(resolve(root, "apps/key-derivation/src/ui", file))};`,
            )
            .join("\n");
          const list = files.map((_, index) => `feature${index}`).join(", ");
          return {
            loader: "ts",
            resolveDir: root,
            contents: `${imports}\nexport const selectedRecoveryFeatures = [${list}];`,
          };
        });
      },
    },
  ],
  define: {
    ...featureDefines(features),
    __BUILD_INFO__: JSON.stringify(buildInfo),
    __DERIVATION_WORKER_SOURCE__: JSON.stringify(workerSource),
    __MHFE_WORKER_SOURCE__: JSON.stringify(mhfeSources.worker),
    __MNEMOCODE_SEARCH_WORKER_SOURCE__: JSON.stringify(mnemocodeSearchWorker.source),
    __SLIP39_WORKER_SOURCE__: JSON.stringify(slip39Worker.source),
    __WALLET_CHECK_DRAW_WORKER_SOURCE__: JSON.stringify(walletCheckDrawWorker.source),
    __MHFE_ARGON2_THREADED_SOURCE__: JSON.stringify(mhfeSources.argon2Threaded),
    __MHFE_ARGON2_SINGLE_THREADED_SOURCE__: JSON.stringify(mhfeSources.argon2SingleThreaded),
    __DASH_COMMUNITY__: profile.id === "dash-community" ? "true" : "false",
    __DESKTOP_VERSION_NOTE__: JSON.stringify(desktopNote.text),
  },
});
// Every module of the page and of its workers, which the composition checks below judge.
const graphInputs = [
  ...Object.keys(workerBuild.metafile.inputs),
  ...mnemocodeSearchWorker.inputs,
  ...walletCheckDrawWorker.inputs,
  ...slip39Worker.inputs,
  ...Object.keys(bundled.metafile.inputs),
];
assertKeyDerivationComposition(features, graphInputs);
const javascript = bundleText(bundled, "Key Derivation Tool");
if (profile.id === "dash-community")
  assertDashOnlyGraph(graphInputs, "Dash Community key derivation");
if (
  !javascript.includes("wallet-key-derivation") ||
  !javascript.includes("The derivation worker stopped unexpectedly.")
) {
  throw new Error("Derivation worker client lost its reviewed startup/error lifecycle.");
}
const html = inlineApplication(featuredTemplate, css, javascript, "Key Derivation Tool");
const artifact = writeToolArtifact(root, tool, customArtifact, html, describeCustomArtifact);
removeStaleLaunchers(artifact);

/**
 * Removes the executable versions of an earlier build of this page from its folder. Each one
 * embeds the page it was built with, so after a new build they would serve the old page; they are
 * built again with tooling/build-key-derivation-launchers.mjs.
 */
function removeStaleLaunchers(page) {
  for (const platform of Object.keys(LAUNCHER_PLATFORMS)) {
    rmSync(resolve(page, "..", launcherName(basename(page), platform)), { force: true });
  }
  removeLegacyLaunchers(page);
  // The Python fast-mode launcher that earlier builds put next to the page is replaced by them.
  for (const name of ["mhfe-fast-mode.py", "mhfe-fast-mode.sha256"])
    rmSync(resolve(page, "..", name), { force: true });
}

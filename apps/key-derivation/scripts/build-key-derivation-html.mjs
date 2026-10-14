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
import { createBundledLibraryTextPlugin } from "../../../tooling/bundled-library-text.mjs";
import { createBuildInfo } from "../../../tooling/build-metadata.mjs";
import {
  assertKeyDerivationComposition,
  createKeyDerivationCompositionPlugin,
  selectedUiEntry,
  selectedWorkerEntry,
} from "../../../tooling/key-derivation-composition.mjs";
import {
  applyKeyDerivationFeatureTemplate,
  customKeyDerivationArtifact,
  describeCustomArtifact,
  featureDefines,
  parseKeyDerivationFeatures,
} from "../../../tooling/key-derivation-features.mjs";
import { parseRequestedOutput } from "../../../tooling/tool-feature-options.mjs";
import { LAUNCHER_PLATFORMS, launcherName } from "../../../tooling/key-derivation-launchers.mjs";
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
    bitcoinMessageSigning:
      profile.capabilities.bitcoinMessageSigning && features.hasCoin("bitcoin"),
  },
};
const customArtifact = customKeyDerivationArtifact(root, profile, features, parseRequestedOutput());
const template = applyProfileTemplate(
  readFileSync(resolve(root, "apps/key-derivation/src/index.html"), "utf8"),
  featureProfile,
  tool,
  features,
);
const featuredTemplate = applyKeyDerivationFeatureTemplate(template, features);
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
// MnemoCode's long jobs run in workers of their own, embedded as text like the derivation worker,
// so that Cancel can terminate them: the searches of forgotten words and date digits, and, when the
// SSKR library is in the build too, the restores and repairs of Shamir shares.
const mnemocodeShares = features.has("mnemocode") && features.has("sskr");
async function bundleMnemoCodeWorker(file) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [resolve(root, "apps/key-derivation/src/workers", file)],
    ...BROWSER_BUNDLE,
    plugins: [
      createKeyDerivationCompositionPlugin(root, features),
      {
        // The artifact embeds the BIP39 English wordlist once: a worker reads the page's copy.
        name: "page-wordlist",
        setup(buildContext) {
          buildContext.onResolve(
            { filter: /^@scure\/bip39\/wordlists\/english(?:\.js)?$/ },
            () => ({
              path: resolve(root, "apps/key-derivation/src/workers/page-wordlist.ts"),
            }),
          );
        },
      },
    ],
    metafile: true,
  });
  const source = result.outputFiles[0]?.text ?? "";
  if (!source.includes("onmessage")) throw new Error(`esbuild did not produce ${file}.`);
  return { inputs: Object.keys(result.metafile.inputs), source };
}
const mnemocodeSearchWorker = features.has("mnemocode")
  ? await bundleMnemoCodeWorker("mnemocode-search-worker.ts")
  : { inputs: [], source: "" };
const mnemocodeSharesWorker = mnemocodeShares
  ? await bundleMnemoCodeWorker("mnemocode-shares-worker.ts")
  : { inputs: [], source: "" };
const buildInfo = createBuildInfo(root, tool.checksumFile, profile, {
  coins: features.coins,
  features: features.selected,
});
const bundled = await build({
  absWorkingDir: root,
  stdin: { contents: selectedUiEntry(root), loader: "ts", resolveDir: root },
  ...BROWSER_BUNDLE,
  loader: { ".wasm": "binary", ".ttf": "binary", ".png": "binary", ".jpg": "binary" },
  metafile: true,
  plugins: [
    createKeyDerivationCompositionPlugin(root, features),
    createBundledLibraryTextPlugin(),
    {
      name: "selected-recovery-features",
      setup(buildContext) {
        buildContext.onResolve({ filter: /derivation-feature-selection\.js$/ }, () => ({
          path: "derivation-selection",
          namespace: "ckd-derivation-selection",
        }));
        buildContext.onLoad({ filter: /.*/, namespace: "ckd-derivation-selection" }, () => {
          const definitions = [
            ["bip85", "bip85-feature.ts", "installBip85Feature"],
            ["silent-payments", "silent-payment-feature.ts", "installSilentPaymentFeature"],
            ["mhfe", "checked-mnemonic-feature.ts", "installCheckedMnemonicFeature"],
          ].filter(([feature]) => features.has(feature));
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
          let signing = "";
          if (features.has("message-signing")) {
            const policyImports = [];
            const policies = [];
            if (features.hasCoin("bitcoin")) {
              policyImports.push(
                `import { BITCOIN_MESSAGE_SIGNING_POLICY } from ${JSON.stringify(resolve(root, "apps/key-derivation/src/ui/message-signing-policy-bitcoin.ts"))};`,
              );
              policies.push("BITCOIN_MESSAGE_SIGNING_POLICY");
            }
            if (features.hasCoin("dash")) {
              policyImports.push(
                `import { DASH_MESSAGE_SIGNING_POLICY } from ${JSON.stringify(resolve(root, "apps/key-derivation/src/ui/message-signing-policy-dash.ts"))};`,
              );
              policies.push("DASH_MESSAGE_SIGNING_POLICY");
            }
            signing = `import { createMessageSigningInstaller } from ${JSON.stringify(resolve(root, "apps/key-derivation/src/ui/message-signing-feature.ts"))};
${policyImports.join("\n")}
${policies.length > 1 ? `import { combineMessageSigningPolicies } from ${JSON.stringify(resolve(root, "apps/key-derivation/src/ui/message-signing-policy.ts"))};` : ""}
export const installMessageSigningFeature = createMessageSigningInstaller(${policies.length > 1 ? `combineMessageSigningPolicies(${policies.join(", ")})` : policies[0]});`;
          }
          return {
            loader: "ts",
            resolveDir: root,
            contents: `${exports}\n${bip38}\n${signing}`,
          };
        });
        buildContext.onResolve({ filter: /recovery-feature-selection\.js$/ }, () => ({
          path: "selection",
          namespace: "ckd-recovery-selection",
        }));
        buildContext.onLoad({ filter: /.*/, namespace: "ckd-recovery-selection" }, () => {
          // Each module exports `recoveryFeature`; the order is the order of installation.
          const files = [
            ["wallet-matcher", "recovery-wallet-matcher.ts"],
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
  // Card export bundles a font library whose unused font-program interpreter calls the
  // non-cryptographic random function. Every such call is redirected to the system source.
  inject: features.has("mnemocode-cards")
    ? [resolve(root, "packages/build-security/src/random-fraction.ts")]
    : [],
  define: {
    ...featureDefines(features),
    ...(features.has("mnemocode-cards") ? { "Math.random": "ckdRandomFraction" } : {}),
    __BUILD_INFO__: JSON.stringify(buildInfo),
    __DERIVATION_WORKER_SOURCE__: JSON.stringify(workerSource),
    __MHFE_WORKER_SOURCE__: JSON.stringify(mhfeSources.worker),
    __MNEMOCODE_SEARCH_WORKER_SOURCE__: JSON.stringify(mnemocodeSearchWorker.source),
    __MNEMOCODE_SHARES_WORKER_SOURCE__: JSON.stringify(mnemocodeSharesWorker.source),
    __MHFE_ARGON2_THREADED_SOURCE__: JSON.stringify(mhfeSources.argon2Threaded),
    __MHFE_ARGON2_SINGLE_THREADED_SOURCE__: JSON.stringify(mhfeSources.argon2SingleThreaded),
    __DASH_COMMUNITY__: profile.id === "dash-community" ? "true" : "false",
  },
});
assertKeyDerivationComposition(features, [
  ...Object.keys(workerBuild.metafile.inputs),
  ...mnemocodeSearchWorker.inputs,
  ...mnemocodeSharesWorker.inputs,
  ...Object.keys(bundled.metafile.inputs),
]);
const javascript = bundleText(bundled, "Key Derivation Tool");
if (profile.id === "dash-community") {
  assertDashOnlyGraph(
    [
      ...Object.keys(workerBuild.metafile.inputs),
      ...mnemocodeSearchWorker.inputs,
      ...mnemocodeSharesWorker.inputs,
      ...Object.keys(bundled.metafile.inputs),
    ],
    "Dash Community key derivation",
  );
}
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
  // The Python fast-mode launcher that earlier builds put next to the page is replaced by them.
  for (const name of ["mhfe-fast-mode.py", "mhfe-fast-mode.sha256"])
    rmSync(resolve(page, "..", name), { force: true });
}

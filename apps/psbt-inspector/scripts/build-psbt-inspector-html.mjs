import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import { createBuildInfo } from "../../../tooling/build-metadata.mjs";
import {
  applyPsbtCompositionTemplate,
  assertPsbtComposition,
  createPsbtCompositionPlugin,
} from "../../../tooling/psbt-inspector-composition.mjs";
import {
  artifactDisplayName,
  customToolArtifact,
  parseRequestedOutput,
  parseToolFeatureOptions,
} from "../../../tooling/tool-feature-options.mjs";
import {
  applyProfileTemplate,
  getToolBuild,
  parseBuildProfile,
} from "../../../tooling/build-profiles.mjs";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const profile = parseBuildProfile();
const tool = getToolBuild(profile, "psbt-inspector");
const options = parseToolFeatureOptions("psbt-inspector", profile);
const customArtifact = customToolArtifact(
  root,
  profile,
  "psbt-inspector",
  tool,
  options,
  parseRequestedOutput(),
);
const embedsBtcutil = options.hasCoin("bitcoin") && options.has("message-verification");
// The embedded btcutil compiles its WebAssembly, which the page's CSP must allow.
const wasmScriptSource = embedsBtcutil ? " 'wasm-unsafe-eval'" : "";
const sourceTemplate = readFileSync(resolve(root, "apps/psbt-inspector/src/index.html"), "utf8");
const customFields =
  /[ \t]*<!--__PSBT_CUSTOM_MINISCRIPT_FIELDS_START__-->[\s\S]*?<!--__PSBT_CUSTOM_MINISCRIPT_FIELDS_END__-->\n?/u;
const profileTemplate =
  profile.id === "dash-community"
    ? sourceTemplate.replace(customFields, "")
    : sourceTemplate
        .replace("<!--__PSBT_CUSTOM_MINISCRIPT_FIELDS_START__-->", "")
        .replace("<!--__PSBT_CUSTOM_MINISCRIPT_FIELDS_END__-->", "");
const template = applyPsbtCompositionTemplate(
  applyProfileTemplate(profileTemplate, profile, tool, options),
  options,
);
const css = await toolCss(root, profile, ["apps/psbt-inspector/src/styles.css"]);
const buildInfo = createBuildInfo(root, tool.checksumFile, profile, {
  coins: options.coins,
  features: options.selected,
});
const dashCapabilitiesPlugin = {
  name: "dash-psbt-capabilities",
  setup(buildContext) {
    buildContext.onResolve(
      { filter: /^\.\/(?:musig-descriptor|musig-psbt|custom-miniscript)\.js$/ },
      ({ path }) => ({
        path: resolve(
          root,
          path === "./musig-descriptor.js"
            ? "apps/psbt-inspector/src/musig-descriptor-disabled.ts"
            : path === "./musig-psbt.js"
              ? "apps/psbt-inspector/src/musig-psbt-disabled.ts"
              : "apps/psbt-inspector/src/custom-miniscript-disabled.ts",
        ),
      }),
    );
  },
};
const btcutilPlugin = embeddedBtcutilPlugin(root);
const basePlugin = !options.hasCoin("bitcoin")
  ? dashCapabilitiesPlugin
  : embedsBtcutil
    ? btcutilPlugin
    : undefined;

const bundled = await build({
  absWorkingDir: root,
  ...BROWSER_BUNDLE,
  entryPoints: [tool.entryPoint],
  metafile: true,
  plugins: [createPsbtCompositionPlugin(root, options, basePlugin)],
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
    __PSBT_FEATURES__: JSON.stringify(options.selected),
    ...(embedsBtcutil ? { fetch: "__offlineNetworkDisabled" } : {}),
  },
  banner: embedsBtcutil
    ? {
        js: 'const __offlineNetworkDisabled=()=>{throw new Error("Network access is disabled in this offline artifact.")};',
      }
    : {},
});
assertPsbtComposition(options, Object.keys(bundled.metafile.inputs));
if (!options.hasCoin("bitcoin")) {
  const inputs = Object.keys(bundled.metafile.inputs).map((input) => input.replaceAll("\\", "/"));
  const forbidden = inputs.filter(
    (input) =>
      input.endsWith("/musig-descriptor.ts") ||
      input.endsWith("/musig-psbt.ts") ||
      input.endsWith("/custom-miniscript.ts") ||
      input.endsWith("/bip322-verifier.ts") ||
      input.endsWith("/message-verifier.ts") ||
      input.includes("/@scure/btc-signer/") ||
      input.includes("/btcutil-js/"),
  );
  if (forbidden.length > 0)
    throw new Error(
      `Dash Community PSBT bundle contains Bitcoin-only MuSig2, custom Tapscript, or BIP-322 inputs: ${forbidden.join(", ")}`,
    );
}
const javascript = bundleText(bundled, "PSBT & Multisig Inspector");
const html = inlineApplication(template, css, javascript, "PSBT & Multisig Inspector", {
  extraScriptSources: wasmScriptSource,
});
writeToolArtifact(root, tool, customArtifact, html, artifactDisplayName);

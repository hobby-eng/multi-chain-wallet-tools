import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  BROWSER_BUNDLE,
  bundleText,
  inlineApplication,
  toolCss,
  writeToolArtifact,
} from "../../../tooling/html-artifact.mjs";
import { createBuildInfo } from "../../../tooling/build-metadata.mjs";
import {
  activityViewerEntry,
  applyActivityCoinTemplate,
  assertActivityViewerComposition,
  createActivityViewerCompositionPlugin,
} from "../../../tooling/activity-viewer-composition.mjs";
import {
  applySelectedNetworkCsp,
  artifactDisplayName,
  customToolArtifact,
  parseRequestedOutput,
  parseToolFeatureOptions,
} from "../../../tooling/tool-feature-options.mjs";
import {
  applyProfileTemplate,
  assertDashOnlyGraph,
  getToolBuild,
  parseBuildProfile,
} from "../../../tooling/build-profiles.mjs";
import { verifyDashSdkBuild } from "../../../tooling/verify-dash-sdk-build.mjs";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const profile = parseBuildProfile();
const tool = getToolBuild(profile, "activity-viewer");
const options = parseToolFeatureOptions("activity-viewer", profile);
const customArtifact = customToolArtifact(
  root,
  profile,
  "activity-viewer",
  tool,
  options,
  parseRequestedOutput(),
);
if (options.hasCoin("dash")) verifyDashSdkBuild(root, "The viewer");
let template = applyActivityCoinTemplate(
  applyProfileTemplate(
    readFileSync(resolve(root, "apps/activity-viewer/src/index.html"), "utf8"),
    profile,
    tool,
  ),
  options,
);
template = applySelectedNetworkCsp(template, options);
const css = await toolCss(root, profile, [
  "apps/activity-viewer/src/styles.css",
  ...(profile.id === "dash-community"
    ? ["apps/activity-viewer/src/styles-dash-community.css"]
    : []),
]);
const buildInfo = createBuildInfo(root, tool.checksumFile, profile, {
  coins: options.coins,
  features: options.selected,
});
const bundled = await build({
  absWorkingDir: root,
  ...BROWSER_BUNDLE,
  stdin: { contents: activityViewerEntry(root, options), loader: "ts", resolveDir: root },
  loader: { ".wasm": "binary" },
  plugins: [createActivityViewerCompositionPlugin(root, options)],
  metafile: true,
  define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
});
const javascript = bundleText(bundled, "viewer JavaScript");
assertActivityViewerComposition(options, Object.keys(bundled.metafile.inputs));
if (profile.id === "dash-community") {
  assertDashOnlyGraph(Object.keys(bundled.metafile.inputs), "Dash Community activity viewer");
}
const html = inlineApplication(template, css, javascript, "Viewer");
writeToolArtifact(root, tool, customArtifact, html, artifactDisplayName);

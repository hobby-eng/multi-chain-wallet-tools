import { basename, isAbsolute, relative, resolve } from "node:path";

import { ToolBuildPolicy } from "./tool-build-policy.mjs";
import { TOOL_MANIFESTS } from "./tool-manifests.mjs";

export const TOOL_FEATURE_DEFINITIONS = TOOL_MANIFESTS;

/** The comma-separated values of every `name` option among `args`, trimmed. */
export function commaOptionValues(args, name) {
  const found = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === name) {
      const value = args[++index];
      if (
        value === undefined ||
        value.startsWith("--") ||
        value.split(",").some((entry) => entry.trim() === "")
      )
        throw new Error(`${name} requires a comma-separated value.`);
      found.push(value);
    } else if (argument.startsWith(`${name}=`)) {
      const value = argument.slice(name.length + 1);
      if (value.split(",").some((entry) => entry.trim() === ""))
        throw new Error(`${name} requires a comma-separated value.`);
      found.push(value);
    }
  }
  return found
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function parseToolFeatureOptions(toolId, profile, args = process.argv.slice(2)) {
  const policy = new ToolBuildPolicy(toolId, profile);
  const definition = policy.definition;
  const includedCoins = policy.normalize(commaOptionValues(args, "--coins"), "--coins");
  const excludedCoins = policy.normalize(
    commaOptionValues(args, "--exclude-coins"),
    "--exclude-coins",
  );
  const coins = policy.coins(includedCoins, excludedCoins);
  const included = policy.normalize(commaOptionValues(args, "--features"), "--features");
  const excluded = policy.normalize(commaOptionValues(args, "--exclude"), "--exclude");
  const features = policy.features(coins, included, excluded);
  const selectedCoins = new Set(coins);
  const selected = new Set(features);
  const custom =
    includedCoins.length + excludedCoins.length + included.length + excluded.length > 0;
  return Object.freeze({
    custom,
    coins: Object.freeze(definition.coins.filter((coin) => selectedCoins.has(coin))),
    selected: Object.freeze(definition.features.filter((feature) => selected.has(feature))),
    hasCoin: (coin) => selectedCoins.has(coin),
    has: (feature) => selected.has(feature),
  });
}

const FIXED_PROVIDER_ORIGINS = Object.freeze({
  bitcoin: [
    "https://blockstream.info",
    "https://mempool.space",
    "https://blockchain.info",
    "https://api.blockcypher.com",
  ],
  ethereum: [
    "https://ethereum-rpc.publicnode.com",
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://eth.blockscout.com",
    "https://eth-sepolia.blockscout.com",
  ],
});

export function applySelectedNetworkCsp(template, options) {
  // Dash Platform discovers quorum endpoints at runtime, so Dash builds retain
  // the HTTPS scheme boundary. Fixed-provider Bitcoin/Ethereum builds can pin
  // every permitted origin directly in CSP.
  if (options.hasCoin("dash")) return template;
  const origins = [...new Set(options.coins.flatMap((coin) => FIXED_PROVIDER_ORIGINS[coin] ?? []))];
  if (origins.length === 0)
    throw new Error("No fixed CSP provider origins exist for the selected coins.");
  const marker = "connect-src https:";
  if (!template.includes(marker))
    throw new Error("Connected-tool template is missing its connect-src marker.");
  return template.replace(marker, `connect-src ${origins.join(" ")}`);
}

export function assertSafeCustomOutput(root, output) {
  for (const directory of ["multi-chain-edition", "dash-community-edition"]) {
    const canonicalRoot = resolve(root, "dist", directory);
    const pathFromCanonicalRoot = relative(canonicalRoot, output);
    if (
      pathFromCanonicalRoot === "" ||
      (!pathFromCanonicalRoot.startsWith("..") && !isAbsolute(pathFromCanonicalRoot))
    ) {
      throw new Error(
        `--output cannot write inside ${relative(root, canonicalRoot)}. Canonical release artifacts are reserved for full profile builds.`,
      );
    }
  }
}

/** The page that `--output` names, refused unless it is an .html file outside release folders. */
export function requestedArtifact(root, requestedOutput) {
  const output = resolve(root, requestedOutput);
  if (!output.endsWith(".html")) throw new Error("--output must name an .html file.");
  assertSafeCustomOutput(root, output);
  return output;
}

export function customToolArtifact(root, profile, toolId, tool, options, requestedOutput) {
  if (!options.custom && requestedOutput === undefined) return undefined;
  if (requestedOutput !== undefined) return requestedArtifact(root, requestedOutput);
  const featureSlug = options.selected.length === 0 ? "base" : options.selected.join("_");
  return resolve(
    root,
    "dist",
    "custom-builds",
    profile.id,
    `${tool.artifactName.replace(/\.html$/u, "")}_${options.coins.join("-")}__${featureSlug}.html`,
  );
}

export function parseRequestedOutput(args = process.argv.slice(2)) {
  const inline = args.find((argument) => argument.startsWith("--output="));
  const index = args.indexOf("--output");
  const output = inline?.slice("--output=".length) ?? (index >= 0 ? args[index + 1] : undefined);
  if (
    (inline !== undefined || index >= 0) &&
    (output === undefined || output.trim() === "" || output.startsWith("--"))
  ) {
    throw new Error("--output requires an .html path.");
  }
  return output;
}

export function artifactDisplayName(path) {
  return basename(path);
}

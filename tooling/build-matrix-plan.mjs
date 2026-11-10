import { EVM_NETWORK_IDS } from "./evm-networks.mjs";
import { SINGLE_KEY_COIN_IDS } from "./single-key-coins.mjs";
import { BUILD_PROFILES, profileToolIds } from "./build-profiles.mjs";
import { KEY_DERIVATION_COINS, KEY_DERIVATION_FEATURES } from "./key-derivation-features.mjs";
import { ToolBuildPolicy } from "./tool-build-policy.mjs";
import { TOOL_FEATURE_DEFINITIONS } from "./tool-feature-options.mjs";

function nonemptySubsets(values) {
  return Array.from({ length: 2 ** values.length - 1 }, (_, maskIndex) => {
    const mask = maskIndex + 1;
    return values.filter((_, index) => (mask & (1 << index)) !== 0);
  });
}

/**
 * The coins that share one implementation each: the single-key coins (the account coins of the
 * connected tools among them) and the EVM networks.
 */
const TABLE_COIN_IDS = Object.freeze([...SINGLE_KEY_COIN_IDS, ...EVM_NETWORK_IDS]);

/**
 * The coin sets of a tool: every subset of the coins with protocols of their own, each table coin
 * alone, and each of those subsets with all the table coins. The table coins share their code (the
 * single-key coins their derivations, tooling/single-key-coins.mjs; the EVM networks their scans,
 * tooling/evm-networks.mjs), so among themselves they combine like one coin; every subset of all the
 * coins would be thousands of sets, each with every feature set.
 */
function coinSets(coins) {
  const own = coins.filter((coin) => !TABLE_COIN_IDS.includes(coin));
  const tableCoins = coins.filter((coin) => TABLE_COIN_IDS.includes(coin));
  if (tableCoins.length === 0) return nonemptySubsets(own);
  const ordered = (set) => coins.filter((coin) => set.includes(coin));
  return [
    ...nonemptySubsets(own),
    ...tableCoins.map((coin) => [coin]),
    ...[[], ...nonemptySubsets(own)].map((subset) => ordered([...subset, ...tableCoins])),
  ];
}

/**
 * The builds of a coin set: each feature set of the profile's defaults with the coins it can scan
 * (a watch-only Scanner leaves the account coins out, as a build without --coins does), where
 * admission takes them; admission owns every dependency between features.
 */
function builds(policy, coins) {
  const candidates = policy.defaultFeatures(coins);
  return [[], ...nonemptySubsets(candidates)].flatMap((features) => {
    const scannable = policy.scannableCoins(coins, features);
    return policy.isLegal(scannable, features) ? [{ coins: scannable, features }] : [];
  });
}

export function createBuildMatrixPlan(profileIds = Object.keys(BUILD_PROFILES), requestedTool) {
  return profileIds.flatMap((profileId) => {
    const profile = BUILD_PROFILES[profileId];
    if (profile === undefined) throw new Error(`Unknown build profile "${profileId}".`);
    return profileToolIds(profile).flatMap((toolId) => {
      if (requestedTool !== undefined && requestedTool !== toolId) return [];
      const policy = new ToolBuildPolicy(toolId, profile);
      const jobs = new Map();
      for (const set of coinSets(policy.profileCoins()))
        for (const { coins, features } of builds(policy, set)) {
          const featureSlug = features.length === 0 ? "base" : features.join("_");
          const relativePath = `dist/build-matrix/${profileId}/${toolId}/${coins.join("-")}/${featureSlug}.html`;
          // Two coin sets that differ only in coins a feature set cannot scan give one build.
          jobs.set(relativePath, { profileId, toolId, coins, features, relativePath });
        }
      return [...jobs.values()];
    });
  });
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * A bounded composition smoke set: every canonical full build, every coin by
 * itself, and every optional feature in at least one minimal valid build.
 * This detects builder/registry/graph regressions without claiming exhaustive
 * coverage of every feature interaction.
 */
export function createBuildMatrixSmokePlan(
  profileIds = Object.keys(BUILD_PROFILES),
  requestedTool,
) {
  const exhaustive = createBuildMatrixPlan(profileIds, requestedTool);
  const selected = new Map();
  const add = (job) =>
    selected.set(
      `${job.profileId}|${job.toolId}|${job.coins.join(",")}|${job.features.join(",")}`,
      job,
    );
  const groups = new Map();
  for (const job of exhaustive) {
    const key = `${job.profileId}|${job.toolId}`;
    const group = groups.get(key) ?? [];
    group.push(job);
    groups.set(key, group);
  }
  for (const jobs of groups.values()) {
    const sample = jobs[0];
    const definition =
      sample.toolId === "key-derivation"
        ? { coins: KEY_DERIVATION_COINS, features: KEY_DERIVATION_FEATURES }
        : TOOL_FEATURE_DEFINITIONS[sample.toolId];
    const allowedCoins = new ToolBuildPolicy(
      sample.toolId,
      BUILD_PROFILES[sample.profileId],
    ).profileCoins();
    const fullCoins = allowedCoins.filter((coin) => jobs.some((job) => job.coins.includes(coin)));
    const full = jobs.find(
      (job) =>
        sameValues(job.coins, fullCoins) &&
        job.features.length ===
          Math.max(
            ...jobs
              .filter((item) => sameValues(item.coins, fullCoins))
              .map((item) => item.features.length),
          ),
    );
    if (full !== undefined) add(full);
    for (const coin of fullCoins) {
      const coinJobs = jobs.filter((job) => sameValues(job.coins, [coin]));
      const maximal = coinJobs.toSorted(
        (left, right) => right.features.length - left.features.length,
      )[0];
      if (maximal !== undefined) add(maximal);
    }
    for (const feature of definition.features) {
      const candidates = jobs
        .filter((job) => job.features.includes(feature))
        .toSorted(
          (left, right) =>
            left.features.length - right.features.length || left.coins.length - right.coins.length,
        );
      if (candidates[0] !== undefined) add(candidates[0]);
    }
    if (sample.toolId === "discovery-scanner") {
      const watchWithCustom = jobs.find(
        (job) =>
          job.features.includes("watch-only-discovery") &&
          job.features.includes("custom-paths") &&
          !job.features.includes("seed-discovery"),
      );
      if (watchWithCustom !== undefined) add(watchWithCustom);
    }
  }
  return [...selected.values()];
}

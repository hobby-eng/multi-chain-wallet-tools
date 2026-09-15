import { BUILD_PROFILES, profileToolIds } from './build-profiles.mjs';
import { KEY_DERIVATION_COINS, KEY_DERIVATION_FEATURES } from './key-derivation-features.mjs';
import { TOOL_FEATURE_DEFINITIONS } from './tool-feature-options.mjs';

function nonemptySubsets(values) {
  return Array.from({ length: 2 ** values.length - 1 }, (_, maskIndex) => {
    const mask = maskIndex + 1;
    return values.filter((_, index) => (mask & (1 << index)) !== 0);
  });
}

function featureSets(toolId, coins) {
  if (toolId === 'activity-viewer') return [[]];
  if (toolId === 'key-derivation') {
    const optional = KEY_DERIVATION_FEATURES.filter((feature) => feature !== 'derive').filter((feature) => {
      if (feature === 'silent-payments') return coins.includes('bitcoin');
      if (feature === 'bip38-encrypt' || feature === 'message-signing')
        return coins.includes('bitcoin') || coins.includes('dash');
      return true;
    });
    return [[], ...nonemptySubsets(optional)].map((features) => ['derive', ...features]);
  }
  const features = TOOL_FEATURE_DEFINITIONS[toolId].features;
  return nonemptySubsets(features).filter((selected) => {
    if (toolId !== 'discovery-scanner') return true;
    if (!selected.includes('seed-discovery') && !selected.includes('watch-only-discovery')) return false;
    return !selected.includes('wallet-matcher') || selected.includes('seed-discovery');
  });
}

function coinSets(toolId, profile) {
  const supported = toolId === 'key-derivation' ? KEY_DERIVATION_COINS : TOOL_FEATURE_DEFINITIONS[toolId].coins;
  return nonemptySubsets(profile.id === 'dash-community' ? ['dash'] : supported);
}

export function createBuildMatrixPlan(profileIds = Object.keys(BUILD_PROFILES), requestedTool) {
  return profileIds.flatMap((profileId) => {
    const profile = BUILD_PROFILES[profileId];
    if (profile === undefined) throw new Error(`Unknown build profile "${profileId}".`);
    return profileToolIds(profile).flatMap((toolId) => {
      if (requestedTool !== undefined && requestedTool !== toolId) return [];
      return coinSets(toolId, profile).flatMap((coins) =>
        featureSets(toolId, coins).map((features) => {
          const featureSlug = features.length === 0 ? 'base' : features.join('_');
          return {
            profileId,
            toolId,
            coins,
            features,
            relativePath: `dist/build-matrix/${profileId}/${toolId}/${coins.join('-')}/${featureSlug}.html`,
          };
        }),
      );
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
export function createBuildMatrixSmokePlan(profileIds = Object.keys(BUILD_PROFILES), requestedTool) {
  const exhaustive = createBuildMatrixPlan(profileIds, requestedTool);
  const selected = new Map();
  const add = (job) =>
    selected.set(`${job.profileId}|${job.toolId}|${job.coins.join(',')}|${job.features.join(',')}`, job);
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
      sample.toolId === 'key-derivation'
        ? { coins: KEY_DERIVATION_COINS, features: KEY_DERIVATION_FEATURES }
        : TOOL_FEATURE_DEFINITIONS[sample.toolId];
    const allowedCoins = sample.profileId === 'dash-community' ? ['dash'] : definition.coins;
    const fullCoins = allowedCoins.filter((coin) => jobs.some((job) => job.coins.includes(coin)));
    const full = jobs.find(
      (job) =>
        sameValues(job.coins, fullCoins) &&
        job.features.length ===
          Math.max(...jobs.filter((item) => sameValues(item.coins, fullCoins)).map((item) => item.features.length)),
    );
    if (full !== undefined) add(full);
    for (const coin of fullCoins) {
      const coinJobs = jobs.filter((job) => sameValues(job.coins, [coin]));
      const maximal = coinJobs.toSorted((left, right) => right.features.length - left.features.length)[0];
      if (maximal !== undefined) add(maximal);
    }
    for (const feature of definition.features) {
      const candidates = jobs
        .filter((job) => job.features.includes(feature))
        .toSorted(
          (left, right) => left.features.length - right.features.length || left.coins.length - right.coins.length,
        );
      if (candidates[0] !== undefined) add(candidates[0]);
    }
    if (sample.toolId === 'discovery-scanner') {
      const watchWithCustom = jobs.find(
        (job) =>
          job.features.includes('watch-only-discovery') &&
          job.features.includes('custom-paths') &&
          !job.features.includes('seed-discovery'),
      );
      if (watchWithCustom !== undefined) add(watchWithCustom);
    }
  }
  return [...selected.values()];
}

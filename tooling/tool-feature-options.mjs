import { basename, resolve } from 'node:path';

export const TOOL_FEATURE_DEFINITIONS = Object.freeze({
  'activity-viewer': {
    coins: ['bitcoin', 'dash', 'ethereum'],
    features: [],
  },
  'discovery-scanner': {
    coins: ['bitcoin', 'dash', 'ethereum'],
    features: ['seed-discovery', 'watch-only-discovery', 'wallet-matcher', 'custom-paths'],
  },
  'psbt-inspector': {
    coins: ['bitcoin', 'dash'],
    features: [
      'psbt-decoder',
      'script-decoder',
      'descriptor-decoder',
      'policy-builder',
      'multisig-wallet',
      'message-verification',
      'bip38-decrypt',
    ],
  },
});

function values(args, name) {
  const found = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === name) {
      const value = args[++index];
      if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a comma-separated value.`);
      found.push(value);
    } else if (argument.startsWith(`${name}=`)) found.push(argument.slice(name.length + 1));
  }
  return found
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function checked(raw, option, allowed) {
  return raw.map((name) => {
    if (!allowed.includes(name)) throw new Error(`Unknown ${option} value "${name}". Expected: ${allowed.join(', ')}.`);
    return name;
  });
}

export function parseToolFeatureOptions(toolId, profile, args = process.argv.slice(2)) {
  const definition = TOOL_FEATURE_DEFINITIONS[toolId];
  if (definition === undefined) throw new Error(`No selective-build definition exists for ${toolId}.`);
  const includedCoins = checked(values(args, '--coins'), '--coins', definition.coins);
  const excludedCoins = checked(values(args, '--exclude-coins'), '--exclude-coins', definition.coins);
  const profileCoins = profile.id === 'dash-community' ? ['dash'] : definition.coins;
  const selectedCoins = new Set(includedCoins.length > 0 ? includedCoins : profileCoins);
  for (const coin of excludedCoins) selectedCoins.delete(coin);
  if (selectedCoins.size === 0) throw new Error(`Select at least one coin for ${toolId}.`);
  if (profile.id === 'dash-community' && [...selectedCoins].some((coin) => coin !== 'dash')) {
    throw new Error('Dash Community builds may include only Dash. Use --profile multi-chain for the general design.');
  }

  const included = checked(values(args, '--features'), '--features', definition.features);
  const excluded = checked(values(args, '--exclude'), '--exclude', definition.features);
  const selected = new Set(included.length > 0 ? included : definition.features);
  for (const feature of excluded) selected.delete(feature);
  if (toolId === 'discovery-scanner' && !selected.has('seed-discovery') && !selected.has('watch-only-discovery')) {
    throw new Error('Discovery Scanner requires seed-discovery, watch-only-discovery, or both.');
  }
  if (toolId === 'discovery-scanner' && selected.has('wallet-matcher') && !selected.has('seed-discovery')) {
    throw new Error('Discovery Scanner wallet-matcher requires seed-discovery.');
  }
  if (toolId === 'psbt-inspector' && selected.size === 0) {
    throw new Error('PSBT Inspector requires at least one workflow feature.');
  }
  const custom = includedCoins.length + excludedCoins.length + included.length + excluded.length > 0;
  return Object.freeze({
    custom,
    coins: Object.freeze(definition.coins.filter((coin) => selectedCoins.has(coin))),
    selected: Object.freeze(definition.features.filter((feature) => selected.has(feature))),
    hasCoin: (coin) => selectedCoins.has(coin),
    has: (feature) => selected.has(feature),
  });
}

export function customToolArtifact(root, profile, toolId, tool, options, requestedOutput) {
  if (!options.custom && requestedOutput === undefined) return undefined;
  if (requestedOutput !== undefined) {
    const output = resolve(root, requestedOutput);
    if (!output.endsWith('.html')) throw new Error('--output must name an .html file.');
    return output;
  }
  const featureSlug = options.selected.length === 0 ? 'base' : options.selected.join('_');
  return resolve(
    root,
    'dist',
    'custom-builds',
    profile.id,
    `${tool.artifactName.replace(/\.html$/u, '')}_${options.coins.join('-')}__${featureSlug}.html`,
  );
}

export function parseRequestedOutput(args = process.argv.slice(2)) {
  const inline = args.find((argument) => argument.startsWith('--output='));
  const index = args.indexOf('--output');
  return inline?.slice('--output='.length) ?? (index >= 0 ? args[index + 1] : undefined);
}

export function artifactDisplayName(path) {
  return basename(path);
}

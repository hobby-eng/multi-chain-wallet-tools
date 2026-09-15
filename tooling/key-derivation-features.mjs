import { basename, resolve } from 'node:path';

export const KEY_DERIVATION_COINS = Object.freeze(['bitcoin', 'dash', 'ethereum']);

export const KEY_DERIVATION_FEATURES = Object.freeze([
  'derive',
  'bip85',
  'silent-payments',
  'bip38-encrypt',
  'message-signing',
  'wallet-matcher',
  'seedqr',
  'slip39',
  'shamir',
  'codex32',
]);

const RECOVERY_FEATURES = Object.freeze(['wallet-matcher', 'seedqr', 'slip39', 'shamir', 'codex32']);
const ALIASES = Object.freeze({ matcher: 'wallet-matcher', silent: 'silent-payments' });

function optionValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === name) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a comma-separated value.`);
      values.push(value);
      index += 1;
    } else if (argument.startsWith(`${name}=`)) {
      values.push(argument.slice(name.length + 1));
    }
  }
  return values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeNames(names, option, allowed = KEY_DERIVATION_FEATURES) {
  return names.map((name) => {
    const normalized = ALIASES[name] ?? name;
    if (!allowed.includes(normalized)) {
      throw new Error(`Unknown ${option} value "${name}". Expected: ${allowed.join(', ')}.`);
    }
    return normalized;
  });
}

export function parseKeyDerivationFeatures(profile, args = process.argv.slice(2)) {
  const included = normalizeNames(optionValues(args, '--features'), '--features');
  const excluded = normalizeNames(optionValues(args, '--exclude'), '--exclude');
  const includedCoins = normalizeNames(optionValues(args, '--coins'), '--coins', KEY_DERIVATION_COINS);
  const excludedCoins = normalizeNames(optionValues(args, '--exclude-coins'), '--exclude-coins', KEY_DERIVATION_COINS);
  const profileCoins = profile.id === 'dash-community' ? ['dash'] : [...KEY_DERIVATION_COINS];
  const selectedCoins = new Set(includedCoins.length > 0 ? includedCoins : profileCoins);
  for (const coin of excludedCoins) selectedCoins.delete(coin);
  if (selectedCoins.size === 0) throw new Error('Select at least one coin for Key Derivation.');
  if (profile.id === 'dash-community' && [...selectedCoins].some((coin) => coin !== 'dash')) {
    throw new Error(
      'Dash Community builds may include only the Dash coin module. Use --profile multi-chain for the general design.',
    );
  }
  const custom = included.length > 0 || excluded.length > 0 || includedCoins.length > 0 || excludedCoins.length > 0;
  const hasSigningCoin = selectedCoins.has('bitcoin') || selectedCoins.has('dash');
  const profileDefaults = KEY_DERIVATION_FEATURES.filter((feature) => {
    if (feature === 'silent-payments')
      return profile.capabilities.bitcoinSilentPayments && selectedCoins.has('bitcoin');
    if (feature === 'bip38-encrypt' || feature === 'message-signing') return hasSigningCoin;
    return true;
  });
  const selected = new Set(included.length > 0 ? included : profileDefaults);
  for (const feature of excluded) selected.delete(feature);
  if (!selected.has('derive')) {
    throw new Error('The base "derive" feature is required by the Key Derivation Tool and cannot be excluded.');
  }
  if (
    selected.has('silent-payments') &&
    (!profile.capabilities.bitcoinSilentPayments || !selectedCoins.has('bitcoin'))
  ) {
    throw new Error('The "silent-payments" feature requires Bitcoin in the general multi-chain profile.');
  }
  if ((selected.has('bip38-encrypt') || selected.has('message-signing')) && !hasSigningCoin) {
    throw new Error('BIP38 encryption and message signing require Bitcoin or Dash.');
  }
  const ordered = KEY_DERIVATION_FEATURES.filter((feature) => selected.has(feature));
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
  if (requestedOutput !== undefined) {
    const output = resolve(root, requestedOutput);
    if (!output.endsWith('.html')) throw new Error('--output must name an .html file.');
    return output;
  }
  const slug = `${features.coins.join('-')}__${features.selected.join('_')}`;
  return resolve(root, 'dist', 'custom-builds', profile.id, `Key_Derivation_${slug}.html`);
}

export function parseOutputPath(args = process.argv.slice(2)) {
  const inline = args.find((arg) => arg.startsWith('--output='));
  const index = args.indexOf('--output');
  return inline?.slice('--output='.length) ?? (index >= 0 ? args[index + 1] : undefined);
}

function removeBalancedElement(source, id) {
  const opening = new RegExp(`<([a-z][a-z0-9-]*)\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'iu').exec(source);
  if (opening === null) return source;
  const tag = opening[1];
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'giu');
  token.lastIndex = opening.index;
  let depth = 0;
  for (let match = token.exec(source); match !== null; match = token.exec(source)) {
    if (match[0].startsWith('</')) depth -= 1;
    else depth += 1;
    if (depth === 0) return source.slice(0, opening.index) + source.slice(token.lastIndex);
  }
  throw new Error(`Could not find the closing <${tag}> for #${id}.`);
}

function removeButtons(source, attribute, value) {
  const pattern = new RegExp(`<button\\b(?=[^>]*\\b${attribute}=["']${value}["'])[^>]*>[\\s\\S]*?<\\/button>`, 'giu');
  return source.replace(pattern, '');
}

export function applyKeyDerivationFeatureTemplate(template, features) {
  let rendered = template;
  for (const coin of ['bitcoin', 'dash']) {
    if (features.hasCoin(coin)) continue;
    rendered = rendered.replace(
      new RegExp(`<option\\b(?=[^>]*\\bdata-coin=["']${coin}["'])[^>]*>[^<]*<\/option>`, 'giu'),
      '',
    );
  }
  if (!features.hasCoin('bitcoin') && !features.hasCoin('dash')) {
    rendered = rendered.replace(/<option value=["']wif["'][^>]*>[^<]*<\/option>/giu, '');
  }
  const panels = {
    'wallet-matcher': 'wallet-matcher-panel',
    seedqr: 'seedqr-panel',
    slip39: 'slip39-panel',
    shamir: ['shamir-raw-panel', 'shamir-words-panel'],
    codex32: 'codex32-panel',
  };
  for (const [feature, ids] of Object.entries(panels)) {
    if (features.has(feature)) continue;
    for (const id of Array.isArray(ids) ? ids : [ids]) {
      rendered = removeBalancedElement(rendered, id);
      rendered = removeButtons(rendered, 'aria-controls', id);
    }
    const targets = feature === 'shamir' ? ['shamir-raw', 'shamir-words'] : [feature];
    for (const target of targets) rendered = removeButtons(rendered, 'data-recovery-target', target);
  }
  if (!features.has('bip38-encrypt')) rendered = removeBalancedElement(rendered, 'bulk-bip38-panel');
  if (!features.has('message-signing')) rendered = removeBalancedElement(rendered, 'message-signer-dialog');
  if (!features.hasRecovery) {
    rendered = removeBalancedElement(rendered, 'recovery-workspace');
    rendered = removeBalancedElement(rendered, 'recovery-backup-mode');
    rendered = rendered.replace(
      new RegExp(`<details\\b[^>]*class=[\"'][^\"']*recovery-source-menu[^\"']*[\"'][^>]*>[\\s\\S]*?</details>`, 'giu'),
      '',
    );
  }
  return rendered;
}

export function featureDefines(features) {
  const value = (feature) => (features.has(feature) ? 'true' : 'false');
  return {
    __CKD_FEATURE_BIP85__: value('bip85'),
    __CKD_FEATURE_BIP38_ENCRYPT__: value('bip38-encrypt'),
    __CKD_FEATURE_MESSAGE_SIGNING__: value('message-signing'),
    __CKD_FEATURE_SILENT_PAYMENTS__: value('silent-payments'),
    __CKD_FEATURE_WALLET_MATCHER__: value('wallet-matcher'),
    __CKD_FEATURE_SEEDQR__: value('seedqr'),
    __CKD_FEATURE_SLIP39__: value('slip39'),
    __CKD_FEATURE_SHAMIR__: value('shamir'),
    __CKD_FEATURE_CODEX32__: value('codex32'),
    __CKD_HAS_RECOVERY__: features.hasRecovery ? 'true' : 'false',
  };
}

export function describeCustomArtifact(path) {
  return basename(path);
}

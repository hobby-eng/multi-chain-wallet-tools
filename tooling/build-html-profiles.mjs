import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_PROFILES, profileToolIds } from './build-profiles.mjs';
import { createBuildMatrixPlan, createBuildMatrixSmokePlan } from './build-matrix-plan.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const requested = process.argv.includes('--profile')
  ? process.argv[process.argv.indexOf('--profile') + 1]
  : process.argv.find((arg) => arg.startsWith('--profile='))?.slice('--profile='.length);
const profileIds = requested === undefined ? Object.keys(BUILD_PROFILES) : [requested];
const requestedTool = process.argv.includes('--tool')
  ? process.argv[process.argv.indexOf('--tool') + 1]
  : process.argv.find((arg) => arg.startsWith('--tool='))?.slice('--tool='.length);
const featureArgs = [];
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (
    argument.startsWith('--features=') ||
    argument.startsWith('--exclude=') ||
    argument.startsWith('--coins=') ||
    argument.startsWith('--exclude-coins=') ||
    argument.startsWith('--output=')
  ) {
    featureArgs.push(argument);
  } else if (['--features', '--exclude', '--coins', '--exclude-coins', '--output'].includes(argument)) {
    featureArgs.push(argument);
    if (process.argv[index + 1] !== undefined) featureArgs.push(process.argv[++index]);
  }
}
const selectiveBuild = featureArgs.length > 0 || requestedTool !== undefined;
const selectedTool = requestedTool ?? (featureArgs.length > 0 ? 'key-derivation' : undefined);
const scripts = {
  'key-derivation': 'apps/key-derivation/scripts/build-key-derivation-html.mjs',
  'activity-viewer': 'apps/activity-viewer/scripts/build-activity-viewer-html.mjs',
  'discovery-scanner': 'apps/discovery-scanner/scripts/build-discovery-scanner-html.mjs',
  'psbt-inspector': 'apps/psbt-inspector/scripts/build-psbt-inspector-html.mjs',
};

function runBuild(script, args) {
  const result = spawnSync(process.execPath, [resolve(root, script), ...args], { cwd: root, stdio: 'inherit' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runBuildMatrix({ checkOnly = false, planOnly = false, smoke = false } = {}) {
  const plan = smoke
    ? createBuildMatrixSmokePlan(profileIds, requestedTool)
    : createBuildMatrixPlan(profileIds, requestedTool);
  const counts = new Map();
  for (const { profileId, toolId } of plan) {
    const key = `${profileId}/${toolId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (planOnly) {
    for (const [scope, count] of counts) console.log(`${scope}: ${count} builds`);
    console.log(`Total: ${plan.length} ${smoke ? 'smoke ' : ''}builds. No artifacts were generated.`);
    return;
  }
  const records = [];
  const temporaryRoot = checkOnly ? mkdtempSync(join(tmpdir(), 'ckd-build-matrix-')) : null;
  try {
    for (const [index, job] of plan.entries()) {
      const script = scripts[job.toolId];
      if (script === undefined) throw new Error(`Missing build script for ${job.toolId}.`);
      const output = resolve(root, job.relativePath);
      const buildOutput =
        temporaryRoot === null ? output : resolve(temporaryRoot, `${String(index + 1).padStart(5, '0')}.html`);
      mkdirSync(resolve(buildOutput, '..'), { recursive: true });
      const args = ['--profile', job.profileId, '--coins', job.coins.join(',')];
      if (job.features.length > 0) args.push('--features', job.features.join(','));
      args.push('--output', buildOutput);
      runBuild(script, args);
      if (checkOnly) continue;
      const bytes = readFileSync(buildOutput);
      records.push({
        profile: job.profileId,
        tool: job.toolId,
        coins: job.coins,
        features: job.features,
        path: job.relativePath,
        bytes: statSync(buildOutput).size,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    if (checkOnly) {
      console.log(`Successfully compiled ${plan.length} matrix variants.`);
      return;
    }
    const index = resolve(root, 'dist', 'build-matrix', 'matrix-index.json');
    mkdirSync(resolve(index, '..'), { recursive: true });
    writeFileSync(index, `${JSON.stringify({ schemaVersion: 1, artifacts: records }, null, 2)}\n`);
    console.log(`Built ${records.length} matrix artifacts; index: ${relative(root, index)}`);
  } finally {
    if (temporaryRoot !== null) rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv.includes('--matrix')) {
  const smoke = process.argv.includes('--smoke');
  runBuildMatrix({
    checkOnly: smoke || process.argv.includes('--check'),
    planOnly: process.argv.includes('--plan'),
    smoke,
  });
  process.exit(0);
}

for (const profileId of profileIds) {
  if (BUILD_PROFILES[profileId] === undefined) {
    throw new Error(`Unknown build profile "${profileId}". Expected multi-chain or dash-community.`);
  }
  for (const toolId of profileToolIds(BUILD_PROFILES[profileId])) {
    if (selectedTool !== undefined && toolId !== selectedTool) continue;
    const script = scripts[toolId];
    if (script === undefined) throw new Error(`Missing build script for ${toolId}.`);
    runBuild(script, ['--profile', profileId, ...(selectedTool === toolId ? featureArgs : [])]);
  }
  if (selectiveBuild) continue;
  const manifest = spawnSync(
    process.execPath,
    [resolve(root, 'tooling/create-release-manifest.mjs'), '--profile', profileId],
    { cwd: root, stdio: 'inherit' },
  );
  if (manifest.error !== undefined) throw manifest.error;
  if (manifest.status !== 0) process.exit(manifest.status ?? 1);
}

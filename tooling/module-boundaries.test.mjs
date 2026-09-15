import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const productionRoots = ['apps', 'packages', 'tooling'];
const aliasOwners = new Map([
  ['core', 'crypto-core'],
  ['coins', 'coin-protocols'],
  ['export', 'export-core'],
  ['dash-network', 'dash-network'],
  ['editions', 'edition-profiles'],
  ['public-data-providers', 'public-data-providers'],
  ['secret-boundary', 'secret-boundary'],
  ['network-boundary', 'network-boundary'],
  ['ui', 'shared-ui'],
  ['secret-vault', 'secret-vault'],
  ['recovery', 'wallet-recovery'],
]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !['node_modules', 'dist', 'test-results'].includes(entry.name)) return sourceFiles(path);
    return entry.isFile() && /\.(?:ts|mjs)$/u.test(entry.name) && !/\.test\.(?:ts|mjs)$/u.test(entry.name)
      ? [path]
      : [];
  });
}

function imports(text) {
  const values = [];
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gu;
  for (const match of text.matchAll(pattern)) values.push(match[1]);
  return values;
}

function packageOwner(path) {
  const match = /(?:^|\/)packages\/([^/]+)\//u.exec(path);
  return match?.[1];
}

describe('module boundaries', () => {
  const files = productionRoots.flatMap((directory) => sourceFiles(join(root, directory)));

  it('keeps applications and packages pointing inward', () => {
    const violations = [];
    for (const file of files) {
      const rel = relative(root, file).replaceAll('\\', '/');
      for (const specifier of imports(readFileSync(file, 'utf8'))) {
        if (rel.startsWith('packages/') && specifier.includes('/apps/')) violations.push(rel + ' -> ' + specifier);
        if (rel.startsWith('apps/')) {
          const owner = rel.split('/')[1];
          const target = resolve(dirname(file), specifier);
          const targetRel = relative(root, target).replaceAll('\\', '/');
          if (specifier.startsWith('.') && targetRel.startsWith('apps/') && targetRel.split('/')[1] !== owner)
            violations.push(rel + ' -> ' + specifier);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps shared-package aliases acyclic', () => {
    const graph = new Map();
    for (const file of files) {
      const owner = packageOwner(file);
      if (owner === undefined) continue;
      const edges = graph.get(owner) ?? new Set();
      for (const specifier of imports(readFileSync(file, 'utf8'))) {
        const alias = /^@ckd\/([^/]+)/u.exec(specifier)?.[1];
        const target = alias === undefined ? undefined : aliasOwners.get(alias);
        if (target !== undefined && target !== owner) edges.add(target);
      }
      graph.set(owner, edges);
    }
    const visiting = new Set();
    const visited = new Set();
    const visit = (node, path) => {
      if (visiting.has(node)) throw new Error('Package cycle: ' + [...path, node].join(' -> '));
      if (visited.has(node)) return;
      visiting.add(node);
      for (const next of graph.get(node) ?? []) visit(next, [...path, node]);
      visiting.delete(node);
      visited.add(node);
    };
    for (const node of graph.keys()) visit(node, []);
  });

  it('keeps public-address Activity hosts independent of Dash runtimes', () => {
    const offenders = [
      'apps/activity-viewer/src/public-address-view.ts',
      'apps/activity-viewer/src/external-activity.ts',
    ].filter((path) => imports(readFileSync(join(root, path), 'utf8')).some((value) => value.includes('dash-network')));
    expect(offenders).toEqual([]);
  });

  it('keeps network-boundary independent of provider and secret implementations', () => {
    const offenders = files
      .filter((file) => relative(root, file).replaceAll('\\', '/').startsWith('packages/network-boundary/'))
      .filter((file) =>
        imports(readFileSync(file, 'utf8')).some(
          (value) => value.startsWith('@ckd/public-data-providers') || value.startsWith('@ckd/secret-boundary'),
        ),
      );
    expect(offenders.map((file) => relative(root, file))).toEqual([]);
  });
});

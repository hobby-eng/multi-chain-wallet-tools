import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ignoredDirectoryNames = new Set(['.git', '.pnpm-store', 'node_modules', 'target']);

function collectFiles(root, relativePath, output) {
  const absolute = resolve(root, relativePath);
  if (statSync(absolute).isFile()) {
    output.push(relativePath);
    return;
  }
  for (const entry of readdirSync(absolute).sort()) {
    if (ignoredDirectoryNames.has(entry)) continue;
    collectFiles(root, join(relativePath, entry), output);
  }
}

export function createBuildInfo(root, checksumFile) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const files = [];
  for (const path of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.json',
    'vitest.config.ts',
    'apps',
    'packages',
    'test',
    'tooling',
  ]) collectFiles(root, path, files);

  const hash = createHash('sha256');
  for (const file of files.sort()) {
    const normalized = file.replaceAll('\\', '/');
    hash.update(normalized);
    hash.update('\0');
    hash.update(readFileSync(resolve(root, file)));
    hash.update('\0');
  }
  return {
    version: String(manifest.version),
    releaseDate: String(manifest.releaseDate),
    fingerprint: hash.digest('hex'),
    checksumFile,
  };
}

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

it('updates release metadata without rewriting audit dates, commits or evidence', async () => {
  const source = fileURLToPath(new URL('..', import.meta.url));
  const root = mkdtempSync(resolve(tmpdir(), 'wallet-audit-metadata-'));
  try {
    const paths = [
      'tooling/sync-project-metadata.mjs',
      'tooling/project-metadata.mjs',
      'packages/dash-shielded-wasm/rust/Cargo.toml',
      'packages/dash-shielded-wasm/rust/Cargo.lock',
      'packages/recovery-shamir-wasm/rust/Cargo.toml',
      'packages/recovery-shamir-wasm/rust/Cargo.lock',
      'packages/recovery-codex32-wasm/rust/Cargo.toml',
      'packages/recovery-codex32-wasm/rust/Cargo.lock',
      'packages/recovery-sskr-wasm/rust/Cargo.toml',
      'packages/recovery-sskr-wasm/rust/Cargo.lock',
      'packages/recovery-envelope-wasm/rust/Cargo.toml',
      'packages/recovery-envelope-wasm/rust/Cargo.lock',
      'THIRD_PARTY_NOTICES.md',
      'SECURITY_AUDIT.md',
      'docs/reference/DASH_IMPLEMENTATION.md',
      'docs/audits/audit-01-2026-09-08.json',
    ];
    for (const path of paths) {
      mkdirSync(dirname(resolve(root, path)), { recursive: true });
      cpSync(resolve(source, path), resolve(root, path));
    }
    mkdirSync(resolve(root, 'apps'));
    const manifest = JSON.parse(readFileSync(resolve(source, 'package.json'), 'utf8'));
    manifest.version = '9.9.9';
    manifest.releaseDate = '2030-01-01';
    writeFileSync(resolve(root, 'package.json'), JSON.stringify(manifest));
    mkdirSync(resolve(root, 'docs/releases'), { recursive: true });
    writeFileSync(
      resolve(root, 'docs/releases/v9.9.9.md'),
      '# Multi-Chain Wallet Tools v0.1.3\nBoth editions carry version 0.1.3.\n',
    );
    await import(/* @vite-ignore */ pathToFileURL(resolve(root, 'tooling/sync-project-metadata.mjs')).href);
    for (const path of [
      'SECURITY_AUDIT.md',
      'docs/reference/DASH_IMPLEMENTATION.md',
      'docs/audits/audit-01-2026-09-08.json',
    ]) {
      expect(readFileSync(resolve(root, path), 'utf8')).toBe(readFileSync(resolve(source, path), 'utf8'));
    }
    for (const rustPackage of [
      'dash-shielded-wasm',
      'recovery-shamir-wasm',
      'recovery-codex32-wasm',
      'recovery-sskr-wasm',
      'recovery-envelope-wasm',
    ]) {
      expect(readFileSync(resolve(root, `packages/${rustPackage}/rust/Cargo.toml`), 'utf8')).toContain(
        'version = "9.9.9"',
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

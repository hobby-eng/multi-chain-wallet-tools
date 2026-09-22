import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { verifyCargoLock, verifyDependencyProvenance, verifyPnpmLock } from './verify-dependency-provenance.mjs';

describe('dependency provenance verifier', () => {
  it('requires package-manager hashes and full git commits', () => {
    expect(
      verifyPnpmLock(
        "lockfileVersion: '9.0'\npackages:\n  example@1.0.0:\n    resolution: {integrity: sha512-YWJjZA==}\nsnapshots:\n",
      ),
    ).toBe(1);
    expect(() =>
      verifyPnpmLock("lockfileVersion: '9.0'\npackages:\n  example@1.0.0:\n    resolution: {}\nsnapshots:\n"),
    ).toThrow(/SHA-512/u);
    expect(
      verifyCargoLock(
        '[[package]]\nname = "registry"\nversion = "1.0.0"\nsource = "registry+x"\nchecksum = "' +
          'a'.repeat(64) +
          '"\n\n[[package]]\nname = "git"\nversion = "1.0.0"\nsource = "git+https://example.invalid/repo#' +
          'b'.repeat(40) +
          '"\n',
        'fixture',
      ),
    ).toBe(2);
    expect(() =>
      verifyCargoLock(
        '[[package]]\nname = "git"\nversion = "1.0.0"\nsource = "git+https://example.invalid/repo#abc"\n',
        'fixture',
      ),
    ).toThrow(/full commit/u);
  });

  it('fails on an available upstream with a different commit', async () => {
    const root = fixtureRoot();
    await expect(
      verifyDependencyProvenance({
        root,
        writeReport: false,
        verifyFixedSources: false,
        fetchImpl: vi.fn(async () => ({ ok: true, json: async () => ({ sha: '0'.repeat(40) }) })),
        logger: { log: vi.fn(), warn: vi.fn() },
      }),
    ).rejects.toThrow(/provenance mismatch/u);
  });

  it('permits an unavailable upstream with an explicit warning for every source', async () => {
    const root = fixtureRoot();
    const warn = vi.fn();
    const report = await verifyDependencyProvenance({
      root,
      writeReport: false,
      verifyFixedSources: false,
      fetchImpl: vi.fn(async () => {
        throw new Error('offline');
      }),
      logger: { log: vi.fn(), warn },
    });
    expect(report.github.every((entry) => entry.status === 'unavailable')).toBe(true);
    expect(warn).toHaveBeenCalledTimes(report.github.length);
  });
});

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'ckd-provenance-'));
  writeFileSync(
    join(root, 'pnpm-lock.yaml'),
    "lockfileVersion: '9.0'\npackages:\n  example@1.0.0:\n    resolution: {integrity: sha512-YWJjZA==}\nsnapshots:\n",
  );
  for (const path of [
    'packages/dash-shielded-wasm/rust/Cargo.lock',
    'packages/recovery-shamir-wasm/rust/Cargo.lock',
    'packages/recovery-codex32-wasm/rust/Cargo.lock',
    'packages/recovery-sskr-wasm/rust/Cargo.lock',
    'packages/recovery-envelope-wasm/rust/Cargo.lock',
  ]) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(
      join(root, path),
      '[[package]]\nname = "registry"\nversion = "1.0.0"\nsource = "registry+x"\nchecksum = "' + 'a'.repeat(64) + '"\n',
    );
  }
  const sourceFiles = [
    'packages/recovery-backup/src/seedqr.ts',
    'packages/recovery-backup/tests/seedqr.test.ts',
    'packages/recovery-mhfe-wasm/generated/mhfe.js',
    'packages/recovery-mhfe-wasm/generated/mhfe.d.ts',
    'packages/recovery-mhfe-wasm/generated/mhfe_bg.wasm',
    'packages/recovery-mhfe-wasm/generated/mhfe_bg.wasm.d.ts',
    'apps/key-derivation/src/workers/mhfe-backup-worker.ts',
    'apps/key-derivation/src/ui/recovery-mhfe.ts',
    'packages/recovery-backup/src/slip39.ts',
    'packages/recovery-backup/src/slip39-wordlist.ts',
    'packages/recovery-backup/tests/slip39-official-vectors.json',
    'packages/recovery-backup/tests/slip39.test.ts',
    'packages/recovery-shamir-wasm/rust/src/lib.rs',
    'packages/recovery-backup/src/shamir.ts',
    'packages/recovery-backup/tests/shamir.test.ts',
    'packages/recovery-codex32-wasm/rust/src/lib.rs',
    'packages/recovery-backup/src/codex32.ts',
    'packages/recovery-backup/tests/codex32.test.ts',
    'packages/recovery-backup/tests/fixtures/bip93-vectors.json',
    'packages/recovery-sskr-wasm/rust/src/lib.rs',
    'packages/recovery-backup/src/sskr.ts',
    'packages/recovery-backup/src/self-test-sskr.ts',
    'packages/recovery-envelope-wasm/rust/src/lib.rs',
    'packages/recovery-backup/src/gordian-envelope.ts',
    'packages/recovery-backup/src/self-test-gordian-envelope.ts',
    'packages/shared-ui/src/payment-qr.ts',
    'packages/shared-ui/src/qr-image-import.ts',
    'packages/shared-ui/src/qr-image-import.test.ts',
  ];
  for (const path of sourceFiles) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), path);
  }
  return root;
}

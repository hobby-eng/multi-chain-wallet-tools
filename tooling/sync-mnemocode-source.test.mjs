import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MNEMOCODE_FILES,
  MNEMOCODE_MANIFEST,
  MNEMOCODE_SOURCE_DIRECTORY,
  assertAllowedImports,
  importedSpecifiers,
  selectReleaseTag,
  verifyMnemoCodeSource,
} from './sync-mnemocode-source.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const commit = (digit) => digit.repeat(40);

describe('MnemoCode core vendoring', () => {
  it('prefers the highest release tag and ignores pre-release or malformed tags', () => {
    const listing = [
      `${commit('a')}\trefs/tags/v0.1.0`,
      `${commit('b')}\trefs/tags/v0.10.0`,
      `${commit('c')}\trefs/tags/v0.2.9`,
      `${commit('d')}\trefs/tags/v1.0.0-rc.1`,
      `${commit('e')}\trefs/tags/nightly`,
    ].join('\n');
    expect(selectReleaseTag(listing)).toMatchObject({ reference: 'v0.10.0', commit: commit('b') });
    expect(selectReleaseTag(`${commit('d')}\trefs/tags/v1.0.0-rc.1`)).toBeUndefined();
    expect(selectReleaseTag('')).toBeUndefined();
  });

  it('allows only the shared BIP39 package and files inside the vendored core', () => {
    expect(() =>
      assertAllowedImports(
        'core/words.ts',
        "import { validateMnemonic } from '@scure/bip39';\nimport { x } from './types.js';\n",
      ),
    ).not.toThrow();
    for (const specifier of [
      'node:fs',
      'qrcode',
      'pdf-lib',
      '@scure/bip32',
      '../sskr/shares.js',
      '../../vendor/x.js',
    ]) {
      expect(() => assertAllowedImports('core/words.ts', `import { x } from '${specifier}';\n`)).toThrow();
    }
    expect(() => assertAllowedImports('core.ts', "export { x } from './core/missing.js';\n")).toThrow(/outside/u);
    expect(() => assertAllowedImports('core.ts', "const x = await import('node:crypto');\n")).toThrow();
    expect(importedSpecifiers("import type { A } from './a.js';\nexport * from './b.js';")).toEqual([
      './a.js',
      './b.js',
    ]);
  });

  it('matches the committed manifest, file set and shared dependency version', () => {
    const manifest = verifyMnemoCodeSource({ root });
    expect(manifest.commit).toMatch(/^[0-9a-f]{40}$/u);
    expect(Object.keys(manifest.files).sort()).toEqual(Object.values(MNEMOCODE_FILES).sort());
    const project = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    expect(manifest.sharedDependencies['@scure/bip39']).toBe(project.dependencies['@scure/bip39']);
  });

  it('keeps the adapter version equal to the vendored core version', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, MNEMOCODE_MANIFEST), 'utf8'));
    const adapter = readFileSync(resolve(root, 'packages/recovery-backup/src/mnemocode.ts'), 'utf8');
    expect(adapter).toContain(`export const MNEMOCODE_VERSION = '${manifest.version}';`);
    expect(adapter).toContain('../../recovery-mnemocode/source/core.js');
    expect(MNEMOCODE_SOURCE_DIRECTORY).toBe('packages/recovery-mnemocode/source');
  });
});

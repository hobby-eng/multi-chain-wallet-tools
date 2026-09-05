import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createBuildInfo } from './build-metadata.mjs';
import { BUILD_PROFILES, getToolBuild } from './build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

describe('build metadata profiles', () => {
  it('records edition identity and profile-specific checksum filenames', () => {
    const multi = BUILD_PROFILES['multi-chain'];
    const dash = BUILD_PROFILES['dash-community'];
    const multiTool = getToolBuild(multi, 'key-derivation');
    const dashTool = getToolBuild(dash, 'key-derivation');
    const multiInfo = createBuildInfo(root, multiTool.checksumFile, multi);
    const dashInfo = createBuildInfo(root, dashTool.checksumFile, dash);

    expect(multiInfo).toMatchObject({
      profile: 'multi-chain',
      edition: 'Multi-Chain Edition',
      checksumFile: 'Wallet_Key_Derivation_Tool.html.sha256',
    });
    expect(dashInfo).toMatchObject({
      profile: 'dash-community',
      edition: 'Dash Community Edition',
      checksumFile: 'Dash_Community_Key_Derivation_Tool.html.sha256',
    });
    expect(dashInfo.fingerprint).toBe(multiInfo.fingerprint);
  });
});

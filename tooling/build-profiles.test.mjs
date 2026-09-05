import { describe, expect, it } from 'vitest';
import {
  assertDashOnlyGraph,
  BUILD_PROFILES,
  getToolBuild,
  profileArtifacts,
} from './build-profiles.mjs';

describe('build profiles', () => {
  it('keeps existing Multi-Chain artifact names stable', () => {
    expect(profileArtifacts(BUILD_PROFILES['multi-chain'])).toEqual([
      'activity-viewer/Wallet_Activity_Viewer.html',
      'discovery-scanner/Wallet_Discovery_Scanner.html',
      'key-derivation/Wallet_Key_Derivation_Tool.html',
    ]);
  });

  it('uses explicit Dash Community entrypoints and filenames', () => {
    const profile = BUILD_PROFILES['dash-community'];
    expect(profileArtifacts(profile)).toEqual([
      'dash-community/activity-viewer/Dash_Community_Activity_Viewer.html',
      'dash-community/discovery-scanner/Dash_Community_Discovery_Scanner.html',
      'dash-community/key-derivation/Dash_Community_Key_Derivation_Tool.html',
    ]);
    expect(getToolBuild(profile, 'key-derivation')).toMatchObject({
      entryPoint: 'apps/key-derivation/src/ui/app-dash-community.ts',
      workerEntryPoint: 'apps/key-derivation/src/workers/derive-worker-dash-community.ts',
    });
    expect(getToolBuild(profile, 'activity-viewer').entryPoint).toContain('app-dash-community.ts');
    expect(getToolBuild(profile, 'discovery-scanner').entryPoint).toContain('app-dash-community.ts');
  });

  it('rejects current and future non-Dash modules from Dash build graphs', () => {
    expect(() => assertDashOnlyGraph([
      'packages/coin-protocols/src/coins/registry-base.ts',
      'packages/coin-protocols/src/coins/adapters/dash.ts',
      'packages/coin-protocols/src/coins/dash/core.ts',
      'apps/discovery-scanner/src/coins/dash-community.ts',
      'apps/discovery-scanner/src/coins/dash/platform-scanner.ts',
    ], 'fixture')).not.toThrow();
    for (const input of [
      'packages/coin-protocols/src/coins/adapters/bitcoin.ts',
      'packages/coin-protocols/src/coins/adapters/future-coin.ts',
      'packages/coin-protocols/src/coins/future-coin/index.ts',
      'packages/coin-protocols/src/coins/registry.ts',
      'apps/discovery-scanner/src/coins/index.ts',
      'apps/discovery-scanner/src/coins/future-coin/index.ts',
    ]) {
      expect(() => assertDashOnlyGraph([input], 'fixture')).toThrow('outside the Dash allowlist');
    }
  });
});

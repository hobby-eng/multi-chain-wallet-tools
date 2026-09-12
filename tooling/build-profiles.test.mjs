import { describe, expect, it } from 'vitest';
import {
  assertDashOnlyGraph,
  BUILD_PROFILES,
  applyProfileTemplate,
  getToolBuild,
  profileArtifacts,
} from './build-profiles.mjs';

describe('build profiles', () => {
  it('places Multi-Chain artifacts in their edition directory', () => {
    expect(profileArtifacts(BUILD_PROFILES['multi-chain'])).toEqual([
      'multi-chain-edition/activity-viewer/Wallet_Activity_Viewer.html',
      'multi-chain-edition/discovery-scanner/Wallet_Discovery_Scanner.html',
      'multi-chain-edition/key-derivation/Wallet_Key_Derivation_Tool.html',
      'multi-chain-edition/psbt-inspector/PSBT_Multisig_Inspector.html',
    ]);
  });

  it('uses explicit Dash Community entrypoints and filenames', () => {
    const profile = BUILD_PROFILES['dash-community'];
    expect(profileArtifacts(profile)).toEqual([
      'dash-community-edition/activity-viewer/Dash_Community_Activity_Viewer.html',
      'dash-community-edition/discovery-scanner/Dash_Community_Discovery_Scanner.html',
      'dash-community-edition/key-derivation/Dash_Community_Key_Derivation_Tool.html',
      'dash-community-edition/psbt-inspector/Dash_Community_PSBT_Multisig_Inspector.html',
    ]);
    expect(getToolBuild(profile, 'key-derivation')).toMatchObject({
      entryPoint: 'apps/key-derivation/src/ui/app-dash-community.ts',
      workerEntryPoint: 'apps/key-derivation/src/workers/derive-worker-dash-community.ts',
    });

    expect(getToolBuild(profile, 'activity-viewer').entryPoint).toContain('app-dash-community.ts');
    expect(getToolBuild(profile, 'discovery-scanner').entryPoint).toContain('app-dash-community.ts');
    expect(getToolBuild(profile, 'psbt-inspector')).toMatchObject({
      entryPoint: 'apps/psbt-inspector/src/app.ts',
      artifactName: 'Dash_Community_PSBT_Multisig_Inspector.html',
    });
  });

  it('omits the recovery coin selector only from Dash Community HTML', () => {
    const template = '<main>__RECOVERY_COIN_FIELD__</main>';
    const multi = applyProfileTemplate(template, BUILD_PROFILES['multi-chain'], getToolBuild(BUILD_PROFILES['multi-chain'], 'discovery-scanner'));
    const dash = applyProfileTemplate(template, BUILD_PROFILES['dash-community'], getToolBuild(BUILD_PROFILES['dash-community'], 'discovery-scanner'));
    expect(multi).toContain('id="recovery-coin"');
    expect(dash).toBe('<main></main>');
  });

  it('keeps the activity coin selector in Multi-Chain with Bitcoin selected', () => {
    const template = '<main>__ACTIVITY_COIN_CONTROL__</main>';
    const multi = applyProfileTemplate(template, BUILD_PROFILES['multi-chain'], getToolBuild(BUILD_PROFILES['multi-chain'], 'activity-viewer'));
    const dash = applyProfileTemplate(template, BUILD_PROFILES['dash-community'], getToolBuild(BUILD_PROFILES['dash-community'], 'activity-viewer'));
    expect(multi).toContain('id="viewer-coin"');
    expect(multi).toContain('value="bitcoin" selected');
    expect(dash).toBe('<main></main>');
  });

  it('excludes the Bitcoin signature-format selector from Dash Community', () => {
    const template = '__KEY_DERIVATION_SIGNER_FORMAT_FIELD__';
    const multi = applyProfileTemplate(template, BUILD_PROFILES['multi-chain'], getToolBuild(BUILD_PROFILES['multi-chain'], 'key-derivation'));
    const dash = applyProfileTemplate(template, BUILD_PROFILES['dash-community'], getToolBuild(BUILD_PROFILES['dash-community'], 'key-derivation'));
    expect(multi).toContain('id="message-signer-format-select"');
    expect(multi).toContain('bitcoin-bip322-legacy');
    expect(dash).toBe('');
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

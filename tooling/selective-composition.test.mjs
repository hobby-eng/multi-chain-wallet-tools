import { describe, expect, it } from 'vitest';
import { assertActivityViewerComposition } from './activity-viewer-composition.mjs';
import { assertDiscoveryComposition } from './discovery-composition.mjs';
import { assertKeyDerivationComposition } from './key-derivation-composition.mjs';
import { assertPsbtComposition } from './psbt-inspector-composition.mjs';

const options = (coins, features = []) => ({
  coins,
  hasCoin: (coin) => coins.includes(coin),
  has: (feature) => features.includes(feature),
});

describe('selective bundle graph guards', () => {
  it('requires the complete Dash Activity suite and rejects it when Dash is excluded', () => {
    const dashInputs = [
      'apps/activity-viewer/src/dash-core-activity.ts',
      'apps/activity-viewer/src/dash-platform-activity.ts',
      'apps/activity-viewer/src/dash-identity-activity.ts',
      'apps/activity-viewer/src/dash-orchard-activity.ts',
    ];
    expect(() => assertActivityViewerComposition(options(['dash']), dashInputs)).not.toThrow();
    expect(() => assertActivityViewerComposition(options(['dash']), dashInputs.slice(1))).toThrow(/complete Dash/u);
    expect(() =>
      assertActivityViewerComposition(options(['bitcoin']), [
        'apps/activity-viewer/src/activity-bitcoin.ts',
        ...dashInputs,
      ]),
    ).toThrow(/excluded dash/u);
  });

  it('requires BIP85 UI, child wallet and worker together', () => {
    const selected = options(['bitcoin'], ['bip85']);
    const inputs = [
      'apps/key-derivation/src/ui/bip85-feature.ts',
      'apps/key-derivation/src/ui/bip85-child-wallet-feature.ts',
      'apps/key-derivation/src/workers/bip85-deriver.ts',
    ];
    expect(() => assertKeyDerivationComposition(selected, inputs)).not.toThrow();
    expect(() => assertKeyDerivationComposition(selected, inputs.slice(1))).toThrow(/bip85-feature/u);
    expect(() => assertKeyDerivationComposition(options(['bitcoin']), inputs)).toThrow(/excluded/u);
  });

  it('keeps Discovery seed and watch-only input runtimes independently selectable', () => {
    expect(() =>
      assertDiscoveryComposition(options(['bitcoin'], ['seed-discovery']), [
        'apps/discovery-scanner/src/coins/bitcoin/seed.ts',
        'apps/discovery-scanner/src/seed-scan-input.ts',
        'apps/discovery-scanner/src/candidate-scan.ts',
        'packages/secret-vault/src/worker-bootstrap.ts',
      ]),
    ).not.toThrow();
    expect(() =>
      assertDiscoveryComposition(options(['bitcoin'], ['watch-only-discovery']), [
        'apps/discovery-scanner/src/coins/bitcoin/watch-adapter.ts',
        'apps/discovery-scanner/src/watch-only-input.ts',
        'packages/wallet-recovery/src/watch-only/index.ts',
      ]),
    ).not.toThrow();
    expect(() =>
      assertDiscoveryComposition(options(['bitcoin'], ['watch-only-discovery']), [
        'apps/discovery-scanner/src/coins/bitcoin/watch-adapter.ts',
        'apps/discovery-scanner/src/watch-only-input.ts',
        'apps/discovery-scanner/src/seed-scan-input.ts',
      ]),
    ).toThrow(/excluded seed-discovery/u);
  });

  it('requires every selected PSBT workflow engine and rejects excluded engines', () => {
    const psbtInputs = [
      'apps/psbt-inspector/src/psbt-decoder-feature.ts',
      'apps/psbt-inspector/src/psbt.ts',
      'apps/psbt-inspector/src/signing-commitments.ts',
      'apps/psbt-inspector/src/transaction-display.ts',
    ];
    expect(() => assertPsbtComposition(options(['bitcoin'], ['psbt-decoder']), psbtInputs)).not.toThrow();
    expect(() => assertPsbtComposition(options(['bitcoin'], ['psbt-decoder']), psbtInputs.slice(1))).toThrow(
      /psbt-decoder-feature/u,
    );
    expect(() => assertPsbtComposition(options(['bitcoin']), psbtInputs)).toThrow(/excluded psbt-decoder/u);
  });
});

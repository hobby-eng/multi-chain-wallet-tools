import { describe, expect, it } from 'vitest';
import { applyActivityCoinTemplate, assertActivityViewerComposition } from './activity-viewer-composition.mjs';
import {
  applyDiscoveryFeatureTemplate,
  assertDiscoveryComposition,
  discoveryNetworkRuntimeSource,
} from './discovery-composition.mjs';
import { applySelectedNetworkCsp, assertSafeCustomOutput } from './tool-feature-options.mjs';
import { resolve } from 'node:path';
import { assertKeyDerivationComposition, selectedWorkerEntry } from './key-derivation-composition.mjs';
import { assertPsbtComposition } from './psbt-inspector-composition.mjs';

const options = (coins, features = []) => ({
  coins,
  hasCoin: (coin) => coins.includes(coin),
  has: (feature) => features.includes(feature),
});

describe('selective bundle graph guards', () => {
  it('pins fixed provider origins in connected builds without Dash', () => {
    const rendered = applySelectedNetworkCsp('connect-src https:;', options(['bitcoin', 'ethereum']));
    expect(rendered).toContain('https://blockstream.info');
    expect(rendered).toContain('https://ethereum-rpc.publicnode.com');
    expect(rendered).not.toContain('connect-src https:;');
    expect(applySelectedNetworkCsp('connect-src https:;', options(['dash']))).toBe('connect-src https:;');
  });

  it('reserves canonical release directories from selective --output paths', () => {
    const root = '/workspace';
    expect(() =>
      assertSafeCustomOutput(root, resolve(root, 'dist/multi-chain-edition/Wallet_Activity_Viewer.html')),
    ).toThrow(/Canonical release artifacts/u);
    expect(() => assertSafeCustomOutput(root, resolve(root, 'dist/custom-builds/viewer.html'))).not.toThrow();
  });

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

  it('removes Dash-only controls and copy from public-address Activity templates', () => {
    const template = `
      <select><option value="bitcoin">Bitcoin</option><option value="dash">Dash</option></select>
      <div class="viewer-detection-tabs"><button>Auto</button></div>
      <div id="viewer-advanced-modes"><div><button>Dash Core</button></div></div>
      <label for="viewer-network">Dash network</label>
      <p class="field-note">Choose the network containing the address, Identity, or Orchard activity.</p>
      <div id="viewer-capability-controls"><div>Orchard</div></div>
      <div id="viewer-history-field"><input></div>
      <div id="viewer-batch-controls"><div>Orchard pages</div></div>
      <label id="viewer-input-label" for="full-viewing-key">Any supported Dash lookup</label>
      <input placeholder="Core, Platform, Identity, or Orchard viewing key">
      <textarea placeholder="One Core, Platform, Identity, or Orchard input per line"></textarea>
      <p id="viewer-input-help" class="field-note">Mixed batches may contain Dash and Orchard.</p>
      <button id="reveal-viewing-key">Reveal key</button><button id="reveal-batch-input">Reveal keys</button>
      <code id="viewer-runtime">Core, Platform, Identity &amp; Orchard network reads</code
      >
      <span id="viewer-crypto-self-test-status">Cryptographic self-test running…</span
      >
      <div><code id="viewer-build-fingerprint">fingerprint</code></div>
      <p id="viewer-crypto-self-test-details" class="field-note">Queries remain disabled.</p>
      <p class="field-note passport-dependencies">Dash Orchard dependencies.</p>
      <p class="field-note"><strong>Upstream attribution:</strong> Dash Platform and Dash Orchard.</p>
      <footer><div class="footer-main"><p>Dash providers</p><p>Safe</p></div></footer>`;
    const rendered = applyActivityCoinTemplate(template, options(['bitcoin']));
    expect(rendered).not.toMatch(/\b(?:Dash|Orchard)\b/u);
    expect(rendered).not.toContain('data-viewer-mode');
    expect(rendered).not.toContain('reveal-viewing-key');
    expect(rendered).toContain('id="viewer-advanced-modes" hidden');
    expect(rendered).toContain('id="viewer-capability-controls" hidden');
    expect(rendered).toContain('id="viewer-build-fingerprint"');
  });

  it('selects signing workers from coins rather than visual edition', () => {
    const profile = { id: 'multi-chain' };
    const dashWorker = selectedWorkerEntry('/workspace', profile, options(['dash'], ['message-signing']));
    expect(dashWorker).toContain('message-signer-dash.ts');
    expect(dashWorker).not.toContain('message-signer.ts');
    const bitcoinWorker = selectedWorkerEntry('/workspace', profile, options(['bitcoin'], ['message-signing']));
    expect(bitcoinWorker).toContain('message-signer.ts');
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

  it('generates only the network operations selected for each Discovery coin set', () => {
    const dash = discoveryNetworkRuntimeSource('/workspace', options(['dash']));
    expect(dash).toContain("case 'core.status'");
    expect(dash).toContain("case 'shielded.page'");
    expect(dash).not.toMatch(/bitcoin|ethereum|address\.history|utxo\.addresses|evm\.accounts/iu);

    const bitcoin = discoveryNetworkRuntimeSource('/workspace', options(['bitcoin']));
    expect(bitcoin).toContain("case 'address.history'");
    expect(bitcoin).toContain("case 'utxo.addresses'");
    expect(bitcoin).not.toMatch(/core\.|platform\.|shielded\.|ethereum|evm\.accounts/iu);
  });

  it('physically removes seed controls from watch-only Discovery HTML', () => {
    const template = `<div><button id="seed-source-tab">Seed phrase</button><button id="public-source-tab" class="recovery-mode-tab primary-mode-tab" aria-selected="false" tabindex="-1">Public keys</button></div>
      <div id="seed-source-panel"><textarea id="single-mnemonic"></textarea><input id="single-passphrase"><textarea id="batch-mnemonics"></textarea><textarea id="batch-passphrases"></textarea></div>
      <div class="secret-actions"><button id="reveal-recovery-input">Reveal sensitive input</button></div>
      <p>Secret Vault</p>
      <p>If funds are found, copy the address, then restore the phrase with a standard wallet. Never use a mnemonic that still protects valuable funds on an untrusted computer.</p>
      <p>use your original recovery phrase or wallet backup, confirm paths. The export intentionally contains no mnemonic, passphrase, seed, private key, spending key, or viewing key.</p>`;
    const rendered = applyDiscoveryFeatureTemplate(template, options(['bitcoin'], ['watch-only-discovery']));
    expect(rendered).not.toMatch(
      /seed-source|single-mnemonic|batch-mnemonics|Secret Vault|recovery phrase|mnemonic|passphrase/u,
    );
    expect(rendered).toContain('Public Input Boundary');
    expect(rendered).toContain('aria-selected="true"');
  });

  it('keeps Discovery seed and watch-only input runtimes independently selectable', () => {
    expect(() =>
      assertDiscoveryComposition(options(['bitcoin'], ['seed-discovery']), [
        'packages/network-boundary/src/request-validation.ts',
        'apps/discovery-scanner/src/coins/bitcoin/seed.ts',
        'apps/discovery-scanner/src/seed-scan-input.ts',
        'apps/discovery-scanner/src/candidate-scan.ts',
        'packages/secret-vault/src/worker-bootstrap.ts',
      ]),
    ).not.toThrow();
    expect(() =>
      assertDiscoveryComposition(options(['bitcoin'], ['watch-only-discovery']), [
        'packages/network-boundary/src/request-validation.ts',
        'apps/discovery-scanner/src/coins/bitcoin/watch-adapter.ts',
        'apps/discovery-scanner/src/watch-only-input.ts',
        'packages/wallet-recovery/src/watch-only/index.ts',
      ]),
    ).not.toThrow();
    expect(() =>
      assertDiscoveryComposition(options(['bitcoin'], ['watch-only-discovery']), [
        'packages/network-boundary/src/request-validation.ts',
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

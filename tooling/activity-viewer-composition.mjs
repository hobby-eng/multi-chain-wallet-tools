import { resolve } from 'node:path';

export function activityViewerEntry(root, options) {
  const lines = [];
  if (options.hasCoin('dash')) {
    lines.push(
      `import { startActivityViewer } from ${JSON.stringify(resolve(root, 'apps/activity-viewer/src/start.ts'))};`,
    );
    lines.push('const view = startActivityViewer();');
  } else {
    lines.push(
      `import { BUILD_INFO } from ${JSON.stringify(resolve(root, 'packages/build-security/src/build-info.ts'))};`,
    );
    lines.push(
      `import { createPublicAddressActivityView } from ${JSON.stringify(resolve(root, 'apps/activity-viewer/src/public-address-view.ts'))};`,
    );
    lines.push('const view = createPublicAddressActivityView(document, BUILD_INFO);');
  }
  if (options.hasCoin('bitcoin') || options.hasCoin('ethereum')) {
    lines.push(
      `import { installExternalActivity } from ${JSON.stringify(resolve(root, 'apps/activity-viewer/src/external-activity.ts'))};`,
    );
    lines.push("import { SELECTED_EXTERNAL_ACTIVITY_ADAPTERS } from 'ckd:selected-activity-adapters';");
    lines.push('installExternalActivity(document, view, SELECTED_EXTERNAL_ACTIVITY_ADAPTERS);');
  }
  return lines.join('\n');
}

export function createActivityViewerCompositionPlugin(root, options) {
  const definitions = [
    ['bitcoin', 'BITCOIN_ACTIVITY_ADAPTER', 'apps/activity-viewer/src/activity-bitcoin.ts'],
    ['ethereum', 'ETHEREUM_ACTIVITY_ADAPTER', 'apps/activity-viewer/src/activity-ethereum.ts'],
  ].filter(([coin]) => options.hasCoin(coin));
  const imports = definitions.map(
    ([, symbol, file]) => `import { ${symbol} } from ${JSON.stringify(resolve(root, file))};`,
  );
  const source = `${imports.join('\n')}\nexport const SELECTED_EXTERNAL_ACTIVITY_ADAPTERS = [${definitions.map(([, symbol]) => symbol).join(', ')}];`;
  return {
    name: 'activity-viewer-composition',
    setup(build) {
      build.onResolve({ filter: /^ckd:selected-activity-adapters$/ }, () => ({
        path: 'selection',
        namespace: 'ckd-activity-selection',
      }));
      build.onLoad({ filter: /.*/, namespace: 'ckd-activity-selection' }, () => ({
        contents: source,
        loader: 'ts',
        resolveDir: root,
      }));
    },
  };
}

export function applyActivityCoinTemplate(template, options) {
  let rendered = template;
  for (const coin of ['bitcoin', 'dash', 'ethereum']) {
    if (!options.hasCoin(coin))
      rendered = rendered.replace(new RegExp(`<option value=["']${coin}["'][^>]*>[^<]*<\\/option>`, 'giu'), '');
  }
  if (!options.hasCoin('dash')) {
    const labels = options.coins.map((coin) => (coin === 'bitcoin' ? 'Bitcoin' : 'Ethereum'));
    rendered = rendered
      .replace("script-src __INLINE_SCRIPT_CSP__ 'wasm-unsafe-eval'", 'script-src __INLINE_SCRIPT_CSP__')
      .replace('worker-src blob:', "worker-src 'none'")
      .replace('FOUR RESOURCE TYPES', `${labels.length} PUBLIC ${labels.length === 1 ? 'NETWORK' : 'NETWORKS'}`)
      .replace('Verify with confidence', 'Inspect public activity')
      .replace(
        /<div class="capability-list">[\s\S]*?<\/div>\s*<\/aside>/u,
        `<div class="capability-list">${labels.map((label) => `<div><span class="capability-check">✓</span><span>${label} address activity</span></div>`).join('')}<div class="capability-safe"><span>✓</span><span>Public-address input only</span></div></div></aside>`,
      )
      .replace('Proof-verified Platform DAPI', 'Validated public providers')
      .replace('Local note recovery', 'Local address validation')
      .replace('Public L1 history', 'Confirmed public history')
      .replace(
        /<strong>Viewing keys and public lookups are privacy-sensitive\.<\/strong>[\s\S]*?private-key-like input is erased before any request\./u,
        '<strong>Public addresses remain privacy-sensitive.</strong> This viewer sends each locally validated public address only to the fixed provider for its selected network. Mnemonics, passphrases, private keys, WIF, xprv, descriptors, and extended public keys are rejected.',
      );
  }
  return rendered;
}

export function assertActivityViewerComposition(options, inputs) {
  const normalized = inputs.map((input) => input.replaceAll('\\', '/'));
  const markers = {
    bitcoin: ['/activity-bitcoin.ts', '/bitcoin-service.ts'],
    ethereum: ['/activity-ethereum.ts', '/ethereum-service.ts'],
    dash: [
      '/dash-network/',
      '/activity-viewer/src/start.ts',
      '/activity-viewer/src/view.ts',
      '/dash-core-activity.ts',
      '/dash-platform-activity.ts',
      '/dash-identity-activity.ts',
      '/dash-orchard-activity.ts',
    ],
  };
  for (const [coin, forbidden] of Object.entries(markers)) {
    if (options.hasCoin(coin)) continue;
    const leaked = normalized.filter((input) => forbidden.some((marker) => input.includes(marker)));
    if (leaked.length > 0)
      throw new Error(`Activity Viewer excluded ${coin}, but its modules remain:\n${leaked.join('\n')}`);
  }
  const requireInput = (label, marker) => {
    if (!normalized.some((input) => input.includes(marker)))
      throw new Error(`Activity Viewer selected ${label}, but ${marker} is absent from the bundle graph.`);
  };
  if (options.hasCoin('bitcoin')) requireInput('Bitcoin', '/activity-bitcoin.ts');
  if (options.hasCoin('ethereum')) requireInput('Ethereum', '/activity-ethereum.ts');
  if (options.hasCoin('dash')) {
    for (const marker of [
      '/dash-core-activity.ts',
      '/dash-platform-activity.ts',
      '/dash-identity-activity.ts',
      '/dash-orchard-activity.ts',
    ])
      requireInput('the complete Dash activity suite', marker);
  }
}

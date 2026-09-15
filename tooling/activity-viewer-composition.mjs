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

function replaceBalancedElement(source, openingPattern, replacement) {
  const opening = openingPattern.exec(source);
  if (opening === null) return source;
  const tag = /^<([a-z][a-z0-9-]*)\b/iu.exec(opening[0])?.[1];
  if (tag === undefined) throw new Error('Activity Viewer template selector did not start at an HTML element.');
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'giu');
  token.lastIndex = opening.index;
  let depth = 0;
  for (let match = token.exec(source); match !== null; match = token.exec(source)) {
    if (match[0].startsWith('</')) depth -= 1;
    else depth += 1;
    if (depth === 0) return source.slice(0, opening.index) + replacement + source.slice(token.lastIndex);
  }
  throw new Error(`Activity Viewer template is missing the closing <${tag}> element.`);
}

export function applyActivityCoinTemplate(template, options) {
  let rendered = template;
  for (const coin of ['bitcoin', 'dash', 'ethereum']) {
    if (!options.hasCoin(coin))
      rendered = rendered.replace(new RegExp(`<option value=["']${coin}["'][^>]*>[^<]*<\\/option>`, 'giu'), '');
  }
  if (!options.hasCoin('dash')) {
    const labels = options.coins.map((coin) => (coin === 'bitcoin' ? 'Bitcoin' : 'Ethereum'));
    const providerSummary = [
      ...(options.hasCoin('bitcoin') ? ['Bitcoin: Blockstream Esplora'] : []),
      ...(options.hasCoin('ethereum') ? ['Ethereum: PublicNode'] : []),
    ].join(' · ');
    rendered = replaceBalancedElement(
      rendered,
      /<div\b[^>]*class=["'][^"']*\bviewer-detection-tabs\b[^"']*["'][^>]*>/iu,
      '<div class="viewer-detection-tabs" hidden></div>',
    );
    rendered = replaceBalancedElement(
      rendered,
      /<div\b[^>]*id=["']viewer-advanced-modes["'][^>]*>/iu,
      '<div id="viewer-advanced-modes" hidden></div>',
    );
    rendered = replaceBalancedElement(
      rendered,
      /<div\b[^>]*id=["']viewer-capability-controls["'][^>]*>/iu,
      '<div id="viewer-capability-controls" hidden></div>',
    );
    rendered = replaceBalancedElement(
      rendered,
      /<div\b[^>]*id=["']viewer-history-field["'][^>]*>/iu,
      '<div id="viewer-history-field" hidden></div>',
    );
    rendered = replaceBalancedElement(rendered, /<div\b[^>]*id=["']viewer-batch-controls["'][^>]*>/iu, '');
    rendered = replaceBalancedElement(
      rendered,
      /<label\b[^>]*id=["']viewer-input-label["'][^>]*>/iu,
      '<label id="viewer-input-label" for="full-viewing-key">Public address</label>',
    );
    rendered = replaceBalancedElement(rendered, /<button\b[^>]*id=["']reveal-viewing-key["'][^>]*>/iu, '');
    rendered = replaceBalancedElement(rendered, /<button\b[^>]*id=["']reveal-batch-input["'][^>]*>/iu, '');
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
      )
      .replace(/<div class="viewer-control-heading">\s*<strong>Input type<\/strong>[\s\S]*?<\/div>/u, '')
      .replace('<label for="viewer-network">Dash network</label>', '<label for="viewer-network">Network</label>')
      .replace(
        '<p class="field-note">Choose the network containing the address, Identity, or Orchard activity.</p>',
        '<p class="field-note">Choose the network containing the public address.</p>',
      )
      .replace(
        /<label id="viewer-input-label"[\s\S]*?<\/label>/u,
        '<label id="viewer-input-label" for="full-viewing-key">Public address</label>',
      )
      .replace('placeholder="Core, Platform, Identity, or Orchard viewing key"', 'placeholder="Paste a public address"')
      .replace(
        'placeholder="One Core, Platform, Identity, or Orchard input per line"',
        'placeholder="One public address per line"',
      )
      .replace(
        /<p id="viewer-input-help" class="field-note">[\s\S]*?<\/p>/u,
        '<p id="viewer-input-help" class="field-note">The address is validated locally before any request.</p>',
      )
      .replace(
        '<p class="viewer-action-note">Proof verification and complete indexed lookups may take a moment.</p>',
        '<p class="viewer-action-note">Complete indexed address-history lookups may take a moment.</p>',
      )
      .replace('Height / protocol', 'Height / provider')
      .replace('Recovered shielded activity', 'Public address activity')
      .replace(
        'A local view reconstructed from the encrypted pool.',
        'A validated view returned by the selected public provider.',
      )
      .replace(
        /<p id="viewer-crypto-self-test-details" class="field-note">[\s\S]*?<\/p>/u,
        '<p id="viewer-crypto-self-test-details" class="field-note">Inputs are validated locally and private-material formats are rejected before a provider request.</p>',
      )
      .replace(
        /<p class="field-note passport-dependencies">[\s\S]*?<\/p>/u,
        '<p class="field-note passport-dependencies"><strong>Embedded dependency versions and licenses:</strong> the exact selected provider closure is pinned in the lockfile and documented in THIRD_PARTY_NOTICES.md.</p>',
      )
      .replace(
        /<p class="field-note">\s*<strong>Upstream attribution:<\/strong>[\s\S]*?<\/p>/u,
        `<p class="field-note"><strong>Public data providers:</strong> ${providerSummary}. Exact endpoints, versions, and licenses are recorded in the source distribution.</p>`,
      )
      .replace(
        /<footer>[\s\S]*?<div class="footer-main">\s*<p>[\s\S]*?<\/p>/u,
        `<footer><div class="footer-main"><p>${providerSummary}</p>`,
      );
    rendered = replaceBalancedElement(
      rendered,
      /<code\b[^>]*id=["']viewer-runtime["'][^>]*>/iu,
      '<code id="viewer-runtime">Selected public-provider modules · public-address input boundary</code>',
    );
    rendered = replaceBalancedElement(
      rendered,
      /<span\b[^>]*id=["']viewer-crypto-self-test-status["'][^>]*>/iu,
      '<span id="viewer-crypto-self-test-status" class="self-test-badge pass">Public-input checks active</span>',
    );
    const residualDashCopy = rendered.match(/.{0,80}\b(?:Dash|Orchard)\b.{0,120}/gu);
    if (residualDashCopy !== null) {
      throw new Error(
        `Activity Viewer build without Dash retained Dash-only HTML copy:\n${residualDashCopy.join('\n')}`,
      );
    }
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

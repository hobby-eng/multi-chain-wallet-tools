import {
  ACCOUNT_SHARED_MARKERS,
  accountReadersSource,
  selectedAccountCoins,
  unselectedAccountMarkers,
} from "./account-coins.mjs";
import {
  EVM_HISTORY_MARKERS,
  hasEvmHistory,
  isEvmCoin,
  selectedEvmHistoryNetworks,
  selectedEvmNetworks,
} from "./evm-networks.mjs";
import { TOOL_MANIFESTS } from "./tool-manifests.mjs";
import { replaceBalancedElement as replaceHtmlElement } from "./html-elements.mjs";
import { resolve } from "node:path";

export function activityViewerEntry(root, options) {
  const lines = [];
  if (options.hasCoin("dash")) {
    lines.push(
      `import { startActivityViewer } from ${JSON.stringify(resolve(root, "apps/activity-viewer/src/start.ts"))};`,
    );
    lines.push("const view = startActivityViewer();");
  } else {
    lines.push(
      `import { BUILD_INFO } from ${JSON.stringify(resolve(root, "packages/build-security/src/build-info.ts"))};`,
    );
    lines.push(
      `import { createPublicAddressActivityView } from ${JSON.stringify(resolve(root, "apps/activity-viewer/src/public-address-view.ts"))};`,
    );
    lines.push("const view = createPublicAddressActivityView(document, BUILD_INFO);");
  }
  if (options.coins.some((coin) => coin !== "dash")) {
    lines.push(
      `import { installExternalActivity } from ${JSON.stringify(resolve(root, "apps/activity-viewer/src/external-activity.ts"))};`,
    );
    lines.push(
      "import { SELECTED_EXTERNAL_ACTIVITY_ADAPTERS } from 'ckd:selected-activity-adapters';",
    );
    lines.push("installExternalActivity(document, view, SELECTED_EXTERNAL_ACTIVITY_ADAPTERS);");
  }
  return lines.join("\n");
}

/**
 * The selected public-address adapters: Bitcoin's, one per EVM network with its inlined row, and one
 * per account coin with its inlined row and its api's provider.
 */
function selectedAdaptersSource(root, options) {
  const module = (file) => JSON.stringify(resolve(root, file));
  const lines = [];
  const adapters = [];
  if (options.hasCoin("bitcoin")) {
    lines.push(
      `import { BITCOIN_ACTIVITY_ADAPTER } from ${module("apps/activity-viewer/src/activity-bitcoin.ts")};`,
    );
    adapters.push("BITCOIN_ACTIVITY_ADAPTER");
  }
  const evm = selectedEvmNetworks(options);
  if (evm.length > 0) {
    lines.push(
      `import { createEvmActivityAdapter } from ${module("apps/activity-viewer/src/activity-evm.ts")};`,
      `import { EvmAccountService } from ${module("packages/public-data-providers/src/evm-service.ts")};`,
      `const evmNetworks = ${JSON.stringify(evm)};`,
      "const evmAccounts = new EvmAccountService(evmNetworks);",
    );
    // A network whose row names a history endpoint reads its history from Blockscout; the others
    // load balance and nonce.
    if (evm.some(hasEvmHistory))
      lines.push(
        `import { EvmHistoryService } from ${module("packages/public-data-providers/src/evm-history-service.ts")};`,
        `const evmHistory = new EvmHistoryService(${JSON.stringify(evm.filter(hasEvmHistory))});`,
      );
    for (const [index, row] of evm.entries())
      adapters.push(
        `createEvmActivityAdapter(evmNetworks[${index}], evmAccounts${hasEvmHistory(row) ? ", evmHistory" : ""})`,
      );
  }
  const accounts = selectedAccountCoins(options);
  if (accounts.length > 0) {
    const { imports, readers } = accountReadersSource(accounts, module);
    lines.push(
      `import { createAccountActivityAdapter } from ${module("apps/activity-viewer/src/activity-account.ts")};`,
      `import { AccountStatesService } from ${module("packages/public-data-providers/src/account-states-service.ts")};`,
      ...imports,
      `const accountReaders = ${readers};`,
      "const accountStates = new AccountStatesService(accountReaders);",
    );
    adapters.push(
      "...accountReaders.map((reader) => createAccountActivityAdapter(reader, accountStates))",
    );
  }
  return `${lines.join("\n")}\nexport const SELECTED_EXTERNAL_ACTIVITY_ADAPTERS = [${adapters.join(", ")}];`;
}

export function createActivityViewerCompositionPlugin(root, options) {
  const source = selectedAdaptersSource(root, options);
  return {
    name: "activity-viewer-composition",
    setup(build) {
      build.onResolve({ filter: /^ckd:selected-activity-adapters$/ }, () => ({
        path: "selection",
        namespace: "ckd-activity-selection",
      }));
      build.onLoad({ filter: /.*/, namespace: "ckd-activity-selection" }, () => ({
        contents: source,
        loader: "ts",
        resolveDir: root,
      }));
    },
  };
}

const replaceBalancedElement = (source, openingPattern, replacement = "") =>
  replaceHtmlElement(source, openingPattern, replacement, "Activity Viewer template");

/**
 * The provider line of a Viewer build without Dash: Bitcoin's provider, the EVM networks grouped by
 * the operator of their JSON-RPC (in table order) and those with a history by Blockscout, and each
 * account coin's host.
 */
export function activityProviderSummary(options) {
  const evm = selectedEvmNetworks(options);
  const operators = Map.groupBy(evm, ({ rpcOperator }) => rpcOperator);
  const histories = selectedEvmHistoryNetworks(options).map(({ label }) => label);
  return [
    ...(options.hasCoin("bitcoin") ? ["Bitcoin: Blockstream Esplora"] : []),
    ...[...operators].map(
      ([operator, rows]) => `${rows.map(({ label }) => label).join(", ")}: ${operator} JSON-RPC`,
    ),
    ...(histories.length > 0 ? [`${histories.join(", ")} history: Blockscout`] : []),
    ...selectedAccountCoins(options).map(
      ({ label, endpoint }) => `${label}: ${new URL(endpoint).host}`,
    ),
  ].join(" · ");
}

export function applyActivityCoinTemplate(template, options) {
  let rendered = template;
  for (const coin of TOOL_MANIFESTS["activity-viewer"].coins) {
    if (!options.hasCoin(coin))
      rendered = rendered.replace(
        new RegExp(`<option value=["']${coin}["'][^>]*>[^<]*<\\/option>`, "giu"),
        "",
      );
  }
  // A coin group none of whose coins was selected leaves no empty <optgroup>.
  rendered = rendered.replace(/<optgroup\b[^>]*>\s*<\/optgroup>/giu, "");
  if (!options.hasCoin("dash")) {
    const evm = selectedEvmNetworks(options);
    const accounts = selectedAccountCoins(options);
    const labels = [
      ...(options.hasCoin("bitcoin") ? ["Bitcoin"] : []),
      ...[...evm, ...accounts].map(({ label }) => label),
    ];
    const providerSummary = activityProviderSummary(options);
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
    rendered = replaceBalancedElement(
      rendered,
      /<div\b[^>]*id=["']viewer-batch-controls["'][^>]*>/iu,
      "",
    );
    rendered = replaceBalancedElement(
      rendered,
      /<label\b[^>]*id=["']viewer-input-label["'][^>]*>/iu,
      '<label id="viewer-input-label" for="full-viewing-key">Public address</label>',
    );
    rendered = replaceBalancedElement(
      rendered,
      /<button\b[^>]*id=["']reveal-viewing-key["'][^>]*>/iu,
      "",
    );
    rendered = replaceBalancedElement(
      rendered,
      /<button\b[^>]*id=["']reveal-batch-input["'][^>]*>/iu,
      "",
    );
    rendered = rendered
      .replace(
        "script-src __INLINE_SCRIPT_CSP__ 'wasm-unsafe-eval'",
        "script-src __INLINE_SCRIPT_CSP__",
      )
      .replace("worker-src blob:", "worker-src 'none'")
      .replace(
        "FOUR RESOURCE TYPES",
        `${labels.length} PUBLIC ${labels.length === 1 ? "NETWORK" : "NETWORKS"}`,
      )
      .replace("Verify with confidence", "Inspect public activity")
      .replace(
        /<div class="capability-list">[\s\S]*?<\/div>\s*<\/aside>/u,
        `<div class="capability-list">${labels.map((label) => `<div><span class="capability-check">✓</span><span>${label} address activity</span></div>`).join("")}<div class="capability-safe"><span>✓</span><span>Public-address input only</span></div></div></aside>`,
      )
      .replace("Proof-verified Platform DAPI", "Validated public providers")
      .replace("Local note recovery", "Local address validation")
      .replace("Public L1 history", "Confirmed public history")
      .replace(
        /<strong>Viewing keys and public lookups are privacy-sensitive\.<\/strong>[\s\S]*?private-key-like input is erased before any request\./u,
        "<strong>Public addresses remain privacy-sensitive.</strong> This viewer sends each locally validated public address only to the fixed provider for its selected network. Mnemonics, passphrases, private keys, WIF, xprv, descriptors, and extended public keys are rejected.",
      )
      .replace(
        /<div class="viewer-control-heading">\s*<strong>Input type<\/strong>[\s\S]*?<\/div>/u,
        "",
      )
      .replace(
        '<label for="viewer-network">Dash network</label>',
        '<label for="viewer-network">Network</label>',
      )
      .replace(
        '<p class="field-note">Choose the network containing the address, Identity, or Orchard activity.</p>',
        '<p class="field-note">Choose the network containing the public address.</p>',
      )
      .replace(
        /<label id="viewer-input-label"[\s\S]*?<\/label>/u,
        '<label id="viewer-input-label" for="full-viewing-key">Public address</label>',
      )
      .replace(
        'placeholder="Core, Platform, Identity, or Orchard viewing key"',
        'placeholder="Paste a public address"',
      )
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
      .replace("Height / protocol", "Height / provider")
      .replace("Recovered shielded activity", "Public address activity")
      .replace(
        "A local view reconstructed from the encrypted pool.",
        "A validated view returned by the selected public provider.",
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
        `Activity Viewer build without Dash retained Dash-only HTML copy:\n${residualDashCopy.join("\n")}`,
      );
    }
  }
  return rendered;
}

export function assertActivityViewerComposition(options, inputs) {
  const normalized = inputs.map((input) => input.replaceAll("\\", "/"));
  const markers = {
    bitcoin: ["/activity-bitcoin.ts", "/bitcoin-service.ts"],
    dash: [
      "/dash-network/",
      "/activity-viewer/src/start.ts",
      "/activity-viewer/src/view.ts",
      "/dash-core-activity.ts",
      "/dash-platform-activity.ts",
      "/dash-identity-activity.ts",
      "/dash-orchard-activity.ts",
    ],
  };
  for (const [coin, forbidden] of Object.entries(markers)) {
    if (options.hasCoin(coin)) continue;
    const leaked = normalized.filter((input) => forbidden.some((marker) => input.includes(marker)));
    if (leaked.length > 0)
      throw new Error(
        `Activity Viewer excluded ${coin}, but its modules remain:\n${leaked.join("\n")}`,
      );
  }
  const requireInput = (label, marker) => {
    if (!normalized.some((input) => input.includes(marker)))
      throw new Error(
        `Activity Viewer selected ${label}, but ${marker} is absent from the bundle graph.`,
      );
  };
  if (options.hasCoin("bitcoin")) requireInput("Bitcoin", "/activity-bitcoin.ts");
  // Each selected network whose row names a history endpoint reads it; without one, no EVM history
  // service stays.
  const histories = selectedEvmHistoryNetworks(options);
  for (const { id } of histories) requireInput(`${id} history`, EVM_HISTORY_MARKERS.service);
  if (histories.length === 0) {
    const leaked = normalized.filter((input) => input.includes(EVM_HISTORY_MARKERS.service));
    if (leaked.length > 0)
      throw new Error(
        `Activity Viewer selected no EVM history, but its modules remain:\n${leaked.join("\n")}`,
      );
  }
  // Each selected account coin's provider, the modules they share, and no unselected coin's modules.
  const accounts = selectedAccountCoins(options);
  for (const { api } of accounts) requireInput("account coins", `/account-coins/${api}.ts`);
  const shared = ACCOUNT_SHARED_MARKERS["activity-viewer"];
  if (accounts.length > 0) for (const marker of shared) requireInput("account coins", marker);
  const absent = [...unselectedAccountMarkers(options), ...(accounts.length > 0 ? [] : shared)];
  const leakedAccounts = normalized.filter((input) =>
    absent.some((marker) => input.includes(marker)),
  );
  if (leakedAccounts.length > 0)
    throw new Error(
      `Activity Viewer excluded account coins, but their modules remain:\n${leakedAccounts.join("\n")}`,
    );
  if (options.coins.some(isEvmCoin)) {
    requireInput("EVM networks", "/activity-evm.ts");
    requireInput("EVM networks", "/evm-service.ts");
  } else {
    const leaked = normalized.filter((input) =>
      ["/activity-evm.ts", "/evm-service.ts", "/evm-network-facts.ts"].some((marker) =>
        input.includes(marker),
      ),
    );
    if (leaked.length > 0)
      throw new Error(
        `Activity Viewer excluded every EVM network, but its modules remain:\n${leaked.join("\n")}`,
      );
  }
  if (options.hasCoin("dash")) {
    for (const marker of [
      "/dash-core-activity.ts",
      "/dash-platform-activity.ts",
      "/dash-identity-activity.ts",
      "/dash-orchard-activity.ts",
    ])
      requireInput("the complete Dash activity suite", marker);
  }
}

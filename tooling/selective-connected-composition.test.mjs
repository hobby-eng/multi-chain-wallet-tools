// The selective builds of the connected tools (the Activity Viewer, the Discovery Scanner) and of
// the PSBT Inspector: their endpoints, templates, EVM networks and engines.
import { describe, expect, it } from "vitest";
import {
  activityProviderSummary,
  applyActivityCoinTemplate,
  assertActivityViewerComposition,
  createActivityViewerCompositionPlugin,
} from "./activity-viewer-composition.mjs";
import {
  applyDiscoveryFeatureTemplate,
  assertDiscoveryComposition,
  createDiscoveryCompositionPlugin,
  discoveryNetworkRuntimeSource,
} from "./discovery-composition.mjs";
import { applySelectedNetworkCsp } from "./tool-feature-options.mjs";
import { assertPsbtComposition } from "./psbt-inspector-composition.mjs";
import { hasEvmHistory as runtimeHasEvmHistory } from "@ckd/public-data-providers/evm-network-facts.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { normalizeEthereumAddress } from "@ckd/public-data-providers/address-normalization.js";
import {
  assertSelectedEvmEndpoints,
  EVM_NETWORKS,
  evmWalletCoin,
  hasEvmHistory,
} from "./evm-networks.mjs";
import { singleKeyAddressesModule } from "./single-key-coins.mjs";
import { composedSource, options } from "./composition-test-helpers.mjs";

describe("connected tools' endpoints and Activity templates", () => {
  it("pins fixed provider origins in connected builds without Dash", () => {
    const rendered = applySelectedNetworkCsp(
      "connect-src https:;",
      options(["bitcoin", "ethereum"]),
    );
    expect(rendered).not.toContain("connect-src https:;");
    // Exactly Bitcoin's providers and Ethereum's four origins (JSON-RPC and Blockscout, mainnet
    // and Sepolia); no other EVM network's endpoint.
    expect(
      new Set(
        rendered
          .replace(/^connect-src /u, "")
          .replace(/;$/u, "")
          .split(" "),
      ),
    ).toEqual(
      new Set([
        "https://blockstream.info",
        "https://mempool.space",
        "https://blockchain.info",
        "https://api.blockcypher.com",
        "https://ethereum-rpc.publicnode.com",
        "https://ethereum-sepolia-rpc.publicnode.com",
        "https://eth.blockscout.com",
        "https://eth-sepolia.blockscout.com",
      ]),
    );
    expect(applySelectedNetworkCsp("connect-src https:;", options(["dash"]))).toBe(
      "connect-src https:;",
    );
  });

  it("requires the complete Dash Activity suite and rejects it when Dash is excluded", () => {
    const dashInputs = [
      "apps/activity-viewer/src/dash-core-activity.ts",
      "apps/activity-viewer/src/dash-platform-activity.ts",
      "apps/activity-viewer/src/dash-identity-activity.ts",
      "apps/activity-viewer/src/dash-orchard-activity.ts",
    ];
    expect(() => assertActivityViewerComposition(options(["dash"]), dashInputs)).not.toThrow();
    expect(() => assertActivityViewerComposition(options(["dash"]), dashInputs.slice(1))).toThrow(
      /complete Dash/u,
    );
    expect(() =>
      assertActivityViewerComposition(options(["bitcoin"]), [
        "apps/activity-viewer/src/activity-bitcoin.ts",
        ...dashInputs,
      ]),
    ).toThrow(/excluded dash/u);
  });

  it("removes Dash-only controls and copy from public-address Activity templates", () => {
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
      <button id="reveal-viewing-key">Show key</button><button id="reveal-batch-input">Show keys</button>
      <code id="viewer-runtime">Core, Platform, Identity &amp; Orchard network reads</code
      >
      <span id="viewer-crypto-self-test-status">Cryptographic self-test running…</span
      >
      <div><code id="viewer-build-fingerprint">fingerprint</code></div>
      <p id="viewer-crypto-self-test-details" class="field-note">Queries remain disabled.</p>
      <p class="field-note passport-dependencies">Dash Orchard dependencies.</p>
      <p class="field-note"><strong>Upstream attribution:</strong> Dash Platform and Dash Orchard.</p>
      <footer><div class="footer-main"><p>Dash providers</p><p>Safe</p></div></footer>`;
    const rendered = applyActivityCoinTemplate(template, options(["bitcoin"]));
    expect(rendered).not.toMatch(/\b(?:Dash|Orchard)\b/u);
    expect(rendered).not.toContain("data-viewer-mode");
    expect(rendered).not.toContain("reveal-viewing-key");
    expect(rendered).toContain('id="viewer-advanced-modes" hidden');
    expect(rendered).toContain('id="viewer-capability-controls" hidden');
    expect(rendered).toContain('id="viewer-build-fingerprint"');
  });
});

describe("Discovery and EVM network composition", () => {
  it("generates only the network operations selected for each Discovery coin set", () => {
    const dash = discoveryNetworkRuntimeSource("/workspace", options(["dash"]));
    expect(dash).toContain("case 'core.status'");
    expect(dash).toContain("case 'shielded.page'");
    expect(dash).not.toMatch(/bitcoin|ethereum|address\.history|utxo\.addresses|evm\.accounts/iu);

    const bitcoin = discoveryNetworkRuntimeSource("/workspace", options(["bitcoin"]));
    expect(bitcoin).toContain("case 'address.history'");
    expect(bitcoin).toContain("case 'utxo.addresses'");
    expect(bitcoin).not.toMatch(/core\.|platform\.|shielded\.|ethereum|evm\.accounts/iu);
  });

  it("composes an EVM network alone with its own row, endpoint and Ethereum's derivation only", () => {
    const base = options(["base"], ["seed-discovery"]);
    const runtime = discoveryNetworkRuntimeSource("/workspace", base);
    expect(runtime).toContain(`validateEvmAccountsPayload(value, ["base"])`);
    expect(runtime).toContain("request.payload.coin");
    expect(runtime).not.toMatch(/ethereum|bnb-chain|address\.history|utxo\.addresses/u);
    const csp = applySelectedNetworkCsp("connect-src https:;", base);
    expect(csp).toBe("connect-src https://base-rpc.publicnode.com;");
    const shared = [
      "apps/discovery-scanner/src/coins/evm/seed.ts",
      "packages/public-data-providers/src/evm-service.ts",
      "packages/public-data-providers/src/evm-network-facts.ts",
      "packages/coin-protocols/src/coins/keccak-account.ts",
      // Ethereum's derivation self-test comes with every EVM network.
      "packages/coin-protocols/src/coins/ethereum/index.ts",
      "packages/network-boundary/src/request-validation.ts",
      "apps/discovery-scanner/src/seed-scan-input.ts",
      "packages/secret-vault/src/worker-bootstrap.ts",
    ];
    expect(() => assertDiscoveryComposition(base, shared)).not.toThrow();
    expect(() =>
      assertDiscoveryComposition(base, [
        ...shared,
        "apps/discovery-scanner/src/coins/ethereum/index.ts",
      ]),
    ).toThrow(/excluded ethereum/u);
    expect(() =>
      assertDiscoveryComposition(base, [
        ...shared,
        "apps/discovery-scanner/src/coins/evm/history.ts",
      ]),
    ).toThrow(/selected no EVM history/u);
    expect(() =>
      assertDiscoveryComposition(options(["bitcoin"], ["seed-discovery"]), [
        "apps/discovery-scanner/src/coins/bitcoin/seed.ts",
        "packages/network-boundary/src/request-validation.ts",
        "apps/discovery-scanner/src/seed-scan-input.ts",
        "packages/secret-vault/src/worker-bootstrap.ts",
        "apps/discovery-scanner/src/coins/evm/seed.ts",
      ]),
    ).toThrow(/excluded ethereum/u);
    expect(() =>
      assertSelectedEvmEndpoints(base, "https://base-rpc.publicnode.com", "page"),
    ).not.toThrow();
    expect(() =>
      assertSelectedEvmEndpoints(base, "https://bsc-rpc.publicnode.com", "page"),
    ).toThrow(/bsc-rpc\.publicnode\.com/u);
  });

  it("composes Ethereum Classic alone with its own endpoints, its history and both derivations", () => {
    const etc = options(["ethereum-classic"], ["seed-discovery"]);
    const runtime = discoveryNetworkRuntimeSource("/workspace", etc);
    expect(runtime).toContain(`validateEvmAccountsPayload(value, ["ethereum-classic"])`);
    expect(runtime).toContain(
      `assertOneOf(body.coin, ["ethereum-classic"], 'Public history coin')`,
    );
    expect(runtime).toContain(
      `if (["ethereum-classic"].includes(request.payload.coin)) return service.evmAddressHistory(`,
    );
    expect(runtime).not.toMatch(/'ethereum'|"ethereum"|bitcoin|utxo\.addresses/u);
    expect(applySelectedNetworkCsp("connect-src https:;", etc)).toBe(
      "connect-src https://etc.etcdesktop.com https://etc.blockscout.com;",
    );
    const inputs = [
      "apps/discovery-scanner/src/coins/evm/seed.ts",
      "apps/discovery-scanner/src/coins/evm/history.ts",
      "packages/public-data-providers/src/evm-service.ts",
      "packages/public-data-providers/src/evm-history-service.ts",
      "packages/public-data-providers/src/evm-network-facts.ts",
      "packages/coin-protocols/src/coins/keccak-account.ts",
      // Ethereum's derivation self-test comes with every EVM network, and Ethereum Classic's own
      // with its wallets' layouts.
      "packages/coin-protocols/src/coins/ethereum/index.ts",
      "packages/coin-protocols/src/coins/ethereum-classic/index.ts",
      "packages/verification/src/derivation-self-test-ethereum-classic.ts",
      "packages/network-boundary/src/request-validation.ts",
      "apps/discovery-scanner/src/seed-scan-input.ts",
      "packages/secret-vault/src/worker-bootstrap.ts",
    ];
    expect(() => assertDiscoveryComposition(etc, inputs)).not.toThrow();
    const without = (suffix) => inputs.filter((input) => !input.endsWith(suffix));
    for (const suffix of ["/coins/evm/history.ts", "/evm-history-service.ts"])
      expect(() => assertDiscoveryComposition(etc, without(suffix))).toThrow(
        /ethereum-classic history/u,
      );
    expect(() =>
      assertDiscoveryComposition(etc, without("/coins/ethereum-classic/index.ts")),
    ).toThrow(/ethereum-classic wallet layouts/u);
    expect(() =>
      assertDiscoveryComposition(etc, without("derivation-self-test-ethereum-classic.ts")),
    ).toThrow(/ethereum-classic derivation self-test/u);
    expect(() =>
      assertSelectedEvmEndpoints(options(["ethereum"]), "https://etc.blockscout.com", "page"),
    ).toThrow(/etc\.blockscout\.com/u);
  });

  it("composes Ethereum and Ethereum Classic with one history service and Ethereum Classic's own layouts", () => {
    const both = options(["ethereum", "ethereum-classic"], ["seed-discovery"]);
    const plugin = createDiscoveryCompositionPlugin("/workspace", both);
    const service = composedSource(plugin, "ckd:selected-discovery-network-service");
    expect(service).toMatch(
      /new EvmHistoryService\(\[\{"id":"ethereum",.*\{"id":"ethereum-classic",/u,
    );
    expect(service).toContain("evmAddressHistory(coin, network, address, signal)");
    const runtime = composedSource(plugin, "ckd:selected-discovery-network-runtime");
    expect(runtime).toContain(
      `assertOneOf(body.coin, ["ethereum","ethereum-classic"], 'Public history coin')`,
    );
    expect(runtime).toContain(
      `if (["ethereum","ethereum-classic"].includes(request.payload.coin)) return service.evmAddressHistory(`,
    );
    const registry = composedSource(plugin, "ckd:selected-discovery-registry");
    expect(registry).toContain(`getHistory: evmHistory("ethereum")`);
    expect(registry).toContain(`getHistory: evmHistory("ethereum-classic")`);
    expect(registry.match(/addresses: ETHEREUM_CLASSIC_ADDRESSES/gu)).toHaveLength(1);
    expect(registry).toContain(
      `evmNetworkPrivacy([{"rpcOperator":"PublicNode"},{"rpcOperator":"HebeBlock"}])`,
    );
    const selfTest = composedSource(plugin, "ckd:selected-discovery-self-test");
    expect(selfTest).toContain("runEthereumDerivationSelfTest");
    expect(selfTest).toContain("runEthereumClassicDerivationSelfTest");
  });
});

describe("EVM network tables in the Viewer and the Discovery Scanner", () => {
  it("keeps Ethereum Classic's derivation modules out of a build without seed scans", () => {
    const watchOnly = options(["ethereum-classic"], ["watch-only-discovery"]);
    const registry = composedSource(
      createDiscoveryCompositionPlugin("/workspace", watchOnly),
      "ckd:selected-discovery-registry",
    );
    expect(registry).toContain("createEvmWatchOnlyRecoveryAdapter");
    expect(registry).not.toContain("ETHEREUM_CLASSIC_ADDRESSES");
    const inputs = [
      "apps/discovery-scanner/src/coins/evm/watch-adapter.ts",
      "apps/discovery-scanner/src/coins/evm/history.ts",
      "packages/public-data-providers/src/evm-service.ts",
      "packages/public-data-providers/src/evm-history-service.ts",
      "packages/public-data-providers/src/evm-network-facts.ts",
      "packages/wallet-recovery/src/watch-only/evm.ts",
      "packages/coin-protocols/src/coins/keccak-account.ts",
      "packages/network-boundary/src/request-validation.ts",
      "apps/discovery-scanner/src/watch-only-input.ts",
    ];
    expect(() => assertDiscoveryComposition(watchOnly, inputs)).not.toThrow();
    expect(() =>
      assertDiscoveryComposition(watchOnly, [
        ...inputs,
        "packages/coin-protocols/src/coins/ethereum-classic/index.ts",
      ]),
    ).toThrow(/scans no seed, but EVM wallet layout modules remain/u);
  });

  it("names the Viewer's EVM providers by the operator of their JSON-RPC, and their history", () => {
    expect(activityProviderSummary(options(["base", "ethereum-classic", "gnosis"]))).toBe(
      "Base, Gnosis: PublicNode JSON-RPC · Ethereum Classic: HebeBlock JSON-RPC · Ethereum Classic history: Blockscout",
    );
    expect(activityProviderSummary(options(["ethereum", "bnb-chain"]))).toBe(
      "BNB Chain, Ethereum: PublicNode JSON-RPC · Ethereum history: Blockscout",
    );
    const source = composedSource(
      createActivityViewerCompositionPlugin(
        "/workspace",
        options(["ethereum", "ethereum-classic"]),
      ),
      "selection",
    );
    expect(source).toMatch(
      /new EvmHistoryService\(\[\{"id":"ethereum",.*\{"id":"ethereum-classic",/u,
    );
    expect(source).toContain("createEvmActivityAdapter(evmNetworks[0], evmAccounts, evmHistory)");
    expect(source).toContain("createEvmActivityAdapter(evmNetworks[1], evmAccounts, evmHistory)");
  });

  it("ties an EVM row to its own wallets' layouts only by its walletCoin, a scheme of EIP-55 0x addresses", async () => {
    const tied = EVM_NETWORKS.filter((row) => evmWalletCoin(row) !== undefined);
    expect(tied.map(({ id, walletCoin }) => [id, walletCoin])).toEqual([
      ["ethereum-classic", "ethereum-classic"],
    ]);
    const seed = mnemonicToSeed(`${"abandon ".repeat(11)}about`);
    for (const row of tied) {
      const { symbol, file } = singleKeyAddressesModule(evmWalletCoin(row));
      const scheme = (await import(new URL(`../${file}`, import.meta.url).href))[symbol];
      const opened = scheme.open(seed);
      try {
        const address = opened.address(scheme.layouts[0], 0, 0);
        expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/u);
        // The EIP-55 checksum form: normalizing the address leaves it as it is.
        expect(normalizeEthereumAddress(address)).toBe(address);
      } finally {
        opened.wipe();
      }
    }
    expect(() => evmWalletCoin({ id: "base", walletCoin: "no-such-coin" })).toThrow(
      /names no single-key coin/u,
    );
  });

  it("reads history where the EVM network table names it, in the tooling as in the runtime", () => {
    expect(EVM_NETWORKS.filter(hasEvmHistory).map(({ id }) => id)).toEqual([
      "ethereum",
      "ethereum-classic",
    ]);
    for (const row of EVM_NETWORKS) expect(hasEvmHistory(row)).toBe(runtimeHasEvmHistory(row));
    expect(() =>
      assertActivityViewerComposition(options(["ethereum-classic"]), [
        "apps/activity-viewer/src/activity-evm.ts",
        "packages/public-data-providers/src/evm-service.ts",
      ]),
    ).toThrow(/ethereum-classic history/u);
    expect(() =>
      assertActivityViewerComposition(options(["gnosis"]), [
        "apps/activity-viewer/src/activity-evm.ts",
        "packages/public-data-providers/src/evm-service.ts",
        "packages/public-data-providers/src/evm-history-service.ts",
      ]),
    ).toThrow(/selected no EVM history/u);
  });

  it("offers the EVM networks of the EVM network table in the Activity Viewer and removes unselected ones", () => {
    const template =
      '<select id="viewer-coin"><option value="bitcoin">Bitcoin</option><optgroup label="EVM networks"><option value="ethereum">Ethereum</option><option value="gnosis">Gnosis</option></optgroup><option value="dash">Dash</option></select>';
    expect(applyActivityCoinTemplate(template, options(["dash", "gnosis"]))).toBe(
      '<select id="viewer-coin"><optgroup label="EVM networks"><option value="gnosis">Gnosis</option></optgroup><option value="dash">Dash</option></select>',
    );
    expect(applyActivityCoinTemplate(template, options(["bitcoin", "dash"]))).not.toContain(
      "optgroup",
    );
    expect(() =>
      assertActivityViewerComposition(options(["gnosis"]), [
        "apps/activity-viewer/src/activity-evm.ts",
        "packages/public-data-providers/src/evm-service.ts",
      ]),
    ).not.toThrow();
    expect(() =>
      assertActivityViewerComposition(options(["bitcoin"]), [
        "apps/activity-viewer/src/activity-bitcoin.ts",
        "packages/public-data-providers/src/evm-service.ts",
      ]),
    ).toThrow(/every EVM network/u);
  });
});

describe("Discovery inputs and PSBT engines", () => {
  it("physically removes seed controls from watch-only Discovery HTML", () => {
    const template = `<div><button id="seed-source-tab">Seed phrase</button><button id="public-source-tab" class="recovery-mode-tab primary-mode-tab" aria-selected="false" tabindex="-1">Public keys</button></div>
      <div id="seed-source-panel"><textarea id="single-mnemonic"></textarea><input id="single-passphrase"><textarea id="batch-mnemonics"></textarea><textarea id="batch-passphrases"></textarea></div>
      <div class="secret-actions"><button id="reveal-recovery-input">Show input</button></div>
      <p>Secret Vault</p>
      <p>If funds are found, copy the address, then restore the phrase with a standard wallet. Never use a mnemonic that still protects valuable funds on an untrusted computer.</p>
      <p>use your original recovery phrase or wallet backup, confirm paths. The export intentionally contains no mnemonic, passphrase, seed, private key, spending key, or viewing key.</p>`;
    const rendered = applyDiscoveryFeatureTemplate(
      template,
      options(["bitcoin"], ["watch-only-discovery"]),
    );
    expect(rendered).not.toMatch(
      /seed-source|single-mnemonic|batch-mnemonics|Secret Vault|recovery phrase|mnemonic|passphrase/u,
    );
    expect(rendered).toContain("Public Input Boundary");
    expect(rendered).toContain('aria-selected="true"');
  });

  it("keeps Discovery seed and watch-only input runtimes independently selectable", () => {
    expect(() =>
      assertDiscoveryComposition(options(["bitcoin"], ["seed-discovery"]), [
        "packages/network-boundary/src/request-validation.ts",
        "apps/discovery-scanner/src/coins/bitcoin/seed.ts",
        "apps/discovery-scanner/src/seed-scan-input.ts",
        "apps/discovery-scanner/src/candidate-scan.ts",
        "packages/secret-vault/src/worker-bootstrap.ts",
      ]),
    ).not.toThrow();
    expect(() =>
      assertDiscoveryComposition(options(["bitcoin"], ["watch-only-discovery"]), [
        "packages/network-boundary/src/request-validation.ts",
        "apps/discovery-scanner/src/coins/bitcoin/watch-adapter.ts",
        "apps/discovery-scanner/src/watch-only-input.ts",
        "packages/wallet-recovery/src/watch-only/index.ts",
      ]),
    ).not.toThrow();
    expect(() =>
      assertDiscoveryComposition(options(["bitcoin"], ["watch-only-discovery"]), [
        "packages/network-boundary/src/request-validation.ts",
        "apps/discovery-scanner/src/coins/bitcoin/watch-adapter.ts",
        "apps/discovery-scanner/src/watch-only-input.ts",
        "apps/discovery-scanner/src/seed-scan-input.ts",
      ]),
    ).toThrow(/excluded seed-discovery/u);
  });

  it("requires every selected PSBT workflow engine and rejects excluded engines", () => {
    const psbtInputs = [
      "apps/psbt-inspector/src/psbt-decoder-feature.ts",
      "apps/psbt-inspector/src/psbt.ts",
      "apps/psbt-inspector/src/signing-commitments.ts",
      "apps/psbt-inspector/src/transaction-display.ts",
    ];
    expect(() =>
      assertPsbtComposition(options(["bitcoin"], ["psbt-decoder"]), psbtInputs),
    ).not.toThrow();
    expect(() =>
      assertPsbtComposition(options(["bitcoin"], ["psbt-decoder"]), psbtInputs.slice(1)),
    ).toThrow(/psbt-decoder-feature/u);
    expect(() => assertPsbtComposition(options(["bitcoin"]), psbtInputs)).toThrow(
      /excluded psbt-decoder/u,
    );
  });
});

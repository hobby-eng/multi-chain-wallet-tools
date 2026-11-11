import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCOUNT_COIN_GROUP as RUNTIME_ACCOUNT_GROUP } from "../apps/discovery-scanner/src/coins/account/coin.ts";
import { EVM_NETWORK_GROUP as RUNTIME_EVM_GROUP } from "../apps/discovery-scanner/src/coins/evm/coin.ts";
import { EVM_NETWORK_GROUP, EVM_NETWORK_IDS } from "./evm-networks.mjs";
import {
  ACCOUNT_COIN_GROUP,
  ACCOUNT_COINS,
  accountArtifactMarkers,
  accountProviderModule,
  assertSelectedAccountEndpoints,
} from "./account-coins.mjs";
import {
  applyActivityCoinTemplate,
  assertActivityViewerComposition,
} from "./activity-viewer-composition.mjs";
import {
  assertDiscoveryComposition,
  discoveryNetworkRuntimeSource,
} from "./discovery-composition.mjs";
import { singleKeyAddressesModule } from "./single-key-coins.mjs";
import { applySelectedNetworkCsp, parseToolFeatureOptions } from "./tool-feature-options.mjs";
import { ToolProtocolFooter } from "./tool-protocol-footer.mjs";
import { findDashArtifactViolations } from "./verify-dash-community-artifacts.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MULTI_CHAIN = { id: "multi-chain", capabilities: { bitcoinSilentPayments: true } };
const options = (coins, features = []) => ({
  coins,
  hasCoin: (coin) => coins.includes(coin),
  has: (feature) => features.includes(feature),
});
// Independent of the account coin table: each coin's endpoint, as probed on 2026-11-10.
const ENDPOINTS = {
  solana: "https://solana-rpc.publicnode.com",
  xrp: "https://xrplcluster.com",
  stellar: "https://horizon.stellar.org",
  near: "https://free.rpc.fastnear.com",
  tron: "https://api.trongrid.io",
  cosmos: "https://cosmos-rest.publicnode.com",
  injective: "https://injective-rest.publicnode.com",
  hedera: "https://mainnet.mirrornode.hedera.com",
  ton: "https://toncenter.com",
};
/** The graph of a seed-only Scanner build of XRP: its derivation, its reader, the shared modules. */
const XRP_SCANNER_GRAPH = [
  "packages/coin-protocols/src/coins/xrp/index.ts",
  "apps/discovery-scanner/src/coins/account/seed.ts",
  "packages/public-data-providers/src/account-states-service.ts",
  "packages/public-data-providers/src/account-coin-facts.ts",
  "packages/public-data-providers/src/account-coins/xrpl.ts",
  "packages/network-boundary/src/request-validation.ts",
  "apps/discovery-scanner/src/seed-scan-input.ts",
  "packages/secret-vault/src/worker-bootstrap.ts",
];

describe("account coin tooling", () => {
  it("names the coin menus' groups as the Scanner's coin facts do", () => {
    expect(ACCOUNT_COIN_GROUP).toBe(RUNTIME_ACCOUNT_GROUP);
    expect(EVM_NETWORK_GROUP).toBe(RUNTIME_EVM_GROUP);
  });

  it("reads the same coins and endpoints as the account coin table names", () => {
    expect(Object.fromEntries(ACCOUNT_COINS.map(({ id, endpoint }) => [id, endpoint]))).toEqual(
      ENDPOINTS,
    );
  });

  it("names each api's provider and each coin's addresses as their modules export them", async () => {
    for (const row of ACCOUNT_COINS) {
      const provider = accountProviderModule(row.api);
      const providers = await import(resolve(root, provider.file));
      const { addressVectors, canonical } = providers[provider.symbol];
      expect(canonical(addressVectors.canonical)).toBe(addressVectors.canonical);
      const addresses = singleKeyAddressesModule(row.id);
      const derivation = await import(resolve(root, addresses.file));
      expect(derivation[addresses.symbol].layouts.length).toBeGreaterThan(0);
    }
  });

  it("composes an account coin alone with its own operation, endpoint, reader and derivation", () => {
    const xrp = options(["xrp"], ["seed-discovery"]);
    const runtime = discoveryNetworkRuntimeSource("/workspace", xrp);
    expect(runtime).toContain("case 'account.states'");
    expect(runtime).toContain("service.validateAccountStates(value)");
    expect(runtime).not.toMatch(/evm\.accounts|address\.history|utxo\.addresses|core\./u);
    expect(applySelectedNetworkCsp("connect-src https:;", xrp)).toBe(
      "connect-src https://xrplcluster.com;",
    );
    expect(() => assertDiscoveryComposition(xrp, XRP_SCANNER_GRAPH)).not.toThrow();
    for (const leaked of [
      "packages/public-data-providers/src/account-coins/horizon.ts",
      "packages/coin-protocols/src/coins/stellar/strkey.ts",
    ])
      expect(() => assertDiscoveryComposition(xrp, [...XRP_SCANNER_GRAPH, leaked])).toThrow(
        /excluded account coins/u,
      );
    expect(() =>
      assertDiscoveryComposition(
        xrp,
        XRP_SCANNER_GRAPH.filter((input) => !input.endsWith("/xrpl.ts")),
      ),
    ).toThrow(/account-coins\/xrpl\.ts is absent/u);
    expect(() =>
      assertDiscoveryComposition(options(["bitcoin"], ["seed-discovery"]), [
        "apps/discovery-scanner/src/coins/bitcoin/seed.ts",
        "packages/network-boundary/src/request-validation.ts",
        "apps/discovery-scanner/src/seed-scan-input.ts",
        "packages/secret-vault/src/worker-bootstrap.ts",
        "packages/public-data-providers/src/account-coin-facts.ts",
      ]),
    ).toThrow(/excluded account coins/u);
  });

  it("admits the Keccak account that Tron shares in a build without any EVM network", () => {
    const tron = options(["tron"], ["seed-discovery"]);
    const graph = [
      "packages/coin-protocols/src/coins/tron/index.ts",
      "packages/coin-protocols/src/coins/keccak-account.ts",
      "apps/discovery-scanner/src/coins/account/seed.ts",
      "packages/public-data-providers/src/account-states-service.ts",
      "packages/public-data-providers/src/account-coin-facts.ts",
      "packages/public-data-providers/src/account-coins/trongrid.ts",
      "packages/network-boundary/src/request-validation.ts",
      "apps/discovery-scanner/src/seed-scan-input.ts",
      "packages/secret-vault/src/worker-bootstrap.ts",
    ];
    expect(() => assertDiscoveryComposition(tron, graph)).not.toThrow();
    expect(() =>
      assertDiscoveryComposition(tron, [...graph, "apps/discovery-scanner/src/coins/evm/seed.ts"]),
    ).toThrow(/excluded ethereum/u);
  });

  it("lets Injective alone share the Cosmos SDK reader, but not the Cosmos Hub's modules", () => {
    const injective = options(["injective"], ["seed-discovery"]);
    const graph = [
      "packages/coin-protocols/src/coins/injective/index.ts",
      "packages/coin-protocols/src/coins/keccak-account.ts",
      "apps/discovery-scanner/src/coins/account/seed.ts",
      "packages/public-data-providers/src/account-states-service.ts",
      "packages/public-data-providers/src/account-coin-facts.ts",
      "packages/public-data-providers/src/account-coins/injective-rest.ts",
      "packages/public-data-providers/src/account-coins/cosmos-sdk.ts",
      "packages/network-boundary/src/request-validation.ts",
      "apps/discovery-scanner/src/seed-scan-input.ts",
      "packages/secret-vault/src/worker-bootstrap.ts",
    ];
    expect(() => assertDiscoveryComposition(injective, graph)).not.toThrow();
    for (const leaked of [
      "packages/public-data-providers/src/account-coins/cosmos-rest.ts",
      "packages/coin-protocols/src/coins/cosmos/profiles.ts",
    ])
      expect(() => assertDiscoveryComposition(injective, [...graph, leaked])).toThrow(
        /excluded account coins/u,
      );
    expect(applySelectedNetworkCsp("connect-src https:;", injective)).toBe(
      "connect-src https://injective-rest.publicnode.com;",
    );
    expect(
      applySelectedNetworkCsp("connect-src https:;", options(["ton"], ["seed-discovery"])),
    ).toBe("connect-src https://toncenter.com;");
  });

  it("refuses a page that names an unselected account coin's endpoint", () => {
    const xrp = options(["xrp"]);
    expect(() => assertSelectedAccountEndpoints(xrp, ENDPOINTS.xrp, "page")).not.toThrow();
    expect(() => assertSelectedAccountEndpoints(xrp, ENDPOINTS.tron, "page")).toThrow(
      /api\.trongrid\.io/u,
    );
  });

  it("scans account coins from seed phrases only and offers public keys only beside another coin", () => {
    const parse = (args) => parseToolFeatureOptions("discovery-scanner", MULTI_CHAIN, args);
    expect(parse(["--coins", "solana"]).selected).toEqual([
      "seed-discovery",
      "wallet-matcher",
      "custom-paths",
    ]);
    expect(() => parse(["--coins", "solana", "--features", "watch-only-discovery"])).toThrow(
      /seed phrases only/u,
    );
    expect(() =>
      parse(["--coins", "solana", "--features", "seed-discovery,watch-only-discovery"]),
    ).toThrow(/public-key scans/u);
    expect(parse(["--coins", "bitcoin,solana"]).selected).toContain("watch-only-discovery");
    expect(() =>
      parse(["--coins", "bitcoin,solana", "--features", "watch-only-discovery"]),
    ).toThrow(/seed phrases only/u);
  });

  it("leaves the account coins out of a watch-only build's default coins, as before them", () => {
    const parse = (args) => parseToolFeatureOptions("discovery-scanner", MULTI_CHAIN, args);
    const watchCoins = ["bitcoin", "dash", "ethereum", ...EVM_NETWORK_IDS];
    for (const args of [
      ["--features", "watch-only-discovery"],
      ["--features", "watch-only-discovery,custom-paths"],
      ["--exclude", "seed-discovery,wallet-matcher"],
    ])
      expect(parse(args).coins).toEqual(watchCoins);
    expect(parse([]).coins).toEqual([...watchCoins, ...Object.keys(ENDPOINTS)]);
    // Without seed-discovery, excluding every other coin leaves none, and the refusal says why.
    expect(() =>
      parse(["--exclude-coins", watchCoins.join(","), "--features", "watch-only-discovery"]),
    ).toThrow(/No coin left for discovery-scanner: .*solana.* seed-discovery feature/u);
    expect(() =>
      parse([
        "--exclude-coins",
        watchCoins.join(","),
        "--exclude",
        "seed-discovery,wallet-matcher",
      ]),
    ).toThrow(/No coin left for discovery-scanner/u);
  });

  it("offers the account coins in the Activity Viewer and removes unselected ones", () => {
    const template =
      '<select id="viewer-coin"><option value="bitcoin">Bitcoin</option><option value="dash">Dash</option><optgroup label="Other networks"><option value="solana">Solana</option><option value="near">NEAR</option></optgroup></select>';
    expect(applyActivityCoinTemplate(template, options(["dash", "near"]))).toBe(
      '<select id="viewer-coin"><option value="dash">Dash</option><optgroup label="Other networks"><option value="near">NEAR</option></optgroup></select>',
    );
    expect(applyActivityCoinTemplate(template, options(["dash"]))).not.toContain("optgroup");
    const near = [
      "apps/activity-viewer/src/activity-account.ts",
      "packages/public-data-providers/src/account-states-service.ts",
      "packages/public-data-providers/src/account-coin-facts.ts",
      "packages/public-data-providers/src/account-coins/near-rpc.ts",
    ];
    expect(() => assertActivityViewerComposition(options(["near"]), near)).not.toThrow();
    expect(() =>
      assertActivityViewerComposition(options(["near"]), [
        ...near,
        "packages/public-data-providers/src/account-coins/solana-rpc.ts",
      ]),
    ).toThrow(/excluded account coins/u);
    expect(() =>
      assertActivityViewerComposition(options(["bitcoin"]), [
        "apps/activity-viewer/src/activity-bitcoin.ts",
        "packages/public-data-providers/src/account-states-service.ts",
      ]),
    ).toThrow(/excluded account coins/u);
  });

  it("names the selected account coins in the Scanner's protocol footer", () => {
    const footer = new ToolProtocolFooter(MULTI_CHAIN, { coins: ["bitcoin", "solana", "near"] });
    expect(footer.render("discovery-scanner")).toBe(
      "Bitcoin BIP44/BIP49/BIP84/BIP86 public discovery · Account balance discovery: NEAR, Solana",
    );
  });

  it("forbids every account coin's endpoint and group in Dash Community artifacts", () => {
    expect(accountArtifactMarkers().forbidden).toEqual(
      expect.arrayContaining(["Other networks", "getMultipleAccounts", "horizon.stellar.org"]),
    );
    expect(findDashArtifactViolations("Other networks · https://free.rpc.fastnear.com")).toEqual([
      "account coin endpoint",
    ]);
    expect(findDashArtifactViolations('{"method":"getMultipleAccounts"}')).toEqual([
      "account coin endpoint",
    ]);
  });
});

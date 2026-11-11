import { TOOL_MANIFESTS } from "./tool-manifests.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
import {
  applySelectedNetworkCsp,
  assertSafeCustomOutput,
  parseRequestedOutput,
  parseToolFeatureOptions,
} from "./tool-feature-options.mjs";
import { resolve } from "node:path";
import {
  assertKeyDerivationComposition,
  selectedWorkerEntry,
} from "./key-derivation-composition.mjs";
import {
  applyKeyDerivationFeatureTemplate,
  derivationFeatureModules,
  parseKeyDerivationFeatures,
} from "./key-derivation-features.mjs";
import { assertPsbtComposition } from "./psbt-inspector-composition.mjs";
import { assertDashOnlyGraph, BUILD_PROFILES } from "./build-profiles.mjs";
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
import { MnemoCodeWalletTemplate } from "./mnemocode-wallet-template.mjs";

const options = (coins, features = []) => ({
  coins,
  hasCoin: (coin) => coins.includes(coin),
  has: (feature) => features.includes(feature),
});

/** The source that a composition plugin (`plugin`) loads for the module `path`. */
function composedSource(plugin, path) {
  let load;
  plugin.setup({
    onResolve() {},
    onLoad(_filter, callback) {
      load = callback;
    },
  });
  return load({ path }).contents;
}

// Independent graph fixture for the reviewed generic PNG closure: the shared UI's rules and the
// core's byte and refusal helpers, none of them MnemoCode's.
const GENERIC_PNG_INPUTS = [
  "packages/shared-ui/src/png-rules.ts",
  "packages/crypto-core/src/bytes.ts",
  "packages/crypto-core/src/byte-units.ts",
  "packages/crypto-core/src/error-catalog.ts",
];
const QR_IMAGE_INPUT = "packages/shared-ui/src/qr-image-import.ts";
const PNG_ADMISSION_INPUT = "packages/shared-ui/src/png-admission.ts";

describe("selective bundle graph guards", () => {
  for (const profileId of ["multi-chain", "dash-community"]) {
    const profile = BUILD_PROFILES[profileId];
    const coins =
      profile.id === "dash-community" ? ["dash"] : TOOL_MANIFESTS["key-derivation"].coins;
    const genericQr = options(coins, ["seedqr"]);
    const pngGraph = [QR_IMAGE_INPUT, PNG_ADMISSION_INPUT, ...GENERIC_PNG_INPUTS];

    it(`admits only the generic PNG closure without MnemoCode in ${profileId}`, () => {
      for (const pathOf of [
        (path) => path,
        (path) => `/workspace/${path}`,
        (path) => `C:\\workspace\\${path.replaceAll("/", "\\")}`,
      ])
        expect(() => assertKeyDerivationComposition(genericQr, pngGraph.map(pathOf))).not.toThrow();
      if (profileId === "dash-community")
        expect(() => assertDashOnlyGraph(pngGraph, "Generic QR PNG import")).not.toThrow();
    });

    it(`requires the exact shared PNG admission wrapper in ${profileId}`, () => {
      for (const selected of [genericQr, options(coins, ["mnemocode"])])
        for (const lookalike of [
          [],
          [`${PNG_ADMISSION_INPUT}.backup`],
          ["apps/key-derivation/src/ui/png-admission.ts"],
        ])
          expect(() =>
            assertKeyDerivationComposition(selected, [
              QR_IMAGE_INPUT,
              ...GENERIC_PNG_INPUTS,
              ...lookalike,
            ]),
          ).toThrow(/requires packages\/shared-ui\/src\/png-admission\.ts/u);
    });

    it(`keeps unrelated MnemoCode modules excluded beside generic PNG imports in ${profileId}`, () => {
      for (const leaked of [
        "packages/recovery-mnemocode-wasm/generated/multi-chain/key-derivation/mnemocode.wasm",
        "packages/recovery-backup/src/mnemocode.ts",
        "packages/recovery-backup/src/mnemocode-engine.ts",
        "packages/recovery-backup/src/mnemocode-facts.ts",
        "packages/recovery-backup/src/mnemocode-reencoding.ts",
        "packages/recovery-backup/src/mnemocode-cards.ts",
        "apps/key-derivation/src/ui/recovery-mnemocode-reencode.ts",
        "apps/key-derivation/src/ui/recovery-mnemocode-fields.ts",
        "apps/key-derivation/src/ui/recovery-mnemocode-help.ts",
        "apps/key-derivation/src/ui/recovery-mnemocode-forgotten-dates.ts",
        "apps/key-derivation/src/workers/page-wordlist.ts",
      ])
        expect(() => assertKeyDerivationComposition(genericQr, [...pngGraph, leaked])).toThrow(
          /excluded/u,
        );
    });

    it(`keeps runtime card content excluded without cards in ${profileId}`, () => {
      const selected = options(coins, ["mnemocode"]);
      for (const leaked of [
        "apps/key-derivation/src/ui/recovery-mnemocode-cards.ts",
        "apps/key-derivation/src/ui/recovery-mnemocode-heirs.ts",
        "apps/key-derivation/src/ui/recovery-mnemocode-heir-route.ts",
        "packages/recovery-backup/src/mnemocode-cards.ts",
        "packages/recovery-backup/src/mnemocode-heirs.ts",
      ])
        expect(() => assertKeyDerivationComposition(selected, [...pngGraph, leaked])).toThrow(
          /Feature mnemocode-cards is excluded/u,
        );
    });

    it(`keeps reencoding code and fields with MnemoCode in ${profileId}`, () => {
      const reencode = "apps/key-derivation/src/ui/recovery-mnemocode-reencode.ts";
      expect(() =>
        assertKeyDerivationComposition(options(coins, ["mnemocode"]), [reencode]),
      ).not.toThrow();
      expect(() => assertKeyDerivationComposition(genericQr, [...pngGraph, reencode])).toThrow(
        /Feature mnemocode is excluded/u,
      );
      const template = new MnemoCodeWalletTemplate().expand(
        readFileSync("apps/key-derivation/src/index.html", "utf8"),
      );
      const included = applyKeyDerivationFeatureTemplate(template, {
        ...options(coins, ["mnemocode"]),
        hasRecovery: true,
      });
      const excluded = applyKeyDerivationFeatureTemplate(template, {
        ...genericQr,
        hasRecovery: true,
      });
      for (const id of [
        "mnemocode-reencode-panel",
        "mnemocode-reencode-input",
        "mnemocode-reencode-read",
        "mnemocode-reencode-wallet-check",
        "mnemocode-reencode-continue",
        "mnemocode-reencode-wallet-fingerprint",
        "mnemocode-reencode-wallet-passphrase",
      ]) {
        expect(included).toContain(`id="${id}"`);
        expect(excluded).not.toContain(`id="${id}"`);
      }
      expect(included).toContain('aria-controls="mnemocode-reencode-panel"');
      expect(excluded).not.toContain('aria-controls="mnemocode-reencode-panel"');
    });

    it(`keeps the hidden SeedQR form with seedqr and mnemocode both in ${profileId}`, () => {
      const hiddenForm = "apps/key-derivation/src/ui/recovery-seedqr-hidden.ts";
      expect(() => assertKeyDerivationComposition(genericQr, [...pngGraph, hiddenForm])).toThrow(
        /Hidden SeedQR \(seedqr with mnemocode\) is excluded/u,
      );
      const template = readFileSync("apps/key-derivation/src/index.html", "utf8");
      const included = applyKeyDerivationFeatureTemplate(template, {
        ...options(coins, ["seedqr", "mnemocode"]),
        hasRecovery: true,
      });
      const excluded = applyKeyDerivationFeatureTemplate(template, {
        ...genericQr,
        hasRecovery: true,
      });
      for (const id of [
        "seedqr-qr-form",
        "seedqr-qr-form-ordinary",
        "seedqr-qr-form-hidden",
        "seedqr-decoy",
        "seedqr-hidden-note",
        "seedqr-decoy-kind",
        "seedqr-decoy-fields",
        "seedqr-hidden-decode-note",
      ]) {
        expect(included).toContain(`id="${id}"`);
        expect(excluded).not.toContain(`id="${id}"`);
      }
      // The ordinary SeedQR stays whole: both formats, Create and the import's field.
      for (const id of ["seedqr-format", "create-seedqr", "seedqr-payload", "restore-seedqr"])
        expect(excluded).toContain(`id="${id}"`);
      expect(excluded).toContain('<option value="compact">CompactSeedQR · binary</option>');
    });
  }

  it("requires reencoding IDs and expanded wallet fields in the static artifact gate", () => {
    const verifier = readFileSync(
      "apps/key-derivation/scripts/verify-key-derivation-artifact.mjs",
      "utf8",
    );
    const requiredIds = /const requiredIds = \[([\s\S]*?)\];/u.exec(verifier)?.[1];
    expect(requiredIds).toBeDefined();
    for (const id of [
      "mnemocode-reencode-panel",
      "mnemocode-reencode-input",
      "mnemocode-reencode-read",
      "mnemocode-reencode-wallet-check",
      "mnemocode-reencode-continue",
      "mnemocode-reencode-wallet-fingerprint",
      "mnemocode-reencode-wallet-passphrase",
    ])
      expect(requiredIds).toContain(`"${id}"`);
    expect(verifier).toContain('html.includes("MNEMOCODE_WALLET_FIELDS")');
    for (const operation of ["encode", "decode", "forgotten", "reencode"])
      for (const choice of ["mode", "format"])
        expect(requiredIds).toContain(`"mnemocode-${operation}-${choice}"`);
  });

  it("ships checked generation only with MHFE", () => {
    const template =
      '<div id="wallet-check-generation"><input id="wallet-check-enabled"></div><section id="mhfe-panel"></section>';
    expect(applyKeyDerivationFeatureTemplate(template, options(["dash"], []))).not.toContain(
      "wallet-check-enabled",
    );
    expect(applyKeyDerivationFeatureTemplate(template, options(["dash"], ["mhfe"]))).toContain(
      "wallet-check-enabled",
    );
    for (const file of [
      "apps/key-derivation/src/ui/checked-mnemonic-feature.ts",
      "apps/key-derivation/src/ui/wallet-check-draw.ts",
      "apps/key-derivation/src/workers/wallet-check-draw-worker.ts",
    ])
      expect(() => assertKeyDerivationComposition(options(["dash"], []), [file])).toThrow(
        /excluded/u,
      );
    // The page's worker wordlist goes to MnemoCode's worker and to the wallet-check draw's.
    const workerHelpers = ["apps/key-derivation/src/workers/page-wordlist.ts"];
    for (const feature of ["mnemocode", "mhfe"])
      expect(() =>
        assertKeyDerivationComposition(options(["dash"], [feature]), workerHelpers),
      ).not.toThrow();
    expect(() => assertKeyDerivationComposition(options(["dash"], []), workerHelpers)).toThrow(
      /excluded/u,
    );
  });
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

  it("rejects empty selective option values and missing output paths", () => {
    const profile = { id: "multi-chain", capabilities: { bitcoinSilentPayments: true } };
    expect(() => parseToolFeatureOptions("discovery-scanner", profile, ["--features="])).toThrow(
      "--features requires",
    );
    expect(() => parseKeyDerivationFeatures(profile, ["--coins="])).toThrow("--coins requires");
    expect(() => parseToolFeatureOptions("discovery-scanner", profile, ["--features=,"])).toThrow(
      "--features requires",
    );
    expect(() => parseRequestedOutput(["--output"])).toThrow("--output requires");
    expect(() => parseRequestedOutput(["--output="])).toThrow("--output requires");
  });

  it("rejects unknown tools and a shared output path without an explicit profile before building", () => {
    for (const args of [
      ["--tool", "unknown-tool"],
      ["--tool", "constructor"],
      ["--tool", "activity-viewer", "--output", "/tmp/ckd-unused-output.html"],
    ]) {
      const result = spawnSync(
        process.execPath,
        [resolve("tooling/build-html-profiles.mjs"), ...args],
        {
          encoding: "utf8",
        },
      );
      expect(result.status).not.toBe(0);
    }
  });

  it("reserves canonical release directories from selective --output paths", () => {
    const root = "/workspace";
    expect(() =>
      assertSafeCustomOutput(
        root,
        resolve(root, "dist/multi-chain-edition/Wallet_Activity_Viewer.html"),
      ),
    ).toThrow(/Canonical release artifacts/u);
    expect(() =>
      assertSafeCustomOutput(root, resolve(root, "dist/custom-builds/viewer.html")),
    ).not.toThrow();
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

  it("selects signing workers from coins rather than visual edition", () => {
    const profile = { id: "multi-chain" };
    const dashWorker = selectedWorkerEntry(
      "/workspace",
      profile,
      options(["dash"], ["message-signing"]),
    );
    expect(dashWorker).toContain("message-signer-dash.ts");
    expect(dashWorker).not.toContain("message-signer.ts");
    const bitcoinWorker = selectedWorkerEntry(
      "/workspace",
      profile,
      options(["bitcoin"], ["message-signing"]),
    );
    expect(bitcoinWorker).toContain("message-signer.ts");
  });

  it("brings each feature's known answers with the feature, quick ones at startup", () => {
    const profile = { id: "multi-chain" };
    const all = ["bip85", "silent-payments", "bip38-encrypt", "message-signing"];
    const bitcoinWorker = selectedWorkerEntry("/workspace", profile, options(["bitcoin"], all));
    expect(bitcoinWorker).toContain(
      "startupSelfTests: [runSilentPaymentSelfTest, runBip85SelfTest, runBitcoinMessageSigningSelfTest]",
    );
    expect(bitcoinWorker).toContain(
      "fullSelfTests: [runBip322FullSelfTest, runBitcoinBip38FullSelfTest]",
    );
    // A coin's vectors come only with the coin (AUD-023-BLD001).
    expect(bitcoinWorker).not.toContain("-dash.ts");
    const dashWorker = selectedWorkerEntry("/workspace", profile, options(["dash"], all));
    expect(dashWorker).toContain("message-signer-self-test-dash.ts");
    expect(dashWorker).toContain("bip38-self-test-dash.ts");
    expect(dashWorker).toContain("masternode-self-test-dash.ts");
    expect(dashWorker).not.toContain("-bitcoin.ts");
    expect(dashWorker).not.toContain("runBip322FullSelfTest");
    const both = selectedWorkerEntry("/workspace", profile, options(["bitcoin", "dash"], all));
    expect(both).toContain(
      "fullSelfTests: [runBip322FullSelfTest, runBitcoinBip38FullSelfTest, runDashBip38FullSelfTest, runDashMasternodeFullSelfTest]",
    );
    // The masternode keys are Dash's own protocol: they come with the coin, without a feature.
    const bare = selectedWorkerEntry("/workspace", profile, options(["dash"], []));
    expect(bare).toContain("startupSelfTests: [], fullSelfTests: [runDashMasternodeFullSelfTest]");
    expect(selectedWorkerEntry("/workspace", profile, options(["bitcoin"], []))).toContain(
      "startupSelfTests: [], fullSelfTests: []",
    );
    // TON's 100,000-round key check comes with TON alone.
    expect(selectedWorkerEntry("/workspace", profile, options(["ton"], []))).toContain(
      "startupSelfTests: [], fullSelfTests: [runTonKeyFullSelfTest]",
    );
    expect(both).not.toContain("ton-key-self-test.ts");
  });

  it("brings the page's TON phrase feature with TON alone", () => {
    const installers = (coins, features) =>
      derivationFeatureModules(options(coins, features)).map(([, , symbol]) => symbol);
    expect(installers(["ton"], [])).toEqual(["installTonPhraseFeature"]);
    expect(installers(["bitcoin", "ton"], ["mhfe", "bip85"])).toEqual([
      "installBip85Feature",
      "installCheckedMnemonicFeature",
      "installTonPhraseFeature",
    ]);
    expect(installers(["bitcoin", "tron"], ["mhfe"])).toEqual(["installCheckedMnemonicFeature"]);
    const template = '<div id="ton-generation"><input id="ton-generation-enabled" /></div>';
    expect(applyKeyDerivationFeatureTemplate(template, options(["ton"]))).toContain(
      "ton-generation-enabled",
    );
    expect(applyKeyDerivationFeatureTemplate(template, options(["tron"]))).not.toContain(
      "ton-generation",
    );
  });

  it("keeps recovery destination menus ordered like their tabs", () => {
    const expected = [
      "matcher",
      "seedqr",
      "mhfe",
      "slip39",
      "sskr",
      "gordian-envelope",
      "codex32",
      "mnemocode",
    ];
    for (const file of ["apps/key-derivation/src/index.html", "tooling/profile-template.mjs"]) {
      const source = readFileSync(file, "utf8");
      const targets = [...source.matchAll(/data-recovery-target="([^"]+)"/gu)].map(
        (match) => match[1],
      );
      expect(targets).toEqual(expected);
    }
  });

  it("keeps every recovery tab at the same position as its panel", () => {
    // Tabs and panels are paired by position, so their order in the page must match.
    const source = readFileSync("apps/key-derivation/src/index.html", "utf8");
    const tabs = [...source.matchAll(/<button\b[^>]*\bdata-recovery-tab\b[^>]*>/gu)].map(
      (match) => /aria-controls="([^"]+)"/u.exec(match[0])?.[1],
    );
    const panels = [...source.matchAll(/<section\b[^>]*\bdata-recovery-panel\b[^>]*>/gu)].map(
      (match) => /\bid="([^"]+)"/u.exec(match[0])?.[1],
    );
    expect(tabs.length).toBeGreaterThan(0);
    expect(tabs).toEqual(panels);
  });

  it("removes every excluded recovery module from both source menus", () => {
    const targetByFeature = {
      "wallet-matcher": "matcher",
      seedqr: "seedqr",
      mnemocode: "mnemocode",
      mhfe: "mhfe",
      slip39: "slip39",
      sskr: "sskr",
      "gordian-envelope": "gordian-envelope",
      codex32: "codex32",
    };
    const panelByFeature = Object.fromEntries(
      Object.keys(targetByFeature).map((feature) => [
        feature,
        `${feature === "wallet-matcher" ? feature : feature}-panel`,
      ]),
    );
    const allFeatures = Object.keys(targetByFeature);
    const template = `${allFeatures
      .map((feature) => `<section id="${panelByFeature[feature]}"></section>`)
      .join("")}<div>${Object.values(targetByFeature)
      .flatMap((target) => [
        `<button data-recovery-source="main" data-recovery-target="${target}">${target}</button>`,
        `<button data-recovery-source="bip85" data-recovery-target="${target}">${target}</button>`,
      ])
      .join("")}</div>`;

    for (const excluded of allFeatures) {
      const selected = allFeatures.filter((feature) => feature !== excluded);
      const rendered = applyKeyDerivationFeatureTemplate(template, {
        ...options(["bitcoin"], selected),
        hasRecovery: true,
      });
      expect(rendered).not.toContain(`data-recovery-target="${targetByFeature[excluded]}"`);
      for (const retained of selected) {
        expect(
          rendered.match(new RegExp(`data-recovery-target="${targetByFeature[retained]}"`, "gu")),
        ).toHaveLength(2);
      }
    }
  });

  it("requires BIP85 UI, child wallet and worker together", () => {
    const selected = options(["bitcoin"], ["bip85"]);
    const inputs = [
      "apps/key-derivation/src/ui/bip85-feature.ts",
      "apps/key-derivation/src/ui/bip85-child-wallet-feature.ts",
      "apps/key-derivation/src/ui/bip85-child-derivation.ts",
      "packages/crypto-core/src/bip85.ts",
    ];
    expect(() => assertKeyDerivationComposition(selected, inputs)).not.toThrow();
    expect(() => assertKeyDerivationComposition(selected, inputs.slice(1))).toThrow(
      /bip85-feature/u,
    );
    expect(() => assertKeyDerivationComposition(options(["bitcoin"]), inputs)).toThrow(/excluded/u);
  });

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
      "Ethereum, BNB Chain: PublicNode JSON-RPC · Ethereum history: Blockscout",
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

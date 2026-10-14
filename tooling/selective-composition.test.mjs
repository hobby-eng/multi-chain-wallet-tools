import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyActivityCoinTemplate,
  assertActivityViewerComposition,
} from "./activity-viewer-composition.mjs";
import {
  applyDiscoveryFeatureTemplate,
  assertDiscoveryComposition,
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
  parseKeyDerivationFeatures,
} from "./key-derivation-features.mjs";
import { assertPsbtComposition } from "./psbt-inspector-composition.mjs";
import { assertDashOnlyGraph, BUILD_PROFILES } from "./build-profiles.mjs";
import { MnemoCodeWalletTemplate } from "./mnemocode-wallet-template.mjs";

const options = (coins, features = []) => ({
  coins,
  hasCoin: (coin) => coins.includes(coin),
  has: (feature) => features.includes(feature),
});

// Independent graph fixture for the reviewed generic PNG closure, not all MnemoCode sources.
const GENERIC_PNG_INPUTS = [
  "core/png-admission.ts",
  "core/byte-units.ts",
  "core/bits.ts",
  "core/bip39-sizes.ts",
  "core/pieces.ts",
  "core/places.ts",
  "core/typed-number.ts",
  "sskr/checksum.ts",
].map((file) => `packages/recovery-mnemocode/source/${file}`);
const QR_IMAGE_INPUT = "packages/shared-ui/src/qr-image-import.ts";
const PNG_ADMISSION_INPUT = "packages/shared-ui/src/png-admission.ts";

describe("selective bundle graph guards", () => {
  for (const profileId of ["multi-chain", "dash-community"]) {
    const profile = BUILD_PROFILES[profileId];
    const coins = profile.id === "dash-community" ? ["dash"] : ["bitcoin", "dash", "ethereum"];
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

    it(`refuses each PNG dependency without the generic QR importer in ${profileId}`, () => {
      for (const input of GENERIC_PNG_INPUTS) {
        expect(() =>
          assertKeyDerivationComposition(genericQr, [PNG_ADMISSION_INPUT, input]),
        ).toThrow(/Feature mnemocode is excluded/u);
        for (const lookalike of [
          `${QR_IMAGE_INPUT}.backup`,
          "apps/key-derivation/src/ui/qr-image-import.ts",
        ])
          expect(() =>
            assertKeyDerivationComposition(genericQr, [lookalike, PNG_ADMISSION_INPUT, input]),
          ).toThrow(/Feature mnemocode is excluded/u);
      }
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
        "packages/recovery-mnemocode/source/core/wallet-evidence.ts",
        "packages/recovery-mnemocode/source/core/types.ts",
        "packages/recovery-mnemocode/source/core/encoded-form.ts",
        "packages/recovery-mnemocode/source/core/re-encoding.ts",
        "packages/recovery-mnemocode/source/core/png-admission-self-test.ts",
        "packages/recovery-mnemocode/source/core/byte-units.ts.backup",
        "packages/recovery-mnemocode/source/sskr/share-restore.ts",
        "packages/recovery-mnemocode/source/export/card-content.ts",
        "packages/recovery-backup/src/mnemocode.ts",
        "apps/key-derivation/src/ui/recovery-mnemocode-reencode.ts",
        "apps/key-derivation/src/ui/recovery-mnemocode-fields.ts",
        "apps/key-derivation/src/ui/recovery-mnemocode-help.ts",
        "apps/key-derivation/src/ui/recovery-mnemocode-forgotten-dates.ts",
      ])
        expect(() => assertKeyDerivationComposition(genericQr, [...pngGraph, leaked])).toThrow(
          /excluded/u,
        );
    });

    it(`keeps runtime card content excluded without cards in ${profileId}`, () => {
      const selected = options(coins, ["mnemocode"]);
      for (const leaked of [
        "apps/key-derivation/src/ui/recovery-mnemocode-cards.ts",
        "apps/key-derivation/src/ui/recovery-mnemocode-card-images.ts",
        "packages/recovery-backup/src/mnemocode-cards.ts",
        "packages/recovery-mnemocode/source/export/card-content.ts",
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
      "apps/key-derivation/src/ui/recovery-mhfe-draw-outlook.ts",
    ])
      expect(() => assertKeyDerivationComposition(options(["dash"], []), [file])).toThrow(
        /excluded/u,
      );
    // MHFE draws in its own package: the page's worker wordlist and seed provider are MnemoCode's.
    const workerHelpers = [
      "apps/key-derivation/src/workers/page-wordlist.ts",
      "apps/key-derivation/src/workers/webcrypto-pbkdf2.ts",
    ];
    expect(() =>
      assertKeyDerivationComposition(options(["dash"], ["mnemocode"]), workerHelpers),
    ).not.toThrow();
    expect(() =>
      assertKeyDerivationComposition(options(["dash"], ["mhfe"]), workerHelpers),
    ).toThrow();
  });
  it("pins fixed provider origins in connected builds without Dash", () => {
    const rendered = applySelectedNetworkCsp(
      "connect-src https:;",
      options(["bitcoin", "ethereum"]),
    );
    expect(rendered).toContain("https://blockstream.info");
    expect(rendered).toContain("https://ethereum-rpc.publicnode.com");
    expect(rendered).not.toContain("connect-src https:;");
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
    expect(dashWorker).not.toContain("-bitcoin.ts");
    expect(dashWorker).not.toContain("runBip322FullSelfTest");
    const both = selectedWorkerEntry("/workspace", profile, options(["bitcoin", "dash"], all));
    expect(both).toContain(
      "fullSelfTests: [runBip322FullSelfTest, runBitcoinBip38FullSelfTest, runDashBip38FullSelfTest]",
    );
    const bare = selectedWorkerEntry("/workspace", profile, options(["dash"], []));
    expect(bare).toContain("startupSelfTests: [], fullSelfTests: []");
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
      "apps/key-derivation/src/workers/bip85-deriver.ts",
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

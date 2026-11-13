// The selective builds of the Deriver: their bundle-graph guards, templates, options and
// recovery menus. The coin-owned modules are in coin-module-composition.test.mjs, the connected
// tools in selective-connected-composition.test.mjs.
import { TOOL_MANIFESTS } from "./tool-manifests.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertSafeCustomOutput,
  parseRequestedOutput,
  parseToolFeatureOptions,
} from "./tool-feature-options.mjs";
import { resolve } from "node:path";
import { assertKeyDerivationComposition } from "./key-derivation-composition.mjs";
import {
  applyKeyDerivationFeatureTemplate,
  parseKeyDerivationFeatures,
} from "./key-derivation-features.mjs";
import { assertDashOnlyGraph, BUILD_PROFILES } from "./build-profiles.mjs";
import { MnemoCodeWalletTemplate } from "./mnemocode-wallet-template.mjs";
import { options } from "./composition-test-helpers.mjs";

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
});

describe("selective Deriver templates and gates", () => {
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

  it("orders coins by edition: Dash Community never takes the coin-order rule", () => {
    // The Deriver's coin order follows the edition, not the coin count: every Multi-Chain build
    // orders its lists (Bitcoin first), and only Dash Community, whose gate forbids that rule's
    // words, keeps the no-op comparator.
    const parse = (id, args = []) =>
      parseKeyDerivationFeatures(BUILD_PROFILES[id], args).dashCommunity;
    expect(parse("dash-community")).toBe(true);
    expect(parse("multi-chain")).toBe(false);
    expect(parse("multi-chain", ["--coins", "dash"])).toBe(false);
  });
});

describe("selective build options", () => {
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
});

describe("recovery source menus and BIP85 in selective builds", () => {
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
});

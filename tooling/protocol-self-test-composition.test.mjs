import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  createCoinRegistry,
  resolveCoinProtocol,
} from "../packages/coin-protocols/src/coins/registry-base.ts";
import { DASH_COIN_ADAPTERS } from "../packages/coin-protocols/src/coins/adapters/dash.ts";
import {
  assertKeyDerivationComposition,
  createKeyDerivationCompositionPlugin,
  selectedWorkerEntry,
} from "./key-derivation-composition.mjs";
import {
  assertDiscoveryComposition,
  createDiscoveryCompositionPlugin,
  discoveryAppEntry,
} from "./discovery-composition.mjs";
import { DERIVATION_SELF_TESTS, LOCAL_SEARCH_SELF_TEST } from "./derivation-self-tests.mjs";
import {
  ENCODED_FORMATS,
  MASKING_MODES,
} from "../packages/recovery-mnemocode/source/core/types.ts";
import {
  ENCODED_FORMATS as adapterFormats,
  MASKING_MODES as adapterModes,
  mnemoCodeTakesDates,
} from "../packages/recovery-backup/src/mnemocode.ts";
import { installModeAndFormatChoices } from "../apps/key-derivation/src/ui/recovery-mnemocode-fields.ts";
import {
  MNEMOCODE_AUTO_FORMAT_HELP,
  MNEMOCODE_FORMAT_HELP,
  MNEMOCODE_MODE_HELP,
} from "../apps/key-derivation/src/ui/recovery-mnemocode-help.ts";
import { RecoveryTestPage } from "../apps/key-derivation/tests/fake-recovery-page.ts";

const options = (coins, features = []) => ({
  coins,
  hasCoin: (coin) => coins.includes(coin),
  has: (feature) => features.includes(feature),
});

/** Read the production plugin's virtual modules without invoking a bundler. */
function virtualSource(plugin, path) {
  let load;
  plugin.setup({
    onResolve() {},
    onLoad(_options, callback) {
      load = callback;
    },
  });
  return load({ path }).contents;
}

function keySource(selection, path) {
  return virtualSource(createKeyDerivationCompositionPlugin("/workspace", selection), path);
}

function discoverySource(selection) {
  return virtualSource(
    createDiscoveryCompositionPlugin("/workspace", selection),
    "ckd:selected-discovery-self-test",
  );
}

function stage(source, name) {
  return new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`, "u").exec(source)?.[1] ?? "";
}

function occurrences(text, value) {
  return text.split(value).length - 1;
}

describe("library-owned MnemoCode selector bindings", () => {
  const bindings = [
    ["encode", false, false, "recovery-mnemocode-encode.ts"],
    ["decode", true, false, "recovery-mnemocode-decode.ts"],
    ["forgotten", true, true, "recovery-mnemocode-forgotten-dates.ts"],
    ["reencode", true, false, "recovery-mnemocode-reencode.ts"],
  ];

  it("reexports the core choice collections without another adapter list", () => {
    expect(adapterModes).toBe(MASKING_MODES);
    expect(adapterFormats).toBe(ENCODED_FORMATS);
  });

  it("keeps representation numbers aligned with the core's CLI choice order", () => {
    // core/types.ts defines ENCODED_FORMATS in the order numbered by the CLI menu.
    for (const [index, format] of ENCODED_FORMATS.entries())
      expect(MNEMOCODE_FORMAT_HELP[format].title, format).toMatch(
        new RegExp(`^${index + 1} · `, "u"),
      );
  });

  it.each(bindings)(
    "binds %s controls to the core choices and their Help titles",
    (prefix, auto, datesOnly, module) => {
      const markup = readFileSync(
        new URL("../apps/key-derivation/src/index.html", import.meta.url),
        "utf8",
      );
      const page = new RecoveryTestPage();
      try {
        // Read the real empty controls instead of maintaining another HTML/options fixture.
        for (const [, id, content] of markup.matchAll(
          /<select\b[^>]*\bid="(mnemocode-(?:encode|decode|forgotten|reencode)-(?:mode|format))"[^>]*>([\s\S]*?)<\/select>/gu,
        )) {
          expect(content.trim(), id).toBe("");
          page.add(id, "select");
        }
        const mode = page.require(`mnemocode-${prefix}-mode`);
        const format = page.require(`mnemocode-${prefix}-format`);
        const caller = readFileSync(
          new URL(`../apps/key-derivation/src/ui/${module}`, import.meta.url),
          "utf8",
        );
        const argumentsList = [
          JSON.stringify(prefix),
          ...(auto ? ["true"] : []),
          ...(datesOnly ? ["true"] : []),
        ];
        const call = new RegExp(
          `installModeAndFormatChoices\\(\\s*${argumentsList.join("\\s*,\\s*")}\\s*\\)`,
          "u",
        );
        expect(caller).toContain('from "./recovery-mnemocode-fields.js"');
        expect(caller).toMatch(call);

        installModeAndFormatChoices(prefix, auto, datesOnly);
        expect(mode.children.map((option) => [option.value, option.textContent])).toEqual(
          MASKING_MODES.filter((mode) => !datesOnly || mnemoCodeTakesDates(mode)).map((mode) => [
            mode,
            MNEMOCODE_MODE_HELP[mode].title,
          ]),
        );
        expect(format.children.map((option) => [option.value, option.textContent])).toEqual([
          ...(auto ? [["auto", MNEMOCODE_AUTO_FORMAT_HELP.title]] : []),
          ...ENCODED_FORMATS.map((format) => [format, MNEMOCODE_FORMAT_HELP[format].title]),
        ]);
        // A second initialization must replace choices, not duplicate them.
        const modeValues = mode.children.map((option) => option.value);
        const formatValues = format.children.map((option) => option.value);
        installModeAndFormatChoices(prefix, auto, datesOnly);
        expect(mode.children.map((option) => option.value)).toEqual(modeValues);
        expect(format.children.map((option) => option.value)).toEqual(formatValues);
        mode.remove();
        expect(() => installModeAndFormatChoices(prefix, auto, datesOnly)).toThrow(
          `Recovery workspace is missing #mnemocode-${prefix}-mode.`,
        );
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
});

describe("generated protocol metadata", () => {
  it.each([[["dash"]], [["bitcoin", "dash", "ethereum"]]])(
    "delegates CoinJoin metadata and dispatch in the %j composition",
    (coins) => {
      const source = keySource(options(coins), "ckd:selected-runtime-registry");
      expect(source).toContain("resolveCoinProtocol(registry, id)");
      expect(source).toContain("DashRuntimeRegistry.derivationFor(id)");
      expect(source).not.toContain("dash-core-coinjoin");
      const registry = createCoinRegistry(DASH_COIN_ADAPTERS);
      const getCoinAdapter = vi.fn(registry.getCoinAdapter);
      const resolver = vi.fn(resolveCoinProtocol);
      const derive = vi.fn();
      // Only generated glue executes. Public metadata is real; cryptographic dispatch is a stub.
      const executable = source.replace(/^import .*$/gmu, "").replace(/^export /gmu, "");
      const runtime = runInNewContext(`${executable}\ngetRuntimeCoinAdapter;`, {
        registry: { ...registry, getCoinAdapter },
        resolveCoinProtocol: resolver,
        DashRuntimeRegistry: { derivationFor: () => derive },
        BitcoinPurposeProfile: { forAdapterId: () => undefined },
        deriveBitcoin: vi.fn(),
        deriveEthereum: vi.fn(),
      });
      const protocol = runtime("dash-core-coinjoin");
      expect(protocol.id).toBe("dash-core-coinjoin");
      expect(protocol.label).toBe("Dash Mobile CoinJoin · DIP9");
      expect(
        protocol.pathPreview({
          network: "testnet",
          account: 7,
          branch: 1,
          start: 2,
          count: 1,
        }),
      ).toBe("m/9'/1'/4'/7'/1/2");
      expect(protocol.derive).toBe(derive);
      expect(resolver).toHaveBeenCalledTimes(1);
      expect(getCoinAdapter).not.toHaveBeenCalled();
      expect(() => runtime("bitcoin-legacy")).toThrow(/Unsupported derivation protocol/u);
    },
  );

  it("keeps Dash dispatch out of non-Dash builds and uses Bitcoin's profile owner", () => {
    const source = keySource(options(["bitcoin"]), "ckd:selected-runtime-registry");
    expect(source).not.toContain("/coins/dash/");
    expect(source).toContain("BitcoinPurposeProfile.forAdapterId(id)");
    expect(source).not.toContain("'bitcoin-legacy':'legacy'");
  });
});

describe("selected worker self-tests", () => {
  it("keeps the MnemoCode card startup row selected only with cards", () => {
    for (const coins of [["dash"], ["bitcoin", "dash", "ethereum"]]) {
      const withCards = options(coins, ["mnemocode", "mnemocode-cards"]);
      const withoutCards = options(coins, ["mnemocode"]);
      const included = keySource(withCards, "ckd:selected-recovery-self-test");
      const excluded = keySource(withoutCards, "ckd:selected-recovery-self-test");
      expect(included).toContain("/self-test-mnemocode-cards.ts");
      expect(occurrences(included, "runMnemoCodeCardsSelfTest()")).toBe(1);
      expect(excluded).not.toContain("runMnemoCodeCardsSelfTest");
      const input = "packages/recovery-backup/src/self-test-mnemocode-cards.ts";
      expect(() => assertKeyDerivationComposition(withCards, [input])).not.toThrow();
      expect(() => assertKeyDerivationComposition(withoutCards, [input])).toThrow(/excluded/u);
    }
  });

  it.each([[["bitcoin"]], [["dash"]], [["ethereum"]], [["bitcoin", "dash"]]])(
    "imports only selected derivation suites for %j",
    (coins) => {
      const source = keySource(options(coins), "ckd:selected-derivation-self-test");
      for (const [coin, [, module]] of Object.entries(DERIVATION_SELF_TESTS)) {
        expect(source.includes(module)).toBe(coins.includes(coin));
      }
      // Metadata checks belong to each suite, not a second combined invocation.
      expect(source).not.toContain("PathSelfTest");
    },
  );

  it("includes the local-search check once with the matcher and inherits it in the full suite", () => {
    for (const coins of [["bitcoin"], ["dash"], ["ethereum"]]) {
      const enabled = selectedWorkerEntry(
        "/workspace",
        { id: "multi-chain" },
        options(coins, ["wallet-matcher"]),
      );
      expect(enabled).toContain(LOCAL_SEARCH_SELF_TEST.module);
      expect(occurrences(stage(enabled, "startupSelfTests"), LOCAL_SEARCH_SELF_TEST.symbol)).toBe(
        1,
      );
      expect(stage(enabled, "fullSelfTests")).not.toContain(LOCAL_SEARCH_SELF_TEST.symbol);
      const excluded = selectedWorkerEntry("/workspace", { id: "multi-chain" }, options(coins));
      expect(excluded).not.toContain(LOCAL_SEARCH_SELF_TEST.module);
      expect(excluded).not.toContain(LOCAL_SEARCH_SELF_TEST.symbol);
    }
  });

  it("default workers also list local search only in their startup checks", () => {
    for (const file of ["derive-worker.ts", "derive-worker-dash-community.ts"]) {
      const source = readFileSync(
        new URL(`../apps/key-derivation/src/workers/${file}`, import.meta.url),
        "utf8",
      );
      expect(occurrences(stage(source, "startupSelfTests"), LOCAL_SEARCH_SELF_TEST.symbol)).toBe(1);
      expect(stage(source, "fullSelfTests")).not.toContain(LOCAL_SEARCH_SELF_TEST.symbol);
    }
  });

  it("each coin verification suite invokes and reports its own path checks once", () => {
    // Inspect wiring only; executing these vector suites would also load crypto/WASM checks.
    for (const [coin, [, module]] of Object.entries(DERIVATION_SELF_TESTS)) {
      const source = readFileSync(new URL(`../${module}`, import.meta.url), "utf8");
      const name = `run${coin[0].toUpperCase()}${coin.slice(1)}PathSelfTest`;
      expect(occurrences(source, `${name}(`)).toBe(1);
      expect(source.indexOf(`${name}(`)).toBeLessThan(source.indexOf("checkDerivationVectors("));
      expect(source).toContain("checks.unshift(...pathChecks)");
      expect(source).toContain(`@ckd/coins/${coin}/path-self-test.js`);
      expect(source).not.toMatch(/@ckd\/coins\/(?:registry|dash-registry)\.js/u);
      for (const other of Object.keys(DERIVATION_SELF_TESTS).filter((name) => name !== coin))
        expect(source).not.toContain(`@ckd/coins/${other}/`);
    }
  });
});

describe("Scanner offline address-search self-tests", () => {
  it.each([
    [["bitcoin"], ["seed-discovery", "wallet-matcher"], true],
    [["bitcoin", "dash"], ["seed-discovery", "wallet-matcher"], true],
    [["dash"], ["seed-discovery", "wallet-matcher"], false],
    [["bitcoin"], ["seed-discovery"], false],
    [["bitcoin"], ["watch-only-discovery"], false],
    [["bitcoin"], ["watch-only-discovery", "wallet-matcher"], false],
  ])("matches the actual runner for %j / %j", (coins, features, included) => {
    const selection = options(coins, features);
    const source = discoverySource(selection);
    const app = discoveryAppEntry("/workspace", selection);
    expect(source.includes(LOCAL_SEARCH_SELF_TEST.module)).toBe(included);
    expect(app.includes("createBitcoinAddressSearchRunner")).toBe(included);
    if (included) expect(occurrences(source, LOCAL_SEARCH_SELF_TEST.symbol)).toBe(2);
  });

  it("default Multi-Chain Scanner includes the check, while Dash Scanner has no offline runner", () => {
    const multi = readFileSync(
      new URL("../apps/discovery-scanner/src/self-test.ts", import.meta.url),
      "utf8",
    );
    const dash = readFileSync(
      new URL("../apps/discovery-scanner/src/self-test-dash-community.ts", import.meta.url),
      "utf8",
    );
    expect(occurrences(multi, LOCAL_SEARCH_SELF_TEST.symbol)).toBe(2);
    expect(dash).not.toContain(LOCAL_SEARCH_SELF_TEST.symbol);
  });
});

describe("path and local-search graph gates", () => {
  it("rejects path checks for excluded coins", () => {
    const selected = options(["dash"]);
    const base = [
      "packages/network-boundary/src/request-validation.ts",
      "packages/coin-protocols/src/coins/dash/profiles.ts",
    ];
    for (const coin of ["bitcoin", "ethereum"]) {
      const leaked = `packages/coin-protocols/src/coins/${coin}/path-self-test.ts`;
      expect(() => assertKeyDerivationComposition(selected, [leaked])).toThrow(/excluded/u);
      expect(() => assertDiscoveryComposition(selected, [...base, leaked])).toThrow(/excluded/u);
    }
  });

  it("rejects local-search checks without the feature and requires both modules with it", () => {
    const local = LOCAL_SEARCH_SELF_TEST.sourceMarkers.map((marker) => `packages${marker}`);
    for (const file of local) {
      expect(() => assertKeyDerivationComposition(options(["dash"]), [file])).toThrow(/excluded/u);
      expect(() => assertDiscoveryComposition(options(["dash"]), [file])).toThrow(
        /excluded local address search/u,
      );
    }
    const matcher = options(["dash"], ["wallet-matcher"]);
    expect(() => assertKeyDerivationComposition(matcher, local)).not.toThrow();
    expect(() => assertKeyDerivationComposition(matcher, local.slice(1))).toThrow(
      /startup self-test/u,
    );
    const scanner = options(["bitcoin"], ["seed-discovery", "wallet-matcher"]);
    const base = [
      "packages/network-boundary/src/request-validation.ts",
      "packages/coin-protocols/src/coins/bitcoin/profiles.ts",
      "apps/discovery-scanner/src/seed-scan-input.ts",
      "packages/secret-vault/src/worker-bootstrap.ts",
      "apps/discovery-scanner/src/address-search-feature.ts",
    ];
    expect(() => assertDiscoveryComposition(scanner, [...base, ...local])).not.toThrow();
    expect(() => assertDiscoveryComposition(scanner, [...base, local[1]])).toThrow(
      /startup self-test/u,
    );
  });
});

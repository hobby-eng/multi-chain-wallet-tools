import { describe, expect, it } from "vitest";
import {
  assertDashOnlyGraph,
  BUILD_PROFILES,
  applyProfileTemplate,
  getToolBuild,
  profileArtifacts,
} from "./build-profiles.mjs";

describe("build profiles", () => {
  it("places Multi-Chain artifacts in their edition directory", () => {
    expect(profileArtifacts(BUILD_PROFILES["multi-chain"])).toEqual([
      "multi-chain-edition/activity-viewer/Wallet_Activity_Viewer.html",
      "multi-chain-edition/discovery-scanner/Wallet_Discovery_Scanner.html",
      "multi-chain-edition/key-derivation/Wallet_Key_Derivation_Tool.html",
      "multi-chain-edition/psbt-inspector/PSBT_Multisig_Inspector.html",
    ]);
  });

  it("uses active builder metadata and Dash Community filenames", () => {
    const profile = BUILD_PROFILES["dash-community"];
    expect(profileArtifacts(profile)).toEqual([
      "dash-community-edition/activity-viewer/Dash_Community_Activity_Viewer.html",
      "dash-community-edition/discovery-scanner/Dash_Community_Discovery_Scanner.html",
      "dash-community-edition/key-derivation/Dash_Community_Key_Derivation_Tool.html",
      "dash-community-edition/psbt-inspector/Dash_Community_PSBT_Multisig_Inspector.html",
    ]);
    const builders = {
      "key-derivation": "apps/key-derivation/scripts/build-key-derivation-html.mjs",
      "activity-viewer": "apps/activity-viewer/scripts/build-activity-viewer-html.mjs",
      "discovery-scanner": "apps/discovery-scanner/scripts/build-discovery-scanner-html.mjs",
    };
    for (const [toolId, buildScript] of Object.entries(builders)) {
      for (const edition of Object.values(BUILD_PROFILES)) {
        const tool = getToolBuild(edition, toolId);
        expect(tool.buildScript).toBe(buildScript);
        // AUD-024-ARC005: composed entries have no inactive app entry-point metadata.
        expect(tool).not.toHaveProperty("entryPoint");
        expect(tool).not.toHaveProperty("workerEntryPoint");
      }
    }
    expect(getToolBuild(profile, "psbt-inspector")).toMatchObject({
      entryPoint: "apps/psbt-inspector/src/app.ts",
      artifactName: "Dash_Community_PSBT_Multisig_Inspector.html",
      buildScript: "apps/psbt-inspector/scripts/build-psbt-inspector-html.mjs",
    });
  });

  it("omits the recovery coin selector only from Dash Community HTML", () => {
    const template = "<main>__RECOVERY_COIN_FIELD__</main>";
    const multi = applyProfileTemplate(
      template,
      BUILD_PROFILES["multi-chain"],
      getToolBuild(BUILD_PROFILES["multi-chain"], "discovery-scanner"),
    );
    const dash = applyProfileTemplate(
      template,
      BUILD_PROFILES["dash-community"],
      getToolBuild(BUILD_PROFILES["dash-community"], "discovery-scanner"),
    );
    expect(multi).toContain('id="recovery-coin"');
    expect(dash).toBe("<main></main>");
  });

  it("keeps the activity coin selector in Multi-Chain with Bitcoin selected", () => {
    const template = "<main>__ACTIVITY_COIN_CONTROL__</main>";
    const multi = applyProfileTemplate(
      template,
      BUILD_PROFILES["multi-chain"],
      getToolBuild(BUILD_PROFILES["multi-chain"], "activity-viewer"),
    );
    const dash = applyProfileTemplate(
      template,
      BUILD_PROFILES["dash-community"],
      getToolBuild(BUILD_PROFILES["dash-community"], "activity-viewer"),
    );
    expect(multi).toContain('id="viewer-coin"');
    expect(multi).toContain('value="bitcoin" selected');
    expect(dash).toBe("<main></main>");
  });

  it("rejects current and future non-Dash modules from Dash build graphs", () => {
    expect(() =>
      assertDashOnlyGraph(
        [
          "packages/coin-protocols/src/coins/registry-base.ts",
          "packages/coin-protocols/src/coins/adapters/dash.ts",
          "packages/coin-protocols/src/coins/dash/core.ts",
          "packages/coin-protocols/src/coins/message-signing.ts",
          "packages/coin-protocols/src/coins/dash/message-signing.ts",
          "apps/discovery-scanner/src/coins/dash-community.ts",
          "apps/discovery-scanner/src/coins/dash/platform-scanner.ts",
          "packages/recovery-backup/src/mnemocode-reencoding.ts",
          "packages/recovery-backup/src/self-test-mnemocode-cards.ts",
          "packages/recovery-backup/src/mnemocode-heirs.ts",
          "packages/recovery-backup/src/sskr-bridge.ts",
          "packages/recovery-mnemocode-wasm/generated/dash-community/key-derivation/mnemocode.wasm",
          "packages/recovery-mnemocode-wasm/generated/multi-chain/discovery-scanner/mnemocode.js",
          "packages/recovery-backup/src/mhfe-input-text.ts",
          "packages/recovery-backup/src/mhfe-repair-choices.ts",
        ],
        "fixture",
      ),
    ).not.toThrow();
    for (const input of [
      "packages/coin-protocols/src/coins/adapters/bitcoin.ts",
      "packages/coin-protocols/src/coins/bitcoin/message-signing.ts",
      "packages/recovery-mnemocode-wasm/generated/multi-chain/key-derivation/mnemocode.wasm",
      "packages/recovery-mnemocode-wasm/generated/future-edition/key-derivation/mnemocode.wasm",
      "packages/coin-protocols/src/coins/adapters/future-coin.ts",
      "packages/coin-protocols/src/coins/future-coin/index.ts",
      "packages/coin-protocols/src/coins/registry.ts",
      "apps/discovery-scanner/src/coins/index.ts",
      "apps/discovery-scanner/src/coins/future-coin/index.ts",
      "packages/public-data-providers/src/multi-chain-service.ts",
      "packages/public-data-providers/src/future-provider.ts",
      "packages/secret-boundary/src/future-network-bridge.ts",
      "packages/network-boundary/src/future-generic-request.ts",
      "packages/secret-vault/src/future-wallet-runtime.ts",
      "packages/wallet-recovery/src/multi-seed-search.ts",
      "packages/wallet-recovery/src/future-coin.ts",
    ]) {
      expect(() => assertDashOnlyGraph([input], "fixture")).toThrow("outside the Dash allowlist");
    }
  });
});

it("admits the three coin-neutral Matcher owners by exact path only", () => {
  for (const name of ["matcher-plan", "matcher-scope", "matcher-secrets"]) {
    const input = `packages/wallet-recovery/src/${name}.ts`;
    expect(() => assertDashOnlyGraph([input], "Matcher")).not.toThrow();
    expect(() => assertDashOnlyGraph([`${input}.backup`], "Matcher")).toThrow(
      "outside the Dash allowlist",
    );
  }
});

it("admits the coin-neutral recovery route while refusing neighbouring unknown paths", () => {
  const input = "packages/wallet-recovery/src/recovery-source.ts";
  expect(() => assertDashOnlyGraph([input], "Recovery source")).not.toThrow();
  for (const outside of [`${input}.backup`, input.replace("source.ts", "source-extra.ts")]) {
    expect(() => assertDashOnlyGraph([outside], "Recovery source")).toThrow(
      "outside the Dash allowlist",
    );
  }
});

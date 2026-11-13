// The modules and known answers that a coin brings to a selective Deriver build: its message
// signers, its startup and full self-tests, and its own page modules (TON's phrase, Cardano's seed
// readers).
import { describe, expect, it } from "vitest";
import { selectedWorkerEntry } from "./key-derivation-composition.mjs";
import {
  applyKeyDerivationFeatureTemplate,
  derivationFeatureModules,
} from "./key-derivation-features.mjs";
import { options } from "./composition-test-helpers.mjs";

describe("coin-owned modules and known answers in selective builds", () => {
  it("selects signing workers from coins rather than visual edition", () => {
    const profile = { id: "multi-chain" };
    const signing = ["message-signing"];
    const dashWorker = selectedWorkerEntry("/workspace", profile, options(["dash"], signing));
    expect(dashWorker).toContain("new MessageSigners([DASH_MESSAGE_SIGNING])");
    expect(dashWorker).not.toContain("bitcoin");
    const bitcoinWorker = selectedWorkerEntry("/workspace", profile, options(["bitcoin"], signing));
    expect(bitcoinWorker).toContain("new MessageSigners([BITCOIN_MESSAGE_SIGNING])");
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
    // Cardano's slower vectors come with Cardano alone.
    expect(selectedWorkerEntry("/workspace", profile, options(["cardano"], []))).toContain(
      "startupSelfTests: [], fullSelfTests: [runCardanoKeyFullSelfTest]",
    );
    expect(both).not.toContain("cardano-key-self-test.ts");
  });

  it("brings the page's TON phrase feature with TON alone, and Cardano's seed readers with Cardano", () => {
    const installers = (coins, features) =>
      derivationFeatureModules(options(coins, features)).map(([, , symbol]) => symbol);
    expect(installers(["ton"], [])).toEqual(["installTonPhraseFeature"]);
    expect(installers(["bitcoin", "ton"], ["mhfe", "bip85"])).toEqual([
      "installBip85Feature",
      "installCheckedMnemonicFeature",
      "installTonPhraseFeature",
    ]);
    expect(installers(["bitcoin", "tron"], ["mhfe"])).toEqual(["installCheckedMnemonicFeature"]);
    // Cardano's phrase seed readers come with Cardano alone, beside TON's phrase.
    expect(installers(["cardano"], [])).toEqual(["phraseSeedReaders"]);
    expect(installers(["ton", "cardano"], [])).toEqual([
      "installTonPhraseFeature",
      "phraseSeedReaders",
    ]);
    expect(installers(["solana"], [])).toEqual([]);
    const template = '<div id="ton-generation"><input id="ton-generation-enabled" /></div>';
    expect(applyKeyDerivationFeatureTemplate(template, options(["ton"]))).toContain(
      "ton-generation-enabled",
    );
    expect(applyKeyDerivationFeatureTemplate(template, options(["tron"]))).not.toContain(
      "ton-generation",
    );
    // The child wallet's note on its one Cardano tab comes with Cardano.
    const child =
      '<section id="bip85-wallet-workspace"><p id="bip85-wallet-cardano-note" data-coin-family-note="cardano" hidden>Cardano has only its Ledger tab here.</p></section>';
    expect(applyKeyDerivationFeatureTemplate(child, options(["cardano"]))).toContain(
      "bip85-wallet-cardano-note",
    );
    expect(applyKeyDerivationFeatureTemplate(child, options(["bitcoin", "ton"]))).toBe(
      '<section id="bip85-wallet-workspace"></section>',
    );
    // So does the Matcher's note on Cardano's roles.
    const matcher = '<p>Payment addresses.<span id="matcher-cardano-note"> For Cardano…</span></p>';
    expect(applyKeyDerivationFeatureTemplate(matcher, options(["cardano"]))).toBe(matcher);
    expect(applyKeyDerivationFeatureTemplate(matcher, options(["dash"]))).toBe(
      "<p>Payment addresses.</p>",
    );
  });
});

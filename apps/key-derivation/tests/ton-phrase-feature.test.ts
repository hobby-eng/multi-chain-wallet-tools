import { describe, expect, it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { GenerateButtons } from "../src/ui/generation-option.js";
import { PhraseGeneration, type WalletCheckOption } from "../src/ui/phrase-generation.js";
import { TonPhraseFeature } from "../src/ui/ton-phrase-feature.js";
import { generationViews } from "./fake-generation-view.js";

class Control extends EventTarget {
  checked = false;
  disabled = false;
  hidden = false;
  textContent = "";
  /**
   * The nodes of an element, one list that changes in place as a page's live NodeList does, and how
   * often they were replaced: each time is read out.
   */
  readonly childNodes: unknown[] = [];
  writes = 0;
  replaceChildren(...nodes: unknown[]): void {
    this.childNodes.splice(0, this.childNodes.length, ...nodes);
    this.writes += 1;
  }
}

/** The words of the mark's line, as the template's nodes stand for them here. */
const MARK_WORDS = ["Not recommended", " with the MHFE wallet check: …"];

// Public test data only: ton-crypto's TON phrase (not BIP39's), "abandon … art" (BIP39's, not
// TON's), a 12-word BIP39 vector, and a synthetic phrase that is both: the BIP39 phrase of the
// entropy SHA-256("wallet-tools TON test 433"), the first of that series to pass TON's check.
const TON_ONLY =
  "hospital stove relief fringe tongue always charge angry urge sentence again match nerve inquiry senior coconut label tumble carry category beauty bean road solution";
const BIP39_ONLY = `${"abandon ".repeat(23)}art`;
const ABOUT = `${"abandon ".repeat(11)}about`;
const BOTH =
  "theme bubble daring setup grass park apart mountain orbit donate mosquito indicate lonely history strategy produce demand rookie demise myth flower length occur carry";
const BIP39_SEED = (phrase: string, passphrase: string) => mnemonicToSeed(phrase, passphrase);

/** A deterministic draw: `misses` phrases that fail TON's check, then the phrase that passes. */
function drawSource(misses: number) {
  let drawn = 0;
  return {
    draw: () => (drawn++ < misses ? BIP39_ONLY : BOTH),
    drawn: () => drawn,
  };
}

/** `onChange` runs after each change of the option, as the page refreshes the others then. */
function setup({ walletCheck = true, draw = drawSource(0).draw, onChange = () => {} } = {}) {
  const ids = [
    "ton-generation-enabled",
    "ton-phrase-note",
    // A build with MHFE has the wallet check's box and the mark of this option beside it.
    ...(walletCheck
      ? ["wallet-check-enabled", "ton-wallet-check-warning", "ton-wallet-check-warning-text"]
      : []),
    ...[12, 15, 18, 21, 24].map((n) => `generate-${n}`),
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new Control()]));
  if (walletCheck) elements["ton-wallet-check-warning-text"]!.childNodes.push(...MARK_WORDS);
  const page = {
    querySelector: (selector: string) => elements[selector.slice(1)] ?? null,
  } as unknown as Document;
  let changes = 0;
  const buttons = new GenerateButtons(
    [12, 15, 18, 21, 24].map(
      (n) => [n, page.querySelector(`#generate-${n}`) as HTMLButtonElement] as const,
    ),
  );
  const feature = new TonPhraseFeature(
    page,
    () => {
      changes += 1;
      onChange();
    },
    buttons,
    draw,
  );
  const element = (id: string) => elements[id] as Control;
  const tick = (id: string, checked: boolean) => {
    element(id).checked = checked;
    element(id).dispatchEvent(new Event("change"));
  };
  const enable = () => {
    buttons.setEnabled(true);
    feature.setEnabled(true);
  };
  return { feature, element, tick, enable, buttons, changes: () => changes };
}

const disabledButtons = (element: (id: string) => Control) =>
  [12, 15, 18, 21, 24].filter((n) => element(`generate-${n}`).disabled);

describe("the TON phrase in Generate & Derive", () => {
  it("notes a TON phrase that is not BIP39's, and one that is both", () => {
    const { feature, element } = setup();
    expect(feature.show(TON_ONLY)).toBe("ton-only");
    expect(element("ton-phrase-note").hidden).toBe(false);
    expect(element("ton-phrase-note").textContent).toMatch(/not a BIP39 phrase.*Telegram wallet/u);
    expect(feature.show(BOTH)).toBe("both");
    expect(element("ton-phrase-note").textContent).toMatch(/also a TON phrase/u);
    expect(feature.show(BIP39_ONLY)).toBe("bip39");
    expect(element("ton-phrase-note").hidden).toBe(true);
    expect(feature.show("hospital stove")).toBe("other");
  });

  it("gives the Telegram wallet the TON entropy and every other variant BIP39's seed", () => {
    const { feature } = setup();
    const telegram = { seedSource: "ton-phrase" as const };
    expect(feature.seedFor(telegram, TON_ONLY, "", BIP39_SEED)).toHaveLength(64);
    expect(feature.seedFor(telegram, BOTH, "", BIP39_SEED)).toHaveLength(64);
    for (const [phrase, passphrase, code] of [
      [BIP39_ONLY, "", "ton.phrase.not-ton"],
      [ABOUT, "", "ton.phrase.not-ton"],
      [BIP39_ONLY, "TREZOR", "ton.phrase.not-ton"],
      [TON_ONLY, "TREZOR", "ton.phrase.passphrase"],
    ] as const)
      expect(() => feature.seedFor(telegram, phrase, passphrase, BIP39_SEED)).toThrow(
        expect.objectContaining({ code }),
      );
    expect(() => feature.seedFor({}, TON_ONLY, "", BIP39_SEED)).toThrow(
      expect.objectContaining({ code: "ton.phrase.ton-only" }),
    );
    expect(feature.seedFor({}, BOTH, "TREZOR", BIP39_SEED)).toEqual(mnemonicToSeed(BOTH, "TREZOR"));
    expect(Object.keys(feature.messages)).toEqual([
      "ton.phrase.not-ton",
      "ton.phrase.ton-only",
      "ton.phrase.passphrase",
    ]);
  });

  it("draws until a phrase passes TON's check, across the page's turns, and counts the draws", async () => {
    const source = drawSource(40);
    const { feature, enable } = setup({ draw: source.draw });
    enable();
    const tried: number[] = [];
    await expect(
      feature.generate(
        () => true,
        (draws) => tried.push(draws),
      ),
    ).resolves.toBe(BOTH);
    expect(source.drawn()).toBe(41);
    expect(tried).toEqual([16, 32, 41]);
  });

  it("draws from the source it is given, such as the chosen-word sampler", async () => {
    const { feature, enable } = setup({ draw: () => BIP39_ONLY });
    enable();
    let drawn = 0;
    const sampler = async () => (++drawn < 3 ? BIP39_ONLY : BOTH);
    await expect(
      feature.generate(
        () => true,
        () => undefined,
        sampler,
      ),
    ).resolves.toBe(BOTH);
    expect(drawn).toBe(3);
  });

  it("is a condition of 8 bits on 24 words, whose own check the page runs again", () => {
    const { feature } = setup();
    expect(feature.condition).toMatchObject({ name: "TON's check", bits: 8, words: 24 });
    expect(feature.condition.passes(BOTH)).toBe(true);
    expect(feature.condition.passes(BIP39_ONLY)).toBe(false);
    expect(feature.condition.passphraseNote).toMatch(/without the BIP39 passphrase/u);
  });

  it("stops before its next draw once it is no longer current, and refuses before the self-test", async () => {
    const source = drawSource(0);
    const { feature, enable } = setup({ draw: source.draw });
    await expect(
      feature.generate(
        () => true,
        () => undefined,
      ),
    ).rejects.toThrow(/self-test/u);
    enable();
    await expect(
      feature.generate(
        () => false,
        () => undefined,
      ),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(source.drawn()).toBe(0);
    // Stop during a draw: the draw ends before its next phrase.
    const slow = drawSource(1_000);
    const stopped = setup({ draw: slow.draw });
    stopped.enable();
    const pending = stopped.feature.generate(
      () => true,
      () => undefined,
    );
    stopped.feature.cancel();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(slow.drawn()).toBe(1);
  });

  it("limits Generate to 24 words and combines with the MHFE wallet check", () => {
    const { feature, element, tick, enable, changes } = setup();
    expect(element("ton-generation-enabled").disabled).toBe(true);
    enable();
    expect(disabledButtons(element)).toEqual([]);
    tick("ton-generation-enabled", true);
    expect(feature.active()).toBe(true);
    expect(changes()).toBe(1);
    expect(disabledButtons(element)).toEqual([12, 15, 18, 21]);
    // Both options may be ticked together.
    tick("wallet-check-enabled", true);
    expect(feature.active()).toBe(true);
    tick("ton-generation-enabled", true);
    expect(element("wallet-check-enabled").checked).toBe(true);
    feature.clear();
    expect(feature.active()).toBe(false);
    expect(disabledButtons(element)).toEqual([]);
    feature.setEnabled(false);
    expect(element("ton-generation-enabled").disabled).toBe(true);
  });

  it("works in a build without the MHFE option", () => {
    const { element, tick, enable } = setup({ walletCheck: false });
    enable();
    tick("ton-generation-enabled", true);
    expect(disabledButtons(element)).toEqual([12, 15, 18, 21]);
  });
});

/**
 * TON's option and the page's generation as the controller composes them. The MHFE wallet check is a
 * stub on its box, since its real draws need MHFE's workers; like the real one, it refreshes the
 * options on every change.
 */
function composed({ walletCheck = true } = {}) {
  let generation: PhraseGeneration | undefined;
  const parts = setup({ walletCheck, onChange: () => generation?.optionsChanged() });
  const { element } = parts;
  const check: WalletCheckOption | undefined = walletCheck
    ? {
        condition: { goal: "passes the check", name: "the check", bits: 16, words: 24 },
        active: () => element("wallet-check-enabled").checked,
        setEnabled: () => undefined,
        clear: () => {
          element("wallet-check-enabled").checked = false;
        },
        cancel: () => undefined,
        generate: async () => BOTH,
        speed: () => undefined,
        onSpeed: () => undefined,
      }
    : undefined;
  const views = generationViews();
  generation = new PhraseGeneration({
    progress: views.generationProgress,
    outlook: views.generationOutlook,
    generateMnemonic: () => ABOUT,
    chosenWords: undefined,
    walletCheck: check,
    ton: parts.feature,
  });
  if (walletCheck)
    element("wallet-check-enabled").addEventListener("change", () => generation?.optionsChanged());
  parts.enable();
  return {
    ...parts,
    generation,
    check,
    row: () => element("ton-wallet-check-warning"),
    line: () => element("ton-wallet-check-warning-text"),
  };
}

describe("the Telegram option's mark beside the MHFE wallet check", () => {
  it("shows only while both options are ticked, in either order", () => {
    for (const [first, second] of [
      ["wallet-check-enabled", "ton-generation-enabled"],
      ["ton-generation-enabled", "wallet-check-enabled"],
    ] as const) {
      const { tick, row, line } = composed();
      // Hidden, the line is empty, so that its words are new to it when the row shows.
      const shown = () => !row().hidden && !line().hidden && line().childNodes.length > 0;
      expect(row().hidden).toBe(true);
      expect(line()).toMatchObject({ hidden: true, childNodes: [] });
      tick(first, true);
      expect(shown()).toBe(false);
      tick(second, true);
      expect(shown()).toBe(true);
      expect(line().childNodes).toEqual(MARK_WORDS);
      // Either one unticked hides it, and ticked again shows it.
      for (const id of [first, second]) {
        tick(id, false);
        expect(row().hidden).toBe(true);
        expect(line()).toMatchObject({ hidden: true, childNodes: [] });
        tick(id, true);
        expect(shown()).toBe(true);
      }
    }
  });

  it("puts its words into its live line once each time it appears, not on every refresh", () => {
    const { tick, line, generation } = composed();
    tick("wallet-check-enabled", true);
    tick("ton-generation-enabled", true);
    const writes = line().writes;
    // A passphrase typed key by key refreshes the options each time: nothing is read out again.
    for (let key = 0; key < 3; key += 1) generation.optionsChanged();
    expect(line().writes).toBe(writes);
    tick("wallet-check-enabled", false);
    tick("wallet-check-enabled", true);
    expect(line().writes).toBe(writes + 2);
    expect(line().childNodes).toEqual(MARK_WORDS);
  });

  it("is hidden after Clear and while the startup checks keep the options closed", () => {
    const { tick, row, feature, check, generation } = composed();
    tick("wallet-check-enabled", true);
    tick("ton-generation-enabled", true);
    // Clear: each option unticks, which hides the mark at once, then generation refreshes.
    check?.clear();
    feature.clear();
    expect(row().hidden).toBe(true);
    generation.reset();
    expect(row().hidden).toBe(true);
    // A self-test that fails closes both options, ticked as they are.
    tick("wallet-check-enabled", true);
    tick("ton-generation-enabled", true);
    expect(row().hidden).toBe(false);
    check?.setEnabled(false);
    feature.setEnabled(false);
    expect(row().hidden).toBe(true);
  });

  it("works without the row in a build without MHFE", () => {
    const { tick, feature } = composed({ walletCheck: false });
    expect(() => tick("ton-generation-enabled", true)).not.toThrow();
    expect(() => feature.markWithWalletCheck(true)).not.toThrow();
    expect(feature.active()).toBe(true);
  });
});

describe("the Generate buttons", () => {
  it("offer no length before the startup checks, and one length while an option limits them", () => {
    const { element, buttons } = setup();
    expect(disabledButtons(element)).toEqual([12, 15, 18, 21, 24]);
    buttons.setEnabled(true);
    buttons.limit("a", 24);
    buttons.limit("b", 24);
    buttons.limit("a", undefined);
    expect(disabledButtons(element)).toEqual([12, 15, 18, 21]);
    buttons.limit("b", undefined);
    expect(disabledButtons(element)).toEqual([]);
  });
});

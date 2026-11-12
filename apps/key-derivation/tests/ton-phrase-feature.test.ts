import { describe, expect, it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { GenerateButtons } from "../src/ui/generation-option.js";
import { TonPhraseFeature } from "../src/ui/ton-phrase-feature.js";

class Control extends EventTarget {
  checked = false;
  disabled = false;
  hidden = false;
  textContent = "";
}

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

function setup({ walletCheck = true, draw = drawSource(0).draw } = {}) {
  const ids = [
    "ton-generation-enabled",
    "ton-phrase-note",
    ...(walletCheck ? ["wallet-check-enabled"] : []),
    ...[12, 15, 18, 21, 24].map((n) => `generate-${n}`),
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new Control()]));
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
    // Both options may be ticked together (owner, 2026-11-11).
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

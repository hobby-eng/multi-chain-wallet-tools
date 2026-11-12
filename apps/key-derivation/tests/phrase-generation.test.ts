import { describe, expect, it, vi } from "vitest";
import type { ChosenWordsRequest } from "@ckd/core/bip39-chosen-words.js";
import type { ChosenWordsFeature } from "../src/ui/chosen-words-feature.js";
import { GenerationOutlook } from "../src/ui/generation-outlook.js";
import type { DrawSpeedState, WorkerPrecheck } from "../src/ui/generation-plan.js";
import { GenerationProgress } from "../src/ui/generation-progress.js";
import {
  PhraseGeneration,
  type TonOption,
  type WalletCheckOption,
} from "../src/ui/phrase-generation.js";

class Control extends EventTarget {
  hidden = true;
  textContent = "";
  readonly classList = { toggle: vi.fn() };
  click(): void {
    this.dispatchEvent(new Event("click"));
  }
}

// Public test data only.
const PLAIN = `${"abandon ".repeat(11)}about`;
const WISHED = `${"abandon ".repeat(23)}art`;
const TON_PHRASE = "a phrase the Telegram wallet accepts";
const CHECKED = "a phrase that passes the wallet check";
const WISHES: ChosenWordsRequest = {
  wordCount: 24,
  chosen: [{ word: "happy", position: 2 }],
  neverUse: [],
};

/** A pending draw of a stubbed option, released or failed by the test. */
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** The three options with stubbed draws and predicates, and the real views on fake elements. */
function setup({ wishes = false, ton = false, check = false } = {}) {
  const progressElements = {
    line: new Control(),
    count: new Control(),
    stop: new Control(),
    error: new Control(),
  };
  const outlookElements = {
    box: new Control(),
    bits: new Control(),
    time: new Control(),
    note: new Control(),
  };
  const chosenWords = {
    active: vi.fn(() => wishes),
    generate: vi.fn(async () => WISHED),
    request: vi.fn((wordCount: number) => ({ ...WISHES, wordCount })),
    setConditioned: vi.fn(),
  };
  const tonCondition: WorkerPrecheck = {
    goal: "the Telegram wallet accepts",
    name: "TON's check",
    bits: 8,
    words: 24,
    passphraseNote: "The Telegram wallet uses this phrase without the BIP39 passphrase.",
    passes: () => true,
  };
  const tonOption = {
    condition: tonCondition,
    active: vi.fn(() => ton),
    setEnabled: vi.fn(),
    clear: vi.fn(),
    cancel: vi.fn(),
    generate: vi.fn(
      async (
        _current: () => boolean,
        onDraws: (draws: number) => void,
        _source?: () => Promise<string>,
      ) => {
        onDraws(256);
        return TON_PHRASE;
      },
    ),
  };
  let speedListener: () => void = () => undefined;
  const checkOption = {
    condition: {
      goal: "passes the MHFE wallet check",
      name: "the MHFE wallet check",
      bits: 16,
      words: 24,
    },
    active: vi.fn(() => check),
    setEnabled: vi.fn(),
    clear: vi.fn(),
    cancel: vi.fn(),
    generate: vi.fn<(...parts: unknown[]) => Promise<string>>(async () => CHECKED),
    speed: vi.fn((): DrawSpeedState | undefined => ({ kind: "measuring", threads: 4 })),
    onSpeed: vi.fn((listener: () => void) => {
      speedListener = listener;
    }),
  };
  const generateMnemonic = vi.fn(() => PLAIN);
  const generation = new PhraseGeneration({
    progress: new GenerationProgress(
      progressElements as unknown as ConstructorParameters<typeof GenerationProgress>[0],
    ),
    outlook: new GenerationOutlook(
      outlookElements as unknown as ConstructorParameters<typeof GenerationOutlook>[0],
    ),
    generateMnemonic,
    chosenWords: chosenWords as unknown as ChosenWordsFeature,
    walletCheck: checkOption as unknown as WalletCheckOption,
    ton: tonOption as unknown as TonOption,
  });
  return {
    generation,
    progressElements,
    outlookElements,
    chosenWords,
    tonOption,
    checkOption,
    generateMnemonic,
    speedChanged: () => speedListener(),
  };
}

/** Every state of {wallet check, TON, chosen words}: which draw runs and what it is given. */
const MATRIX = [
  { wishes: false, ton: false, check: false, words: 12, phrase: PLAIN },
  { wishes: true, ton: false, check: false, words: 12, phrase: WISHED },
  { wishes: false, ton: true, check: false, words: 24, phrase: TON_PHRASE },
  { wishes: true, ton: true, check: false, words: 24, phrase: TON_PHRASE },
  { wishes: false, ton: false, check: true, words: 24, phrase: CHECKED },
  { wishes: true, ton: false, check: true, words: 24, phrase: CHECKED },
  { wishes: false, ton: true, check: true, words: 24, phrase: CHECKED },
  { wishes: true, ton: true, check: true, words: 24, phrase: CHECKED },
] as const;

describe("one press of Generate with any combination of the options", () => {
  it.each(MATRIX)(
    "draws with chosen words $wishes, TON $ton and the wallet check $check",
    async (state) => {
      const parts = setup(state);
      const drawing = parts.generation.draw(state.words, "TREZOR");
      // The start line is there within the click, with Stop for a draw that can last.
      expect(parts.progressElements.line.textContent).toMatch(/^Drawing a new \d+-word phrase/u);
      expect(parts.progressElements.stop.hidden).toBe(!state.ton && !state.check);
      const drawn = await drawing;
      expect(drawn?.phrase).toBe(state.phrase);
      expect(drawn?.keepsPassphrase).toBe(state.check);
      expect(drawn?.forTelegram).toBe(state.ton && !state.check);
      // Exactly one draw runs: the wallet check's workers take TON's check as their precheck.
      expect(parts.checkOption.generate).toHaveBeenCalledTimes(state.check ? 1 : 0);
      expect(parts.tonOption.generate).toHaveBeenCalledTimes(state.ton && !state.check ? 1 : 0);
      if (state.check)
        expect(parts.checkOption.generate).toHaveBeenCalledWith(
          24,
          "TREZOR",
          state.wishes ? WISHES : { wordCount: 24, chosen: [], neverUse: [] },
          state.ton ? parts.tonOption.condition : undefined,
          expect.any(Function),
        );
      if (state.ton && !state.check) {
        const source = parts.tonOption.generate.mock.calls[0]![2];
        // With a chosen word, TON's draw takes its phrases from the chosen-word sampler.
        expect(source === undefined).toBe(!state.wishes);
      }
      expect(parts.chosenWords.generate).toHaveBeenCalledTimes(
        state.wishes && !state.ton && !state.check ? 1 : 0,
      );
      expect(parts.generateMnemonic).toHaveBeenCalledTimes(
        !state.wishes && !state.ton && !state.check ? 1 : 0,
      );
      drawn?.finish(state.check ? "kept" : "none");
      expect(parts.progressElements.line.textContent).toMatch(/^Generated a new \d+-word BIP39/u);
      expect(parts.progressElements.stop.hidden).toBe(true);
    },
  );

  it("passes the chosen-word sampler to TON's draw", async () => {
    const parts = setup({ wishes: true, ton: true });
    await parts.generation.draw(24, "");
    const source = parts.tonOption.generate.mock.calls[0]![2];
    await expect(source!()).resolves.toBe(WISHED);
    expect(parts.chosenWords.generate).toHaveBeenCalledWith(24);
  });

  it("ends a long draw at once on Stop and says so", async () => {
    const parts = setup({ ton: true, check: true });
    const held = pending<string>();
    parts.checkOption.generate.mockImplementation(async (...args: unknown[]) => {
      (args[4] as (draws: number) => void)(4_096);
      return held.promise;
    });
    const drawing = parts.generation.draw(24, "TREZOR");
    await vi.waitFor(() =>
      expect(parts.progressElements.count.textContent).toMatch(/^4,096 tried/u),
    );
    parts.progressElements.stop.click();
    expect(parts.checkOption.cancel).toHaveBeenCalled();
    expect(parts.progressElements.line.textContent).toMatch(
      /^Stopped after 4,096 draws in .*\. No phrase was taken\.$/u,
    );
    // The draw's own AbortError comes later and changes nothing.
    held.reject(Object.assign(new Error("stopped"), { name: "AbortError" }));
    await expect(drawing).resolves.toBeUndefined();
    expect(parts.progressElements.line.textContent).toMatch(/^Stopped after 4,096 draws/u);
  });

  it("shows a refusal next to the buttons, and a changed option dismisses it", async () => {
    const parts = setup({ check: true });
    parts.checkOption.generate.mockRejectedValueOnce(
      new Error("The MHFE wallet check needs a BIP39 passphrase: type it first."),
    );
    await expect(parts.generation.draw(24, "")).resolves.toBeUndefined();
    expect(parts.progressElements.error.textContent).toBe(
      "The MHFE wallet check needs a BIP39 passphrase: type it first.",
    );
    expect(parts.progressElements.line.textContent).toBe("");
    parts.generation.optionsChanged();
    expect(parts.progressElements.error.textContent).toBe("");
  });

  it("stops a draw when an option, the phrase or the passphrase changes, and Clear hides it all", async () => {
    for (const change of ["options", "source", "reset"] as const) {
      const parts = setup({ ton: true });
      const held = pending<string>();
      parts.tonOption.generate.mockImplementationOnce(async () => held.promise);
      const drawing = parts.generation.draw(24, "");
      if (change === "options") parts.generation.optionsChanged();
      else if (change === "source") parts.generation.sourceChanged();
      else parts.generation.reset();
      expect(parts.tonOption.cancel).toHaveBeenCalled();
      held.resolve(TON_PHRASE);
      // A phrase drawn for what changed is never shown.
      await expect(drawing).resolves.toBeUndefined();
      if (change === "reset") expect(parts.progressElements.line.textContent).toBe("");
      else expect(parts.progressElements.line.textContent).toMatch(/^Stopped /u);
    }
    // With no draw running, a typed phrase or passphrase hides the done line.
    const parts = setup();
    (await parts.generation.draw(12, ""))?.finish("none");
    parts.generation.sourceChanged();
    expect(parts.progressElements.line.textContent).toBe("");
  });

  it("keeps the outlook under the options with the bits, the time and the passphrase note", () => {
    const parts = setup();
    parts.generation.optionsChanged();
    expect(parts.outlookElements.box.hidden).toBe(true);
    expect(parts.chosenWords.setConditioned).toHaveBeenLastCalledWith(false);
    expect(parts.checkOption.speed).toHaveBeenLastCalledWith(null);
    parts.tonOption.active.mockReturnValue(true);
    parts.generation.optionsChanged();
    expect(parts.outlookElements.bits.textContent).toMatch(
      /keeps about 248 of its 256 random bits/u,
    );
    expect(parts.outlookElements.time.hidden).toBe(true);
    expect(parts.outlookElements.note.hidden).toBe(true);
    expect(parts.chosenWords.setConditioned).toHaveBeenLastCalledWith(true);
    parts.checkOption.active.mockReturnValue(true);
    parts.chosenWords.active.mockReturnValue(true);
    parts.generation.optionsChanged();
    // The speed is measured with TON's check, never with the chosen words.
    expect(parts.checkOption.speed).toHaveBeenLastCalledWith(true);
    expect(parts.outlookElements.bits.textContent).toMatch(/^Not recommended: .* about 221 /u);
    expect(parts.outlookElements.time.textContent).toBe(
      "Measuring this computer's speed with 4 threads… It can take hours.",
    );
    expect(parts.outlookElements.note.textContent).toMatch(/without the BIP39 passphrase/u);
    // A measurement that ends updates the time.
    parts.checkOption.speed.mockReturnValue({ kind: "measured", threads: 4, drawsPerSecond: 5000 });
    parts.speedChanged();
    expect(parts.outlookElements.time.textContent).toMatch(/^On this computer with 4 threads, /u);
    // Wishes that cannot be met are said in the outlook; the time stays, as it has no words.
    parts.chosenWords.request.mockReturnValue({
      ...WISHES,
      chosen: [{ word: "notaword", position: 2 }],
    });
    parts.generation.optionsChanged();
    expect(parts.outlookElements.bits.textContent).toBe(
      "Chosen word 1 is not an English BIP39 word.",
    );
    expect(parts.outlookElements.time.textContent).toMatch(/^On this computer with 4 threads, /u);
  });
});

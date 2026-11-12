import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The package's WebAssembly is never compiled here: the tests hand the feature a fake engine.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));
import { MhfeError } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import { CheckedMnemonicFeature } from "../src/ui/checked-mnemonic-feature.js";
import { GenerateButtons } from "../src/ui/generation-option.js";
import type { WorkerPrecheck } from "../src/ui/generation-plan.js";
import type { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import type { DrawSpeed, DrawWork, WalletCheckDraw } from "../src/ui/wallet-check-draw.js";

class Control extends EventTarget {
  checked = false;
  disabled = false;
  hidden = false;
  inert = false;
  open = false;
  value = "";
  textContent = "";
  readonly classList = { toggle: vi.fn() };
}

/** A select of the thread choice: its options are plain records. */
class Select extends Control {
  options: { value: string; textContent: string }[] = [];
  readonly ownerDocument = { createElement: () => ({ value: "", textContent: "" }) };
  replaceChildren(...options: { value: string; textContent: string }[]): void {
    this.options = options;
  }
}

// Public test data only: Trezor's all-zero 24-word vector.
const PHRASE = `${"abandon ".repeat(23)}art`;

/** A draw on the Deriver's workers, recorded and held until the test releases it. */
interface FakeRun {
  readonly work: DrawWork;
  readonly passphrase: string;
  readonly stop: ReturnType<typeof vi.fn>;
  release(phrase?: string): void;
  fail(cause: Error): void;
}

/** A measurement of speed, held until the test answers it. */
interface FakeMeasure {
  readonly work: DrawWork;
  readonly milliseconds: number;
  readonly stop: ReturnType<typeof vi.fn>;
  answer(speed: DrawSpeed | undefined): void;
  fail(cause: Error): void;
}

const runs: FakeRun[] = [];
const measures: FakeMeasure[] = [];

/** A fake of the worker boundary (WalletCheckDraw): workers are the edge of the program. */
function createDraw(): WalletCheckDraw {
  let settle: (value: string | DrawSpeed | undefined) => void = () => undefined;
  const stop = vi.fn(() => settle(undefined));
  const draw = {
    stop,
    run(work: DrawWork, passphrase: string, onDraws: (draws: number) => void) {
      onDraws(64);
      return new Promise<string | undefined>((resolve, reject) => {
        settle = resolve as typeof settle;
        runs.push({
          work,
          passphrase,
          stop,
          release: (phrase = PHRASE) => resolve(phrase),
          fail: reject,
        });
      });
    },
    measure(work: DrawWork, milliseconds: number) {
      return new Promise<DrawSpeed | undefined>((resolve, reject) => {
        settle = resolve as typeof settle;
        measures.push({ work, milliseconds, stop, answer: resolve, fail: reject });
      });
    },
  };
  return draw as unknown as WalletCheckDraw;
}

const wishes = {
  wordCount: 24 as const,
  chosen: [{ word: "zoo", position: 24 }],
  neverUse: ["abandon"],
};

/** A precheck as TON's: the page's own final check of a drawn phrase. */
function precheck(passes = true): WorkerPrecheck {
  return {
    goal: "the Telegram wallet accepts",
    name: "TON's check",
    bits: 8,
    words: 24,
    passes: vi.fn(() => passes),
  };
}

/** A stand-in for MHFE's wallet module, which checks the phrase drawn once more. */
function fakeWallet() {
  return { walletCheck: vi.fn(async () => true) };
}

function setup({ passed = true } = {}) {
  const ids = [
    "wallet-check-enabled",
    "wallet-check-options",
    "wallet-check-help",
    "wallet-check-status",
    "passphrase",
    "passphrase-need-kind",
    ...[12, 15, 18, 21, 24].map((n) => `generate-${n}`),
  ];
  const elements: Record<string, Control> = Object.fromEntries(
    ids.map((id) => [id, new Control()]),
  );
  const threads = new Select();
  elements["draw-threads"] = threads;
  const page = {
    querySelector: (selector: string) => elements[selector.slice(1)] ?? null,
  } as unknown as Document;
  const wallet = fakeWallet();
  const report = {
    passed,
    tier: "startup",
    version: "0.6.0",
    buildId: "test",
    components: passed ? [] : [{ id: "wallet-check", label: "Wallet check", outcome: "failed" }],
  };
  const engine = {
    wallet: async () => wallet,
    startupChecks: vi.fn(async () => [{ name: "Wallet", report }]),
    passed: vi.fn(),
  };
  const changed = vi.fn();
  const buttons = new GenerateButtons(
    [12, 15, 18, 21, 24].map(
      (n) => [n, page.querySelector(`#generate-${n}`) as HTMLButtonElement] as const,
    ),
  );
  const feature = new CheckedMnemonicFeature(
    page,
    changed,
    buttons,
    engine as unknown as MhfeEngine,
    createDraw,
  );
  const speeds = vi.fn();
  feature.onSpeed(speeds);
  return { feature, elements, threads, wallet, engine, changed, buttons, speeds };
}

/** Ticks the box, as the person does. */
function tick(elements: Record<string, Control>): void {
  elements["wallet-check-enabled"]!.checked = true;
  elements["wallet-check-enabled"]!.dispatchEvent(new Event("change"));
}

/** Each test's page: eight reported threads, and no draw or measurement left over. */
function isolate(): void {
  beforeEach(() => {
    vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    runs.length = 0;
    measures.length = 0;
  });
}

describe("checked mnemonic page lifecycle", () => {
  isolate();

  it("gates generation and restricts the mode to 24 words", async () => {
    const { feature, elements, wallet, buttons } = setup();
    expect(elements["wallet-check-enabled"]!.disabled).toBe(true);
    await expect(
      feature.generate(24, "TREZOR", wishes, undefined, () => undefined),
    ).rejects.toThrow(/self-test/u);
    // The controller enables the Generate buttons with the option, after the startup checks.
    buttons.setEnabled(true);
    feature.setEnabled(true);
    tick(elements);
    expect(elements["generate-12"]!.disabled).toBe(true);
    expect(elements["generate-24"]!.disabled).toBe(false);
    expect(elements["wallet-check-help"]!.hidden).toBe(false);
    expect(elements["passphrase-need-kind"]!.textContent).toBe("required for MHFE generation");
    expect(feature.condition).toMatchObject({ bits: 16, words: 24 });
    await expect(
      feature.generate(12, "TREZOR", wishes, undefined, () => undefined),
    ).rejects.toThrow(/24-word/u);
    // The check needs the wallet's passphrase, before any draw.
    await expect(feature.generate(24, "", wishes, undefined, () => undefined)).rejects.toThrow(
      /needs a BIP39 passphrase/u,
    );
    expect(runs).toHaveLength(0);
    expect(wallet.walletCheck).not.toHaveBeenCalled();
  });

  it("offers 1 to the reported threads, 2 at first, and 1 to 2 where none are reported", () => {
    const { threads } = setup();
    expect(threads.options.map(({ value }) => value)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);
    expect(threads.value).toBe("2");
    vi.stubGlobal("navigator", { hardwareConcurrency: 1 });
    expect(setup().threads.value).toBe("1");
    vi.stubGlobal("navigator", {});
    const unknown = setup().threads;
    expect(unknown.options).toHaveLength(2);
    expect(unknown.value).toBe("2");
  });

  it("draws on the threads chosen with the page's one passphrase field, and MHFE checks it", async () => {
    const { feature, elements, threads, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    threads.value = "6";
    const tried: number[] = [];
    const result = feature.generate(24, "TREZOR", wishes, undefined, (draws) => tried.push(draws));
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(runs[0]).toMatchObject({
      work: { wishes, ton: false, threads: 6 },
      passphrase: "TREZOR",
    });
    // The draw keeps the threads it started with.
    expect(threads.disabled).toBe(true);
    runs[0]!.release();
    expect(await result).toBe(PHRASE);
    expect(wallet.walletCheck).toHaveBeenCalledWith({ phrase: PHRASE, passphrase: "TREZOR" });
    expect(tried).toEqual([64]);
    expect(threads.disabled).toBe(false);
    expect(runs[0]!.stop).toHaveBeenCalled();
  });

  it("asks the workers for TON's check first and checks TON's condition again before the phrase is given", async () => {
    const { feature, elements, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    const ton = precheck();
    const result = feature.generate(24, "TREZOR", wishes, ton, () => undefined);
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(runs[0]!.work.ton).toBe(true);
    runs[0]!.release();
    expect(await result).toBe(PHRASE);
    expect(wallet.walletCheck).toHaveBeenCalledOnce();
    expect(ton.passes).toHaveBeenCalledWith(PHRASE);
    // A phrase that TON's own check refuses is never given.
    const refused = feature.generate(24, "TREZOR", wishes, precheck(false), () => undefined);
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    runs[1]!.release();
    await expect(refused).rejects.toThrow("The generated phrase failed TON's check.");
  });

  it("refuses a phrase that MHFE's own check does not pass again", async () => {
    const { feature, elements, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    wallet.walletCheck.mockResolvedValueOnce(false);
    const result = feature.generate(24, "TREZOR", wishes, undefined, () => undefined);
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    runs[0]!.release();
    await expect(result).rejects.toThrow(/failed its MHFE wallet check/u);
  });

  it("shows MHFE's refusal as a sentence", async () => {
    const { feature, elements, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    wallet.walletCheck.mockRejectedValueOnce(
      new MhfeError("WALLET_CHECK_NEEDS_PASSPHRASE", "The wallet check needs a passphrase"),
    );
    const result = feature.generate(24, "TREZOR", wishes, undefined, () => undefined);
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    runs[0]!.release();
    await expect(result).rejects.toThrow(/^The wallet check needs a passphrase\./u);
  });

  it("stops a draw when the passphrase changes, on Clear and on a cancel", async () => {
    for (const stop of ["passphrase", "clear", "cancel"] as const) {
      const { feature, elements } = setup();
      feature.setEnabled(true);
      tick(elements);
      const result = feature.generate(24, "TREZOR", wishes, undefined, () => undefined);
      const failure = expect(result).rejects.toMatchObject({ name: "AbortError" });
      await vi.waitFor(() => expect(runs).toHaveLength(1));
      if (stop === "passphrase") {
        elements["passphrase"]!.dispatchEvent(new Event("input"));
      } else if (stop === "clear") feature.clear();
      else feature.cancel();
      await failure;
      expect(runs[0]!.stop).toHaveBeenCalled();
      runs.length = 0;
    }
  });

  it("stops before the draw when cancelled while MHFE prepares", async () => {
    const { feature, elements, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    const result = feature.generate(24, "TREZOR", wishes, undefined, () => undefined);
    feature.cancel();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(runs).toHaveLength(0);
    expect(wallet.walletCheck).not.toHaveBeenCalled();
  });
});

describe("the wallet check's speed and its quick check", () => {
  isolate();

  it("measures the speed after a pause, without chosen words, once per threads and TON", async () => {
    vi.useFakeTimers();
    const { feature, elements, threads, speeds } = setup();
    const noWishes = { wordCount: 24, chosen: [], neverUse: [] };
    // Nothing is measured before the option is ticked.
    expect(feature.speed(false)).toBeUndefined();
    feature.setEnabled(true);
    tick(elements);
    expect(feature.speed(true)).toEqual({ kind: "measuring", threads: 2 });
    expect(measures).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(measures).toHaveLength(1);
    // The person's chosen words never reach a measurement.
    expect(measures[0]).toMatchObject({
      work: { wishes: noWishes, ton: true, threads: 2 },
      milliseconds: 1000,
    });
    measures[0]!.answer({ drawsPerSecond: 4096 });
    await vi.advanceTimersByTimeAsync(0);
    expect(speeds).toHaveBeenCalledOnce();
    expect(feature.speed(true)).toEqual({ kind: "measured", threads: 2, drawsPerSecond: 4096 });
    // The same threads and TON are not measured again; other threads are.
    threads.value = "3";
    threads.dispatchEvent(new Event("change"));
    expect(speeds).toHaveBeenCalledTimes(2);
    expect(feature.speed(true)).toEqual({ kind: "measuring", threads: 3 });
    await vi.advanceTimersByTimeAsync(500);
    measures[1]!.fail(new Error("A worker failed."));
    await vi.advanceTimersByTimeAsync(0);
    expect(feature.speed(true)).toEqual({ kind: "failed" });
    // A draw stops a measurement under way, and none starts while it runs.
    expect(feature.speed(false)).toEqual({ kind: "measuring", threads: 3 });
    await vi.advanceTimersByTimeAsync(500);
    const result = feature.generate(24, "TREZOR", wishes, undefined, () => undefined);
    expect(measures[2]!.stop).toHaveBeenCalled();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(feature.speed(false)).toBeUndefined();
    runs[0]!.release();
    await result;
    // Null, as for an option unticked, stops measuring.
    feature.speed(false);
    expect(feature.speed(null)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(500);
    expect(measures).toHaveLength(3);
  });

  it("offers another quick check after WORKER_FAILED instead of closing the mode (AUD-026-API002)", async () => {
    const { feature, elements, engine } = setup();
    engine.startupChecks.mockRejectedValueOnce(new MhfeError("WORKER_FAILED", "Worker stopped"));
    feature.setEnabled(true);
    tick(elements);
    await vi.waitFor(() => expect(elements["wallet-check-enabled"]!.checked).toBe(false));
    expect(elements["wallet-check-enabled"]!.disabled).toBe(false);
    tick(elements);
    await vi.waitFor(() =>
      expect(elements["wallet-check-status"]!.textContent).not.toContain("Worker stopped"),
    );
    const result = feature.generate(24, "TREZOR", wishes, undefined, () => undefined);
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    runs[0]!.release();
    expect(await result).toBe(PHRASE);
    expect(engine.startupChecks).toHaveBeenCalledTimes(2);
  });

  it("closes the mode for good when MHFE fails its quick check", async () => {
    const { feature, elements, wallet } = setup({ passed: false });
    feature.setEnabled(true);
    tick(elements);
    await vi.waitFor(() => expect(elements["wallet-check-enabled"]!.disabled).toBe(true));
    expect(elements["wallet-check-enabled"]!.checked).toBe(false);
    expect(elements["wallet-check-status"]!.textContent).toMatch(/^MHFE failed its self-check/u);
    await expect(
      feature.generate(24, "TREZOR", wishes, undefined, () => undefined),
    ).rejects.toThrow(/self-check/u);
    expect(runs).toHaveLength(0);
    expect(wallet.walletCheck).not.toHaveBeenCalled();
  });
});

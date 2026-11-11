import { afterEach, describe, expect, it, vi } from "vitest";

// The package's WebAssembly is never compiled here: the tests hand the feature a fake engine.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));
import { MhfeError } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import { CheckedMnemonicFeature } from "../src/ui/checked-mnemonic-feature.js";
import { GenerateButtons } from "../src/ui/generation-option.js";
import type { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";

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

// Public test data only: Trezor's all-zero 24-word vector.
const { PHRASE, draws } = vi.hoisted(() => ({
  PHRASE: `${"abandon ".repeat(23)}art`,
  draws: [] as FakeDraw[],
}));

/** A stand-in for the Deriver's draw on workers: every call is recorded, and it waits to be released. */
interface FakeDraw {
  readonly wishes: unknown;
  readonly passphrase: string;
  readonly stop: ReturnType<typeof vi.fn>;
  release(phrase?: string): void;
  fail(cause: Error): void;
}

vi.mock("../src/ui/wallet-check-draw.js", () => ({
  WalletCheckDraw: class {
    #settle: (phrase: string | undefined) => void = () => undefined;
    #reject: (cause: Error) => void = () => undefined;
    readonly stop = vi.fn(() => this.#settle(undefined));
    run(wishes: unknown, passphrase: string, onDraws: (draws: number) => void) {
      onDraws(64);
      draws.push({
        wishes,
        passphrase,
        stop: this.stop,
        release: (phrase = PHRASE) => this.#settle(phrase),
        fail: (cause) => this.#reject(cause),
      });
      return new Promise<string | undefined>((resolve, reject) => {
        this.#settle = resolve;
        this.#reject = reject;
      });
    }
  },
}));

const wishes = {
  wordCount: 24 as const,
  chosen: [{ word: "zoo", position: 24 }],
  neverUse: ["abandon"],
};

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
    "wallet-check-outlook",
    "wallet-check-cancel",
    "passphrase",
    "passphrase-need-kind",
    ...[12, 15, 18, 21, 24].map((n) => `generate-${n}`),
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new Control()]));
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
  );
  return { feature, elements, wallet, engine, changed, buttons };
}

/** Ticks the box, as the person does. */
function tick(elements: Record<string, Control>): void {
  elements["wallet-check-enabled"]!.checked = true;
  elements["wallet-check-enabled"]!.dispatchEvent(new Event("change"));
}

describe("checked mnemonic page lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    draws.length = 0;
  });

  it("gates generation and restricts the mode to 24 words", async () => {
    const { feature, elements, wallet, buttons } = setup();
    expect(elements["wallet-check-enabled"]!.disabled).toBe(true);
    await expect(feature.generate(24, "TREZOR", wishes, () => undefined)).rejects.toThrow(
      /self-test/u,
    );
    // The controller enables the Generate buttons with the option, after the startup checks.
    buttons.setEnabled(true);
    feature.setEnabled(true);
    tick(elements);
    expect(elements["generate-12"]!.disabled).toBe(true);
    expect(elements["generate-24"]!.disabled).toBe(false);
    expect(elements["wallet-check-help"]!.hidden).toBe(false);
    expect(elements["passphrase-need-kind"]!.textContent).toBe("required for MHFE generation");
    await expect(feature.generate(12, "TREZOR", wishes, () => undefined)).rejects.toThrow(
      /24-word/u,
    );
    // The check needs the wallet's passphrase, before any draw.
    await expect(feature.generate(24, "", wishes, () => undefined)).rejects.toThrow(
      /needs a BIP39 passphrase/u,
    );
    expect(draws).toHaveLength(0);
    expect(wallet.walletCheck).not.toHaveBeenCalled();
  });

  it("states what the wishes keep with the check, as MHFE rated them", () => {
    const { feature, elements } = setup();
    feature.setEnabled(true);
    tick(elements);
    expect(elements["wallet-check-outlook"]!.textContent).toBe(
      "The phrase keeps about 240 of its 256 random bits: still far more than enough.",
    );
    feature.showWishes(() => wishes);
    expect(elements["wallet-check-outlook"]!.textContent).toMatch(
      /^Not recommended: the phrase keeps about 228 of its 256 random bits, fewer than 240\. A word anywhere/u,
    );
    feature.clear();
    expect(elements["wallet-check-outlook"]!.hidden).toBe(true);
  });

  it("draws on the Deriver's workers with the page's one passphrase field, and MHFE checks it", async () => {
    const { feature, elements, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    const lines: string[] = [];
    const result = feature.generate(24, "TREZOR", wishes, (line) => lines.push(line));
    await vi.waitFor(() => expect(draws).toHaveLength(1));
    expect(elements["wallet-check-cancel"]!.hidden).toBe(false);
    expect(draws[0]).toMatchObject({ wishes, passphrase: "TREZOR" });
    draws[0]!.release();
    expect(await result).toBe(PHRASE);
    expect(wallet.walletCheck).toHaveBeenCalledWith({ phrase: PHRASE, passphrase: "TREZOR" });
    expect(lines[0]).toBe("Drawing a phrase that passes the check, about 65,536 draws.");
    // The average time at the speed so far, for the 65,536 draws a passing phrase takes.
    expect(lines[1]).toMatch(
      /^Drawing a phrase that passes the check · 64 tried · .* elapsed · about .* on average at this speed$/u,
    );
    expect(elements["wallet-check-cancel"]!.hidden).toBe(true);
    expect(draws[0]!.stop).toHaveBeenCalled();
  });

  it("refuses a phrase that MHFE's own check does not pass again", async () => {
    const { feature, elements, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    wallet.walletCheck.mockResolvedValueOnce(false);
    const result = feature.generate(24, "TREZOR", wishes, () => undefined);
    await vi.waitFor(() => expect(draws).toHaveLength(1));
    draws[0]!.release();
    await expect(result).rejects.toThrow(/failed its MHFE wallet check/u);
  });

  it("shows MHFE's refusal as a sentence", async () => {
    const { feature, elements, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    wallet.walletCheck.mockRejectedValueOnce(
      new MhfeError("WALLET_CHECK_NEEDS_PASSPHRASE", "The wallet check needs a passphrase"),
    );
    const result = feature.generate(24, "TREZOR", wishes, () => undefined);
    await vi.waitFor(() => expect(draws).toHaveLength(1));
    draws[0]!.release();
    await expect(result).rejects.toThrow(/^The wallet check needs a passphrase\./u);
  });

  it("stops a draw when the passphrase changes, on Clear and on a cancel", async () => {
    for (const stop of ["passphrase", "clear", "cancel"] as const) {
      const { feature, elements } = setup();
      feature.setEnabled(true);
      tick(elements);
      const result = feature.generate(24, "TREZOR", wishes, () => undefined);
      const failure = expect(result).rejects.toMatchObject({ name: "AbortError" });
      await vi.waitFor(() => expect(draws).toHaveLength(1));
      if (stop === "passphrase") {
        elements["passphrase"]!.dispatchEvent(new Event("input"));
      } else if (stop === "clear") feature.clear();
      else feature.cancel();
      await failure;
      expect(draws[0]!.stop).toHaveBeenCalled();
      draws.length = 0;
    }
  });

  it("stops before the draw when cancelled while MHFE prepares", async () => {
    const { feature, elements, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    const result = feature.generate(24, "TREZOR", wishes, () => undefined);
    feature.cancel();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(draws).toHaveLength(0);
    expect(wallet.walletCheck).not.toHaveBeenCalled();
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
    const result = feature.generate(24, "TREZOR", wishes, () => undefined);
    await vi.waitFor(() => expect(draws).toHaveLength(1));
    draws[0]!.release();
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
    await expect(feature.generate(24, "TREZOR", wishes, () => undefined)).rejects.toThrow(
      /self-check/u,
    );
    expect(draws).toHaveLength(0);
    expect(wallet.walletCheck).not.toHaveBeenCalled();
  });
});

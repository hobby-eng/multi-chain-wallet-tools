import { afterEach, describe, expect, it, vi } from "vitest";

// The package's WebAssembly is never compiled here: the tests hand the feature a fake engine.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));
import { MhfeCancelledError, MhfeError } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import { CheckedMnemonicFeature } from "../src/ui/checked-mnemonic-feature.js";
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
const PHRASE = `${"abandon ".repeat(23)}art`;
const wishes = {
  wordCount: 24 as const,
  chosen: [{ word: "zoo", position: 24 }],
  neverUse: ["abandon"],
};

/** A stand-in for MHFE's wallet module: every call is recorded, and a draw waits to be released. */
function fakeWallet() {
  let release: (phrase: string) => void = () => undefined;
  let fail: (cause: Error) => void = () => undefined;
  return {
    release: (phrase = PHRASE) => release(phrase),
    fail: (cause: Error) => fail(cause),
    describeDraw: vi.fn(async () => ({
      randomBits: 229,
      randomness: "notRecommended" as const,
      expectedDraws: 65_536,
      recognisable: true,
    })),
    drawPhrase: vi.fn(
      (options: { onProgress?: (progress: { stage: "draw"; draws: number }) => void }) =>
        new Promise((resolve, reject) => {
          options.onProgress?.({ stage: "draw", draws: 64 });
          release = (phrase) =>
            resolve({
              phrase,
              words: 24,
              walletCheck: true,
              fingerprintWithPassphrase: "",
              workers: 2,
            });
          fail = reject;
        }),
    ),
    walletCheck: vi.fn(async () => true),
  };
}

function setup({ passed = true } = {}) {
  const ids = [
    "wallet-check-enabled",
    "wallet-check-options",
    "wallet-check-help",
    "wallet-check-status",
    "wallet-check-outlook",
    "wallet-check-passphrase-repeat",
    "wallet-check-cancel",
    "passphrase",
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
    components: passed
      ? []
      : [{ id: "word-wishes", label: "Chosen word of a new phrase", outcome: "failed" }],
  };
  const engine = {
    wallet: async () => wallet,
    walletParameters: async () => ({ recommendedRandomBits: 240 }),
    startupChecks: vi.fn(async () => [{ name: "Wallet", report }]),
    passed: vi.fn(),
    cancelDraw: vi.fn(() => wallet.fail(new MhfeCancelledError())),
  };
  const changed = vi.fn();
  const feature = new CheckedMnemonicFeature(page, changed, engine as unknown as MhfeEngine);
  return { feature, elements, wallet, engine, changed };
}

/** Ticks the box, as the person does. */
function tick(elements: Record<string, Control>): void {
  elements["wallet-check-enabled"]!.checked = true;
  elements["wallet-check-enabled"]!.dispatchEvent(new Event("change"));
}

describe("checked mnemonic page lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gates generation and restricts the mode to 24 words", async () => {
    const { feature, elements, wallet } = setup();
    expect(elements["wallet-check-enabled"]!.disabled).toBe(true);
    await expect(feature.generate(24, "TREZOR", wishes, () => undefined)).rejects.toThrow(
      /self-test/u,
    );
    feature.setEnabled(true);
    tick(elements);
    expect(elements["generate-12"]!.disabled).toBe(true);
    expect(elements["generate-24"]!.disabled).toBe(false);
    expect(elements["wallet-check-help"]!.hidden).toBe(false);
    await expect(feature.generate(12, "TREZOR", wishes, () => undefined)).rejects.toThrow(
      /24-word/u,
    );
    expect(wallet.drawPhrase).not.toHaveBeenCalled();
  });

  it("states what the wishes keep, as MHFE rates them with the check", async () => {
    const { feature, elements, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    feature.showWishes(() => wishes);
    await vi.waitFor(() =>
      expect(elements["wallet-check-outlook"]!.textContent).toMatch(/^Not recommended: .* 229 /u),
    );
    expect(wallet.describeDraw).toHaveBeenLastCalledWith({
      chosen: wishes.chosen,
      neverUse: wishes.neverUse,
      walletCheck: true,
    });
  });

  it("draws through MHFE with the confirmed passphrase and reads the phrase back", async () => {
    const { feature, elements, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    elements["wallet-check-passphrase-repeat"]!.value = "TREZOR";
    const lines: string[] = [];
    const result = feature.generate(24, "TREZOR", wishes, (line) => lines.push(line));
    await vi.waitFor(() => expect(wallet.drawPhrase).toHaveBeenCalled());
    expect(elements["wallet-check-cancel"]!.hidden).toBe(false);
    expect(wallet.drawPhrase).toHaveBeenCalledWith(
      expect.objectContaining({
        passphrase: "TREZOR",
        passphraseRepeat: "TREZOR",
        walletCheck: true,
        chosen: wishes.chosen,
        neverUse: wishes.neverUse,
      }),
    );
    wallet.release();
    expect(await result).toBe(PHRASE);
    expect(wallet.walletCheck).toHaveBeenCalledWith({ phrase: PHRASE, passphrase: "TREZOR" });
    expect(lines[0]).toBe("Drawing a phrase that passes the check, about 65,536 draws.");
    expect(lines[1]).toMatch(/^Drawing a phrase that passes the check · 64 tried · /u);
    expect(elements["wallet-check-cancel"]!.hidden).toBe(true);
  });

  it("refuses a phrase that MHFE's own check does not pass again", async () => {
    const { feature, elements, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    wallet.walletCheck.mockResolvedValueOnce(false);
    const result = feature.generate(24, "TREZOR", wishes, () => undefined);
    await vi.waitFor(() => expect(wallet.drawPhrase).toHaveBeenCalled());
    wallet.release();
    await expect(result).rejects.toThrow(/failed its MHFE wallet check/u);
  });

  it("shows MHFE's refusal as a sentence", async () => {
    const { feature, elements, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    const result = feature.generate(24, "TREZOR", wishes, () => undefined);
    await vi.waitFor(() => expect(wallet.drawPhrase).toHaveBeenCalled());
    wallet.fail(new MhfeError("PASSPHRASES_DIFFER", "The passphrase and its repetition differ"));
    await expect(result).rejects.toThrow("The passphrase and its repetition differ.");
  });

  it("stops a draw when the passphrase changes, on Clear and on a cancel", async () => {
    for (const stop of ["passphrase", "clear", "cancel"] as const) {
      const { feature, elements, wallet, engine } = setup();
      feature.setEnabled(true);
      tick(elements);
      elements["wallet-check-passphrase-repeat"]!.value = "TREZOR";
      const result = feature.generate(24, "TREZOR", wishes, () => undefined);
      const failure = expect(result).rejects.toMatchObject({ name: "AbortError" });
      await vi.waitFor(() => expect(wallet.drawPhrase).toHaveBeenCalled());
      if (stop === "passphrase") {
        elements["passphrase"]!.dispatchEvent(new Event("input"));
        expect(elements["wallet-check-passphrase-repeat"]!.value).toBe("");
      } else if (stop === "clear") feature.clear();
      else feature.cancel();
      await failure;
      expect(engine.cancelDraw).toHaveBeenCalledOnce();
    }
  });

  it("stops before the draw when cancelled while MHFE prepares", async () => {
    const { feature, elements, wallet } = setup();
    feature.setEnabled(true);
    tick(elements);
    const result = feature.generate(24, "TREZOR", wishes, () => undefined);
    feature.cancel();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(wallet.drawPhrase).not.toHaveBeenCalled();
  });

  it("offers another quick check after WORKER_FAILED instead of closing the mode (AUD-026-API002)", async () => {
    const { feature, elements, wallet, engine } = setup();
    engine.startupChecks.mockRejectedValueOnce(new MhfeError("WORKER_FAILED", "Worker stopped"));
    feature.setEnabled(true);
    tick(elements);
    await vi.waitFor(() => expect(elements["wallet-check-enabled"]!.checked).toBe(false));
    expect(elements["wallet-check-enabled"]!.disabled).toBe(false);
    tick(elements);
    await vi.waitFor(() =>
      expect(elements["wallet-check-status"]!.textContent).not.toContain("Worker stopped"),
    );
    const result = feature.generate(24, "", wishes, () => undefined);
    await vi.waitFor(() => expect(wallet.drawPhrase).toHaveBeenCalled());
    wallet.release();
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
    expect(wallet.drawPhrase).not.toHaveBeenCalled();
  });
});

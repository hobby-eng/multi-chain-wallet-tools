// The controller's seeds of the variants whose seed is not BIP39's: a phrase seed source read by the
// build's reader (Cardano's CIP-3 roots), a refusal where the build has no reader, and a BIP85
// child wallet that offers only the variants of BIP39's seed. Synthetic seeds; no wallet data.
import { afterEach, describe, expect, it, vi } from "vitest";
import { controllerHarness, settle, streamHarness, streamResult } from "./controller-harness.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PHRASE = `${"abandon ".repeat(11)}about`;

/** A variant whose seed is the root of the phrase seed source "cardano-icarus". */
const ICARUS = {
  id: "cardano",
  label: "Cardano Icarus",
  variantLabel: "Icarus",
  seedSource: "cardano-icarus",
  batchSize: 2,
  defaults: { network: "mainnet", account: 0, branch: 0, start: 0, count: 6 },
};

describe("Key Derivation seed sources", () => {
  it("reads a variant's seed from its phrase seed reader, not from BIP39's seed", async () => {
    const root = new Uint8Array(96).fill(5);
    const reader = vi.fn(() => root);
    const mnemonicToSeed = vi.fn(() => new Uint8Array(64).fill(7));
    const { view, form, createWorker } = await streamHarness({
      getDefaultCoinAdapter: () => ICARUS,
      getCoinAdapter: () => ICARUS,
      mnemonicToSeed,
      phraseSeedReaders: { "cardano-icarus": reader },
    });
    view.mnemonic.value = PHRASE;
    (view.passphrase as unknown as { value: string }).value = "TREZOR";
    const derive = vi.fn(async (_adapter: unknown, input: { start: number }) =>
      streamResult(input.start),
    );
    createWorker.mockReturnValue({ ready: async () => undefined, derive, terminate: vi.fn() });
    form.submit();
    await vi.waitFor(() => expect(derive).toHaveBeenCalled());
    expect(reader).toHaveBeenCalledWith(PHRASE, "TREZOR");
    expect(mnemonicToSeed).not.toHaveBeenCalled();
    // The root is the seed's: it is wiped once the derivation ends.
    await vi.waitFor(() => expect(root.every((byte) => byte === 0)).toBe(true));
  });

  it("refuses a seed source that the build has no reader of, before any worker derives", async () => {
    const mnemonicToSeed = vi.fn(() => new Uint8Array(64).fill(7));
    const { view, form, createWorker } = await streamHarness({
      getDefaultCoinAdapter: () => ICARUS,
      getCoinAdapter: () => ICARUS,
      mnemonicToSeed,
    });
    view.mnemonic.value = PHRASE;
    const derive = vi.fn();
    createWorker.mockReturnValue({ ready: async () => undefined, derive, terminate: vi.fn() });
    form.submit();
    await settle();
    expect(derive).not.toHaveBeenCalled();
    expect(mnemonicToSeed).not.toHaveBeenCalled();
    expect(view.showError).toHaveBeenCalled();
  });

  it("offers a BIP85 child wallet the variants of BIP39's seed only, and their default", () => {
    const ledger = { id: "cardano-ledger", label: "Cardano Ledger", variantLabel: "Ledger" };
    const icarus = { ...ICARUS, defaultVariant: true };
    const install = vi.fn(() => ({
      invalidate: vi.fn(),
      reset: vi.fn(),
      setEnabled: vi.fn(),
      setSecretsVisible: vi.fn(),
    }));
    controllerHarness({
      coinFamilies: [{ id: "cardano", label: "Cardano", adapters: [icarus, ledger] }],
      getAdapterFamilyId: () => "cardano",
      getCoinAdapter: (id: string) => [icarus, ledger].find((adapter) => adapter.id === id),
      getDefaultCoinAdapter: () => icarus,
      installBip85Feature: install,
    });
    const options = (install.mock.calls[0] as unknown[] | undefined)?.[0] as {
      coinFamilies: { adapters: { id: string }[] }[];
      getDefaultCoinAdapter(id: string): { id: string };
    };
    expect(options.coinFamilies.map(({ adapters }) => adapters.map(({ id }) => id))).toEqual([
      ["cardano-ledger"],
    ]);
    expect(options.getDefaultCoinAdapter("cardano").id).toBe("cardano-ledger");
  });
});

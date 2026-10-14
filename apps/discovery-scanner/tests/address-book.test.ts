import { describe, expect, it, vi } from "vitest";
import { AddressBook, AddressFindings, scanBranch } from "../src/address-book.js";
import { ScanSecrets } from "../src/scan-secrets.js";
import { SeedScanSecrets } from "../src/seed-scan-secrets.js";
import type { RecoveryFinding } from "../src/types.js";

// The parts every coin's scan is built from: the address book (each address asked and counted
// once, the gap after a used one), the findings (one per address) and the scan's secrets.

interface FakeState {
  readonly balance: bigint;
  readonly used: boolean;
}

function bookOf(states: Record<string, FakeState>) {
  const lookUp = vi.fn(async (addresses: readonly string[]) =>
    addresses.map((address) => states[address]!),
  );
  const book = new AddressBook<FakeState>({
    lookUp,
    balance: (state) => state.balance,
    used: (state) => state.used,
    key: (address) => address.toLowerCase(),
  });
  return { book, lookUp };
}

describe("the address book of a scan section", () => {
  it("asks for each address once, counts it once and shows funded and asked-for used ones", async () => {
    const { book, lookUp } = bookOf({
      a: { balance: 5n, used: true },
      b: { balance: 0n, used: true },
      c: { balance: 0n, used: false },
    });
    const chunk = [
      { address: "a", index: 0 },
      { address: "b", index: 1 },
      { address: "c", index: 2 },
    ];
    const first = await book.batch(chunk, 3, { includeUsedZeroBalance: false });
    // A used address at index 1 keeps a 20-address gap after it.
    expect(first.target).toBe(22);
    expect(first.shown.map(({ derived }) => derived.address)).toEqual(["a"]);
    const again = await book.batch([{ address: "A", index: 0 }, ...chunk.slice(1)], 3, {
      includeUsedZeroBalance: true,
    });
    expect(again.shown.map(({ derived }) => derived.address)).toEqual(["A", "b"]);
    expect(lookUp).toHaveBeenCalledOnce();
    expect([book.balance, book.funded, book.used, book.queried]).toEqual([5n, 1, 2, 3]);
    expect(book.metrics((amount) => `${amount} units`)[2]).toEqual({
      label: "Previously used · empty",
      value: "1",
    });
  });

  it("keeps a target below a profile's maximum and reports a cut gap", async () => {
    const { book } = bookOf({ z: { balance: 0n, used: true } });
    const capped = await book.batch([{ address: "z", index: 4 }], 5, {
      includeUsedZeroBalance: false,
      maximum: 10,
    });
    expect(capped.target).toBe(10);
    expect(book.gap.truncated).toBe(true);
    expect(book.gap.warning).toMatch(/profile's maximum/u);
    await book.batch([{ address: "z", index: 2 ** 31 - 1 }], 1, { includeUsedZeroBalance: false });
    expect(book.gap.warning).toMatch(/20-address post-use gap/u);
  });

  it("refuses a provider answer that drops an address", async () => {
    const book = new AddressBook<FakeState>({
      lookUp: async () => [],
      balance: (state) => state.balance,
      used: (state) => state.used,
    });
    await expect(
      book.batch([{ address: "a", index: 0 }], 1, { includeUsedZeroBalance: false }),
    ).rejects.toThrow(/result count/u);
  });
});

describe("the scan of one branch", () => {
  it("goes on in batches until the gap after the last used address is checked", async () => {
    const usedAt = new Set([3]);
    const progress: Array<[number, number]> = [];
    const shown: number[] = [];
    const checked = await scanBranch({
      initial: 5,
      batchSize: 10,
      signal: new AbortController().signal,
      cancelled: "Test scan cancelled.",
      derive: (index) => index,
      lookUp: async (chunk, target) => {
        const used = chunk.filter((index) => usedAt.has(index));
        return { target: Math.max(target, ...used.map((index) => index + 21)), shown: used };
      },
      show: (index) => shown.push(index),
      progress: (done, target) => progress.push([done, target]),
    });
    expect(checked).toBe(24);
    expect(shown).toEqual([3]);
    expect(progress).toEqual([
      [5, 24],
      [15, 24],
      [24, 24],
    ]);
  });

  it("stops between batches once cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      scanBranch({
        initial: 1,
        batchSize: 1,
        signal: controller.signal,
        cancelled: "Test scan cancelled.",
        derive: (index) => index,
        lookUp: async () => ({ target: 1, shown: [] }),
        show: () => {},
        progress: () => {},
      }),
    ).rejects.toThrow("Test scan cancelled.");
  });
});

describe("the findings of a scan section", () => {
  it("shows an address once and gives it the paths that reach it again", () => {
    const shown: RecoveryFinding[] = [];
    const findings = new AddressFindings((finding) => shown.push(finding));
    const finding = (): RecoveryFinding => ({
      id: "a",
      title: "a",
      subtitle: "",
      balanceAtomic: 1n,
      balanceLabel: "1",
      fields: [{ label: "Derivation path", value: "m/0" }],
    });
    findings.show("a", "m/0", finding);
    findings.show("a", "m/1", finding);
    findings.show("a", "m/1", finding);
    expect(shown).toHaveLength(1);
    expect(findings.list[0]!.fields.map(({ value }) => value)).toEqual(["m/0", "m/1"]);
  });
});

describe("the secrets of a scan", () => {
  const PHRASE = `${"abandon ".repeat(11)}about`;

  it("registers the phrase, its passphrase and seed with both guards and wipes the seed", () => {
    const session = { registerString: vi.fn(), registerBytes: vi.fn() };
    const secrets = new SeedScanSecrets({ sessionSecretGuard: session as never });
    const seed = secrets.seed({ mnemonic: PHRASE, passphrase: "TREZOR" });
    expect(() => secrets.guard.assertPublic({ text: PHRASE }, "test")).toThrow(/BIP39 mnemonic/u);
    expect(session.registerString).toHaveBeenCalledWith("BIP39 passphrase", "TREZOR");
    expect(session.registerBytes).toHaveBeenCalledWith("BIP39 seed", seed);
    secrets.close();
    expect(seed.every((byte) => byte === 0)).toBe(true);
    expect(() => secrets.guard.assertPublic({ text: PHRASE }, "test")).not.toThrow();
  });

  it("registers an extended key but not a single public key", () => {
    const secrets = new ScanSecrets({});
    secrets.watchOnly(
      { id: "1", label: "key", coinId: "dash", kind: "public-key", value: "02".padEnd(66, "1") },
      "Dash",
    );
    expect(() => secrets.guard.assertPublic("02".padEnd(66, "1"), "test")).not.toThrow();
    secrets.watchOnly(
      { id: "2", label: "key", coinId: "dash", kind: "dash-core-xpub", value: "xpubSECRETVALUE1" },
      "Dash",
    );
    expect(() => secrets.guard.assertPublic("xpubSECRETVALUE1", "test")).toThrow(
      /Dash watch-only input/u,
    );
  });
});

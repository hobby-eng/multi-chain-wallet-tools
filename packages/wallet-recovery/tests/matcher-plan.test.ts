import { expect, it, vi } from "vitest";
import {
  WalletMatcherPlan,
  type MatcherPlanInput,
  type MatcherServices,
  type MatcherWorker,
  type MatcherFinding,
} from "../src/matcher-plan.js";
import { getCoinAdapter } from "@ckd/coins/registry.js";
import { createCoinRegistry } from "@ckd/coins/registry-base.js";
import { detectMultiChainMatcherTargets } from "../src/matcher-targets-multichain.js";
import type { DerivationResult } from "@ckd/core/types.js";

const PHRASE = `${"abandon ".repeat(11)}about`;
const ADDRESS = "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA";
const PATH = "m/44'/0'/0'/0/0";
const FINDING: MatcherFinding = {
  seedNumber: 1,
  addressNumber: 1,
  address: ADDRESS,
  normalizedAddress: ADDRESS,
  adapterId: "bitcoin-legacy",
  adapter: "Bitcoin",
  account: 0,
  branch: 0,
  index: 0,
  path: PATH,
};

function input(overrides: Partial<MatcherPlanInput> = {}): MatcherPlanInput {
  return {
    source: { kind: "lists", phrases: PHRASE, passphrases: "" },
    targets: ADDRESS,
    network: "mainnet",
    coin: "bitcoin",
    allCoins: false,
    change: false,
    accountStart: 0,
    accountEnd: 0,
    indexStart: 0,
    indexCount: 1,
    ...overrides,
  };
}

function services() {
  const seeds: Uint8Array[] = [];
  const seed = vi.fn((_phrase: string, _passphrase: string) => {
    const bytes = Uint8Array.of(1, 2, 3);
    seeds.push(bytes);
    return bytes;
  });
  return {
    seeds,
    seed,
    host: {
      registry: createCoinRegistry([getCoinAdapter("bitcoin-legacy")]),
      detectTargets: detectMultiChainMatcherTargets,
      mnemonicToSeed: seed,
    } satisfies MatcherServices,
  };
}

it.each(["lists", "linked"] as const)(
  "preserves opaque %s passphrases exactly at the seed boundary",
  (kind) => {
    const fixture = services();
    const passphrase = kind === "linked" ? " \ufeffé🔒\r\n " : " \ufeffé🔒 ";
    using plan = new WalletMatcherPlan(
      input({
        source:
          kind === "linked"
            ? { kind, mnemonic: PHRASE, passphrase }
            : { kind, phrases: PHRASE, passphrases: passphrase },
      }),
      fixture.host,
    );
    expect(fixture.seed).toHaveBeenCalledExactlyOnceWith(PHRASE, passphrase);
    plan.wipe();
    expect(fixture.seeds[0]).toEqual(Uint8Array.of(0, 0, 0));
  },
);

it.each([
  { network: "regtest" },
  { accountStart: -1 },
  { accountEnd: 21 },
  { accountEnd: 0.5 },
  { indexStart: -1 },
  { indexCount: 5001 },
  { indexStart: 0x7fffffff, indexCount: 2 },
])("admits public selectors/ranges before allocating any seed: %j", (overrides) => {
  const fixture = services();
  expect(() => new WalletMatcherPlan(input(overrides), fixture.host)).toThrow();
  expect(fixture.seed).not.toHaveBeenCalled();
});

it("clears earlier owned seeds when a later phrase is refused", () => {
  const fixture = services();
  fixture.seed
    .mockImplementationOnce(() => {
      const seed = Uint8Array.of(4, 5);
      fixture.seeds.push(seed);
      return seed;
    })
    .mockImplementationOnce(() => {
      throw new Error("Synthetic second seed refusal");
    });
  expect(
    () =>
      new WalletMatcherPlan(
        input({ source: { kind: "lists", phrases: `${PHRASE}\n${PHRASE}`, passphrases: "" } }),
        fixture.host,
      ),
  ).toThrow("Synthetic second seed refusal");
  expect(fixture.seeds[0]).toEqual(Uint8Array.of(0, 0));
});

it("reports stopped explicitly after an awaited search without publishing progress", async () => {
  const fixture = services();
  let current = true;
  using plan = new WalletMatcherPlan(input(), fixture.host);
  const progress = vi.fn();
  const worker: MatcherWorker = {
    searchMany: async () => {
      current = false;
      return [];
    },
    derive: async () => {
      throw new Error("Unexpected derive");
    },
  };
  await expect(plan.search(worker, () => current, progress)).resolves.toEqual({ kind: "stopped" });
  expect(progress).not.toHaveBeenCalled();
});

it.each([true, false])("retires derived result fields on match=%s", async (matches) => {
  const fixture = services();
  using plan = new WalletMatcherPlan(input(), fixture.host);
  const field = { key: "wif", label: "WIF", value: "synthetic private output", secret: true };
  const derived: DerivationResult = {
    id: "bitcoin-legacy",
    title: "fixture",
    networkLabel: "mainnet",
    pathTemplate: PATH,
    basicSummary: [],
    summary: [],
    notices: [],
    rows: [
      {
        index: 0,
        path: PATH,
        title: "fixture",
        basic: [
          {
            key: "address",
            label: "Address",
            value: matches ? ADDRESS : "different public address",
            secret: false,
            role: "paymentAddress",
          },
        ],
        advanced: [field],
      },
    ],
  };
  const worker: MatcherWorker = { searchMany: async () => [], derive: async () => derived };
  const pending = plan.privateValues([FINDING], worker, () => true);
  if (matches) {
    using values = await pending;
    expect(values?.fields(0)[0]?.value).toBe("synthetic private output");
    expect(values?.tsv()).toContain("synthetic private output");
    values?.wipe();
    expect(() => values?.tsv()).toThrow();
  } else await expect(pending).rejects.toHaveProperty("code", "wallet.matcher-plan.changed");
  expect(field.value).toBe("");
  expect(derived.rows).toEqual([]);
});

it("reports stopped when the last progress callback revokes the request", async () => {
  const fixture = services();
  let current = true;
  using plan = new WalletMatcherPlan(input(), fixture.host);
  const worker: MatcherWorker = {
    searchMany: async () => [],
    derive: async () => {
      throw new Error("Unexpected derive");
    },
  };
  await expect(
    plan.search(
      worker,
      () => current,
      () => {
        current = false;
      },
    ),
  ).resolves.toEqual({ kind: "stopped" });
});

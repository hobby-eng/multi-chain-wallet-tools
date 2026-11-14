import { expect, it, vi } from "vitest";
import {
  WalletMatcherPlan,
  type MatcherPlanInput,
  type MatcherServices,
  type MatcherWorker,
  type MatcherFinding,
  type MatcherProgress,
} from "../src/matcher-plan.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { getCoinAdapter } from "@ckd/coins/registry.js";
import { getRuntimeCoinAdapter } from "@ckd/coins/runtime-registry.js";
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

/** A worker that finds nothing and derives nothing. */
const NO_MATCH: MatcherWorker = {
  searchMany: async () => [],
  derive: async () => {
    throw new Error("Unexpected derive");
  },
};
/** The host's turn: none needed where nothing else runs between phrases. */
const NO_TURN = async (): Promise<void> => undefined;
const NO_PROGRESS = (): void => undefined;

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
  async (kind) => {
    const fixture = services();
    // A lone surrogate too: the plan keeps a phrase as code units, never as UTF-8.
    const passphrase = kind === "linked" ? " \ufeffé🔒\ud800\r\n " : " \ufeffé🔒\ud800 ";
    using plan = new WalletMatcherPlan(
      input({
        source:
          kind === "linked"
            ? { kind, mnemonic: PHRASE, passphrase }
            : { kind, phrases: PHRASE, passphrases: passphrase },
      }),
      fixture.host,
    );
    expect(fixture.seed).not.toHaveBeenCalled();
    await plan.search(NO_MATCH, () => true, NO_PROGRESS, NO_TURN);
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

it("clears earlier owned seeds when a later phrase is refused", async () => {
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
  {
    using plan = new WalletMatcherPlan(
      input({ source: { kind: "lists", phrases: `${PHRASE}\n${PHRASE}`, passphrases: "" } }),
      fixture.host,
    );
    await expect(plan.search(NO_MATCH, () => true, NO_PROGRESS, NO_TURN)).rejects.toThrow(
      "Synthetic second seed refusal",
    );
  }
  expect(fixture.seeds[0]).toEqual(Uint8Array.of(0, 0));
});

it("reports progress before the first seed is made and before the first derivation", async () => {
  const fixture = services();
  const events: string[] = [];
  fixture.seed.mockImplementation(() => {
    events.push("seed");
    return Uint8Array.of(1);
  });
  using plan = new WalletMatcherPlan(
    input({ source: { kind: "lists", phrases: `${PHRASE}\n${PHRASE}`, passphrases: "" } }),
    fixture.host,
  );
  const worker: MatcherWorker = {
    ...NO_MATCH,
    searchMany: async () => {
      events.push("derive");
      return [];
    },
  };
  const outcome = await plan.search(
    worker,
    () => true,
    ({ stage, completed, total }) => events.push(`${stage} ${completed}/${total}`),
    async () => {
      events.push("turn");
    },
  );
  expect(outcome).toEqual({ kind: "complete", findings: [] });
  // Each phrase's seeds in a turn of their own, then one search per phrase.
  expect(events).toEqual([
    "seeds 0/2",
    "turn",
    "seed",
    "seeds 1/2",
    "turn",
    "seed",
    "seeds 2/2",
    "derive",
    "search 1/2",
    "derive",
    "search 2/2",
  ]);
});

it("stops making seeds when the host cancels between phrases, before any derivation", async () => {
  const fixture = services();
  const phrases = Array.from({ length: 5 }, () => PHRASE).join("\n");
  let current = true;
  const progress = vi.fn<(progress: MatcherProgress) => void>();
  const worker: MatcherWorker = {
    ...NO_MATCH,
    searchMany: vi.fn(async () => []),
  };
  {
    using plan = new WalletMatcherPlan(
      input({ source: { kind: "lists", phrases, passphrases: "" } }),
      fixture.host,
    );
    // Cancel arrives in the host's turn after the second phrase's seeds.
    const outcome = await plan.search(
      worker,
      () => current,
      progress,
      async () => {
        if (fixture.seed.mock.calls.length === 2) current = false;
      },
    );
    expect(outcome).toEqual({ kind: "stopped" });
  }
  expect(fixture.seed).toHaveBeenCalledTimes(2);
  expect(worker.searchMany).not.toHaveBeenCalled();
  expect(progress.mock.calls.map(([step]) => step.completed)).toEqual([0, 1, 2]);
  expect(fixture.seeds).toEqual([Uint8Array.of(0, 0, 0), Uint8Array.of(0, 0, 0)]);
});

it("reports stopped explicitly after an awaited search without publishing progress", async () => {
  const fixture = services();
  let current = true;
  using plan = new WalletMatcherPlan(input(), fixture.host);
  const progress = vi.fn();
  const worker: MatcherWorker = {
    ...NO_MATCH,
    searchMany: async () => {
      current = false;
      return [];
    },
  };
  await expect(plan.search(worker, () => current, progress, NO_TURN)).resolves.toEqual({
    kind: "stopped",
  });
  expect(progress).not.toHaveBeenCalledWith(expect.objectContaining({ stage: "search" }));
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

it("refuses a reveal of a row without a key, never widening it to its result's summary", async () => {
  // A BIP32 row whose key field is missing: the master keys in its summary are not shown.
  const fixture = services();
  using plan = new WalletMatcherPlan(input(), fixture.host);
  const master = {
    key: "masterXprv",
    label: "Master xprv",
    value: "synthetic master",
    secret: true,
  };
  const derived: DerivationResult = {
    id: "bitcoin-legacy",
    title: "fixture",
    networkLabel: "mainnet",
    pathTemplate: PATH,
    basicSummary: [master],
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
            value: ADDRESS,
            secret: false,
            role: "paymentAddress",
          },
        ],
        advanced: [],
      },
    ],
  };
  const worker: MatcherWorker = { searchMany: async () => [], derive: async () => derived };
  await expect(plan.privateValues([FINDING], worker, () => true)).rejects.toHaveProperty(
    "code",
    "wallet.matcher-plan.private",
  );
  expect(master.value).toBe("");
});

it("reveals a BIP32 row's own keys alone, never the master or account keys of its summary", async () => {
  // The row of "abandon … about"'s first legacy address has keys, and its summary holds the master
  // and account keys: the reveal shows exactly the row's.
  using plan = new WalletMatcherPlan(input(), {
    registry: createCoinRegistry([getCoinAdapter("bitcoin-legacy")]),
    detectTargets: detectMultiChainMatcherTargets,
    mnemonicToSeed,
  });
  const worker: MatcherWorker = {
    searchMany: async () => [],
    derive: async (adapterId, request) => await getRuntimeCoinAdapter(adapterId).derive(request),
  };
  using secrets = await plan.privateValues([FINDING], worker, () => true);
  expect(secrets?.fields(0).map(({ key }) => key)).toEqual([
    "privateKey",
    "childPrivateKey",
    "childXprv",
  ]);
});

it("makes the targets' costly checks in turns, with progress before the first, and Cancel stops them", async () => {
  // 40 targets, each with a check: 16 checks a turn, then the seeds.
  const checked: number[] = [];
  const events: string[] = [];
  let current = true;
  const target = (place: number) => ({
    id: `address-${place}`,
    input: ADDRESS,
    normalized: `${ADDRESS}-${place}`,
    network: "mainnet" as const,
    adapterIds: ["bitcoin-legacy"],
    check: () => {
      checked.push(place);
    },
  });
  const fixture = services();
  const host = {
    ...fixture.host,
    detectTargets: () => Array.from({ length: 40 }, (_, at) => target(at + 1)),
  };
  {
    using plan = new WalletMatcherPlan(input(), host);
    const outcome = await plan.search(
      NO_MATCH,
      () => current,
      ({ stage, completed, total }) => events.push(`${stage} ${completed}/${total}`),
      async () => {
        events.push(`turn after ${checked.length}`);
      },
    );
    expect(outcome.kind).toBe("complete");
  }
  expect(events.slice(0, 7)).toEqual([
    "addresses 0/40",
    "turn after 0",
    "addresses 16/40",
    "turn after 16",
    "addresses 32/40",
    "turn after 32",
    "addresses 40/40",
  ]);
  expect(checked).toEqual(Array.from({ length: 40 }, (_, at) => at + 1));
  // Cancel in the turn after the first 16: no later check, no seed.
  checked.length = 0;
  const seeds = fixture.seed.mock.calls.length;
  {
    using plan = new WalletMatcherPlan(input(), host);
    const outcome = await plan.search(
      NO_MATCH,
      () => current,
      NO_PROGRESS,
      async () => {
        if (checked.length === 16) current = false;
      },
    );
    expect(outcome).toEqual({ kind: "stopped" });
  }
  expect(checked).toHaveLength(16);
  expect(fixture.seed.mock.calls).toHaveLength(seeds);
});

it("reads the target lines once per plan, and checks the selected coin against each coin's own adapters", () => {
  const fixture = services();
  const detectTargets = vi.fn(detectMultiChainMatcherTargets);
  new WalletMatcherPlan(input(), { ...fixture.host, detectTargets }).wipe();
  expect(detectTargets.mock.calls).toEqual([[ADDRESS, "mainnet", true]]);
  // A Dash address under Bitcoin is refused, though a search of every profile widened its adapters.
  expect(
    () =>
      new WalletMatcherPlan(input({ targets: "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5" }), fixture.host),
  ).toThrow("Target 1 does not belong to Bitcoin.");
});

it("reports stopped when the last progress callback revokes the request", async () => {
  const fixture = services();
  let current = true;
  using plan = new WalletMatcherPlan(input(), fixture.host);
  await expect(
    plan.search(
      NO_MATCH,
      () => current,
      ({ stage }) => {
        if (stage === "search") current = false;
      },
      NO_TURN,
    ),
  ).resolves.toEqual({ kind: "stopped" });
});

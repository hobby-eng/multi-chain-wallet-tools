// The Wallet Matcher with Cardano: each variant searched with the seed it derives from (Icarus and
// Icarus-Trezor from the phrase's CIP-3 roots, Ledger from BIP39's seed), each address on its own
// roles, and a search over the Deriver's own rows. The addresses are published
// (Emurgo/cardano-serialization-lib @6b42538 rust/src/tests/address.rs, bip32_12_base,
// bip32_12_enterprise and bip32_12_reward, "test walk nut …") or own values of
// test/oracles/cardano_oracle.py for "abandon … about". Public test data only.
import { describe, expect, it, vi } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { cardanoIcarusRoot } from "@ckd/core/cardano-icarus.js";
import { CARDANO_COIN_ADAPTERS } from "@ckd/coins/adapters/cardano.js";
import { createCoinRegistry, type PhraseSeedReaders } from "@ckd/coins/registry-base.js";
import { getRuntimeCoinAdapter } from "@ckd/coins/runtime-registry.js";
import { findDerivedAddresses } from "../src/address-search.js";
import {
  WalletMatcherPlan,
  type MatcherPlanInput,
  type MatcherServices,
  type MatcherWorker,
} from "../src/matcher-plan.js";
import { detectMultiChainMatcherTargets } from "../src/matcher-targets-multichain.js";

const WALK = "test walk nut penalty hip pave soap entry language right filter choice";
const ABOUT = `${"abandon ".repeat(11)}about`;
const CSL = {
  base: "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwqfjkjv7",
  enterprise: "addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8",
  reward: "stake1uyevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqxdekzz",
};
const OWN = {
  icarusChange:
    "addr1qykhadtnvjpkxh76xgr0mu4huc9tg800x2sxsqemn9uz8jh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq28kufu",
  ledgerFifth:
    "addr1q8muu868678ae33qfj2ccu6fu4t0492eewtujzq09kyrwwgayfawlf9hwv2fzuygt2km5v92kvf8e3s3mk7ynxw77cwq5kt7sh",
  icarusReward: "stake1u8j40zgr2gy4788kl54h6x3gu0pukq5lfr8nflufpg5dzaskqlx2l",
};

/** The page's readers of Cardano's CIP-3 roots (apps/key-derivation/src/ui/cardano-seed-sources.ts). */
const READERS: PhraseSeedReaders = {
  "cardano-icarus": (phrase, passphrase) => cardanoIcarusRoot(phrase, passphrase, "icarus"),
  "cardano-icarus-trezor": (phrase, passphrase) =>
    cardanoIcarusRoot(phrase, passphrase, "icarus-trezor"),
};

function input(overrides: Partial<MatcherPlanInput> = {}): MatcherPlanInput {
  return {
    source: { kind: "lists", phrases: `${WALK}\n${ABOUT}`, passphrases: "" },
    targets: [CSL.base, CSL.enterprise, CSL.reward, OWN.icarusChange, OWN.ledgerFifth].join("\n"),
    network: "mainnet",
    coin: "cardano",
    allCoins: false,
    change: true,
    accountStart: 0,
    accountEnd: 0,
    indexStart: 0,
    indexCount: 6,
    ...overrides,
  };
}

/** The Matcher's services; `readers` null for a build without Cardano's seed readers. */
function services(readers: PhraseSeedReaders | null = READERS): MatcherServices {
  return {
    registry: createCoinRegistry([...CARDANO_COIN_ADAPTERS]),
    detectTargets: detectMultiChainMatcherTargets,
    mnemonicToSeed,
    ...(readers === null ? {} : { phraseSeedReaders: readers }),
  };
}

/** The worker's search, run on the Deriver's own rows of each variant. */
const WORKER: MatcherWorker = {
  searchMany: (adapterId, base, requests, start, count) =>
    findDerivedAddresses(getRuntimeCoinAdapter(adapterId), base, requests, start, count),
  derive: async (adapterId, request) => await getRuntimeCoinAdapter(adapterId).derive(request),
};

const NO_PROGRESS = (): void => undefined;
const NO_TURN = async (): Promise<void> => undefined;

describe("Cardano in the Wallet Matcher", () => {
  it("finds each address on its own roles, under every variant whose seed derives it", async () => {
    using plan = new WalletMatcherPlan(input(), services());
    const outcome = await plan.search(WORKER, () => true, NO_PROGRESS, NO_TURN);
    if (outcome.kind !== "complete") throw new Error("The search must complete.");
    const found = outcome.findings.map((finding) => [
      finding.seedNumber,
      finding.addressNumber,
      finding.adapterId,
      finding.path,
    ]);
    // Below 24 words Icarus-Trezor's keys are Icarus's, so both find the same addresses.
    expect(found.sort()).toEqual(
      [
        [1, 1, "cardano", "m/1852'/1815'/0'/0/0"],
        [1, 1, "cardano-icarus-trezor", "m/1852'/1815'/0'/0/0"],
        [1, 2, "cardano", "m/1852'/1815'/0'/0/0"],
        [1, 2, "cardano-icarus-trezor", "m/1852'/1815'/0'/0/0"],
        [1, 3, "cardano", "m/1852'/1815'/0'/2/0"],
        [1, 3, "cardano-icarus-trezor", "m/1852'/1815'/0'/2/0"],
        [2, 4, "cardano", "m/1852'/1815'/0'/1/0"],
        [2, 4, "cardano-icarus-trezor", "m/1852'/1815'/0'/1/0"],
        [2, 5, "cardano-ledger", "m/1852'/1815'/0'/0/5"],
      ].sort(),
    );
    // The stake key's row reveals the stake key, the one that signs for the reward address.
    const reward = outcome.findings.filter(({ addressNumber }) => addressNumber === 3);
    const secrets = await plan.privateValues(reward, WORKER, () => true);
    expect(secrets).toBeDefined();
    secrets?.wipe();
  });

  it("searches role 1 only when change addresses are searched", async () => {
    using plan = new WalletMatcherPlan(
      input({ change: false, targets: [OWN.icarusChange, OWN.icarusReward].join("\n") }),
      services(),
    );
    const outcome = await plan.search(WORKER, () => true, NO_PROGRESS, NO_TURN);
    if (outcome.kind !== "complete") throw new Error("The search must complete.");
    expect(outcome.findings.map(({ addressNumber, path }) => [addressNumber, path])).toEqual([
      [2, "m/1852'/1815'/0'/2/0"],
      [2, "m/1852'/1815'/0'/2/0"],
    ]);
  });

  it("gives each variant the seed it derives from, never another kind", async () => {
    const roots = {
      icarus: vi.fn(READERS["cardano-icarus"]),
      trezor: vi.fn(READERS["cardano-icarus-trezor"]),
    };
    const bip39 = vi.fn(mnemonicToSeed);
    const host = {
      ...services({ "cardano-icarus": roots.icarus, "cardano-icarus-trezor": roots.trezor }),
      mnemonicToSeed: bip39,
    };
    const seen = new Map<string, number[]>();
    const recording: MatcherWorker = {
      searchMany: async (adapterId, base, requests, start, count) => {
        seen.set(adapterId, [...(seen.get(adapterId) ?? []), base.seed.length]);
        return WORKER.searchMany(adapterId, base, requests, start, count);
      },
      derive: WORKER.derive,
    };
    using plan = new WalletMatcherPlan(
      input({ source: { kind: "lists", phrases: ABOUT, passphrases: "TREZOR" } }),
      host,
    );
    await plan.search(recording, () => true, NO_PROGRESS, NO_TURN);
    // One seed of each kind per phrase: a 96-byte CIP-3 root for each Icarus variant, BIP39's 64
    // bytes for Ledger.
    expect([roots.icarus, roots.trezor, bip39].map((read) => read.mock.calls)).toEqual([
      [[ABOUT, "TREZOR"]],
      [[ABOUT, "TREZOR"]],
      [[ABOUT, "TREZOR"]],
    ]);
    expect(
      Object.fromEntries([...seen].map(([id, lengths]) => [id, [...new Set(lengths)]])),
    ).toEqual({
      cardano: [96],
      "cardano-icarus-trezor": [96],
      "cardano-ledger": [64],
    });
    const seeds = [roots.icarus, roots.trezor, bip39].map(
      (read) => read.mock.results[0]?.value as Uint8Array,
    );
    plan.wipe();
    for (const seed of seeds) expect(seed.every((byte) => byte === 0)).toBe(true);
  });

  it("makes for a reveal only the seeds of its findings, never at admission", async () => {
    using found = new WalletMatcherPlan(input(), services());
    const outcome = await found.search(WORKER, () => true, NO_PROGRESS, NO_TURN);
    if (outcome.kind !== "complete") throw new Error("The search must complete.");
    const ledger = outcome.findings.filter(({ adapterId }) => adapterId === "cardano-ledger");
    expect(ledger.map(({ seedNumber, path }) => [seedNumber, path])).toEqual([
      [2, "m/1852'/1815'/0'/0/5"],
    ]);
    // The reveal's own plan, as the page makes one: Ledger's finding of phrase 2 needs BIP39's
    // seed of that phrase alone, not phrase 1's nor any CIP-3 root.
    const roots = {
      icarus: vi.fn(READERS["cardano-icarus"]),
      trezor: vi.fn(READERS["cardano-icarus-trezor"]),
    };
    const bip39 = vi.fn(mnemonicToSeed);
    using reveal = new WalletMatcherPlan(input(), {
      ...services({ "cardano-icarus": roots.icarus, "cardano-icarus-trezor": roots.trezor }),
      mnemonicToSeed: bip39,
    });
    expect([roots.icarus, roots.trezor, bip39].map((read) => read.mock.calls.length)).toEqual([
      0, 0, 0,
    ]);
    const secrets = await reveal.privateValues(ledger, WORKER, () => true);
    expect(secrets?.size).toBe(1);
    secrets?.wipe();
    expect(bip39.mock.calls).toEqual([[ABOUT, ""]]);
    expect([roots.icarus, roots.trezor].map((read) => read.mock.calls.length)).toEqual([0, 0]);
  });

  it("refuses to search a variant whose seed this build cannot read, before any seed is made", () => {
    const bip39 = vi.fn(mnemonicToSeed);
    expect(
      () => new WalletMatcherPlan(input(), { ...services(null), mnemonicToSeed: bip39 }),
    ).toThrow(/cannot read the seed that Cardano/u);
    expect(bip39).not.toHaveBeenCalled();
  });
});

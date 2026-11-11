import { describe, expect, it } from "vitest";
import { isAccountCoin } from "./account-coins.mjs";
import { EVM_NETWORKS } from "./evm-networks.mjs";
import { createBuildMatrixPlan, createBuildMatrixSmokePlan } from "./build-matrix-plan.mjs";

const EVM_COINS = new Set(EVM_NETWORKS.map(({ id }) => id));

describe("exhaustive standalone build matrix", () => {
  const plan = createBuildMatrixPlan();

  it("enumerates every reviewed valid composition exactly once", () => {
    // The nine account coins add 9 Viewer coin sets and 36 Scanner builds (256, against 220 before
    // them); Ethereum Classic, an EVM network, adds 1 Viewer coin set and 10 Scanner builds.
    expect(plan).toHaveLength(142897);
    expect(new Set(plan.map(({ relativePath }) => relativePath)).size).toBe(plan.length);
  });

  it("preserves required feature invariants", () => {
    for (const job of plan) {
      expect(job.coins.length).toBeGreaterThan(0);
      if (job.profileId === "dash-community") expect(job.coins).toEqual(["dash"]);
      if (job.toolId === "key-derivation") expect(job.features).toContain("derive");
      if (job.features.includes("mnemocode-cards")) expect(job.features).toContain("mnemocode");
      if (job.toolId === "psbt-inspector") expect(job.features.length).toBeGreaterThan(0);
      if (job.toolId === "discovery-scanner") {
        expect(
          job.features.some(
            (feature) => feature === "seed-discovery" || feature === "watch-only-discovery",
          ),
        ).toBe(true);
        if (job.features.includes("wallet-matcher"))
          expect(job.features).toContain("seed-discovery");
        if (job.coins.some((coin) => isAccountCoin(coin)))
          expect(job.features).toContain("seed-discovery");
      }
    }
  });

  it("can constrain planning without changing composition rules", () => {
    const discovery = createBuildMatrixPlan(["multi-chain"], "discovery-scanner");
    // 15 coin sets without an account coin × 10 feature sets; each account coin alone × 4 (seed
    // discovery, no public-key scans); 8 sets with every table coin × 8 (seed discovery), and the
    // same 8 sets without the account coins × 2 (watch-only, with or without custom paths).
    expect(discovery).toHaveLength(266);
    // Watch-only builds hold several EVM networks again, never an account coin.
    const watchOnly = discovery.filter(({ features }) => !features.includes("seed-discovery"));
    expect(
      watchOnly.some(({ coins }) => coins.filter((coin) => EVM_COINS.has(coin)).length > 1),
    ).toBe(true);
    expect(watchOnly.every(({ coins }) => !coins.some((coin) => isAccountCoin(coin)))).toBe(true);
    expect(discovery.every(({ toolId }) => toolId === "discovery-scanner")).toBe(true);
  });
});

describe("bounded standalone build smoke matrix", () => {
  const exhaustive = createBuildMatrixPlan();
  const smoke = createBuildMatrixSmokePlan();
  const exhaustiveKeys = new Set(
    exhaustive.map(({ profileId, toolId, coins, features }) =>
      [profileId, toolId, coins.join(","), features.join(",")].join("|"),
    ),
  );

  it("selects a stable unique subset of valid builds", () => {
    // Each of the nine account coins and of the EVM networks alone, in the Scanner and in the
    // Viewer.
    expect(smoke).toHaveLength(120);
    expect(new Set(smoke.map(({ relativePath }) => relativePath)).size).toBe(smoke.length);
    for (const job of smoke) {
      expect(
        exhaustiveKeys.has(
          [job.profileId, job.toolId, job.coins.join(","), job.features.join(",")].join("|"),
        ),
      ).toBe(true);
    }
  });

  it("covers every supported coin and optional feature in each applicable profile", () => {
    for (const profileId of ["multi-chain", "dash-community"]) {
      const profileJobs = smoke.filter((job) => job.profileId === profileId);
      for (const toolId of new Set(profileJobs.map(({ toolId }) => toolId))) {
        const jobs = profileJobs.filter((job) => job.toolId === toolId);
        const exhaustiveJobs = exhaustive.filter(
          (job) => job.profileId === profileId && job.toolId === toolId,
        );
        for (const coin of new Set(exhaustiveJobs.flatMap(({ coins }) => coins))) {
          expect(jobs.some((job) => job.coins.length === 1 && job.coins[0] === coin)).toBe(true);
        }
        for (const feature of new Set(exhaustiveJobs.flatMap(({ features }) => features))) {
          expect(jobs.some((job) => job.features.includes(feature))).toBe(true);
        }
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { createBuildMatrixPlan, createBuildMatrixSmokePlan } from './build-matrix-plan.mjs';

describe('exhaustive standalone build matrix', () => {
  const plan = createBuildMatrixPlan();

  it('enumerates every reviewed valid composition exactly once', () => {
    expect(plan).toHaveLength(23636);
    expect(new Set(plan.map(({ relativePath }) => relativePath)).size).toBe(plan.length);
  });

  it('preserves required feature invariants', () => {
    for (const job of plan) {
      expect(job.coins.length).toBeGreaterThan(0);
      if (job.profileId === 'dash-community') expect(job.coins).toEqual(['dash']);
      if (job.toolId === 'key-derivation') expect(job.features).toContain('derive');
      if (job.toolId === 'psbt-inspector') expect(job.features.length).toBeGreaterThan(0);
      if (job.toolId === 'discovery-scanner') {
        expect(job.features.some((feature) => feature === 'seed-discovery' || feature === 'watch-only-discovery')).toBe(
          true,
        );
        if (job.features.includes('wallet-matcher')) expect(job.features).toContain('seed-discovery');
      }
    }
  });

  it('can constrain planning without changing composition rules', () => {
    const discovery = createBuildMatrixPlan(['multi-chain'], 'discovery-scanner');
    expect(discovery).toHaveLength(70);
    expect(discovery.every(({ toolId }) => toolId === 'discovery-scanner')).toBe(true);
  });
});

describe('bounded standalone build smoke matrix', () => {
  const exhaustive = createBuildMatrixPlan();
  const smoke = createBuildMatrixSmokePlan();
  const exhaustiveKeys = new Set(
    exhaustive.map(({ profileId, toolId, coins, features }) =>
      [profileId, toolId, coins.join(','), features.join(',')].join('|'),
    ),
  );

  it('selects a stable unique subset of valid builds', () => {
    expect(smoke).toHaveLength(68);
    expect(new Set(smoke.map(({ relativePath }) => relativePath)).size).toBe(smoke.length);
    for (const job of smoke) {
      expect(
        exhaustiveKeys.has([job.profileId, job.toolId, job.coins.join(','), job.features.join(',')].join('|')),
      ).toBe(true);
    }
  });

  it('covers every supported coin and optional feature in each applicable profile', () => {
    for (const profileId of ['multi-chain', 'dash-community']) {
      const profileJobs = smoke.filter((job) => job.profileId === profileId);
      for (const toolId of new Set(profileJobs.map(({ toolId }) => toolId))) {
        const jobs = profileJobs.filter((job) => job.toolId === toolId);
        const exhaustiveJobs = exhaustive.filter((job) => job.profileId === profileId && job.toolId === toolId);
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

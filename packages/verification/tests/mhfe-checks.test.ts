import { expect, it, vi } from "vitest";
import { MhfeError, type MhfeSelfCheckReport } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import { MhfeCheckSequence, type MhfeClassChecks } from "../src/mhfe-checks.js";

function report(failed: boolean, aggregateOnly = false): MhfeSelfCheckReport {
  return {
    passed: !failed,
    tier: "full",
    version: "synthetic",
    buildId: "synthetic",
    components: [
      {
        id: "synthetic",
        label: "Synthetic known answer",
        outcome: failed && !aggregateOnly ? "failed" : "passed",
      },
    ],
  };
}

it.each(["startup", "full"] as const)(
  "retains a failed %s verdict before a later worker could refuse",
  async (kind) => {
    const first = report(true);
    const later = vi.fn(async () => {
      throw new MhfeError("WORKER_FAILED", "Synthetic refusal.");
    });
    const checks: MhfeClassChecks[] = [
      { name: "Core", quick: async () => first, full: async () => first },
      { name: "Wallet", quick: later, full: later },
    ];
    await expect(MhfeCheckSequence[kind](checks)).resolves.toEqual([
      { name: "Core", report: first },
    ]);
    expect(later).not.toHaveBeenCalled();
  },
);

it.each(["startup", "full"] as const)(
  "retains an aggregate-only failed %s verdict",
  async (kind) => {
    const first = report(true, true);
    const later = vi.fn(async () => report(false));
    const checks: MhfeClassChecks[] = [
      { name: "Core", quick: async () => first, full: async () => first },
      { name: "Wallet", quick: later, full: later },
    ];
    expect(await MhfeCheckSequence[kind](checks)).toEqual([{ name: "Core", report: first }]);
    expect(later).not.toHaveBeenCalled();
  },
);

it.each(["startup", "full"] as const)(
  "propagates an operational %s refusal without inventing a wrong answer",
  async (kind) => {
    const first = report(false);
    const refusal = new MhfeError("WORKER_FAILED", "Synthetic refusal.");
    const later = vi.fn(async () => {
      throw refusal;
    });
    const checks: MhfeClassChecks[] = [
      { name: "Core", quick: async () => first, full: async () => first },
      { name: "Wallet", quick: later, full: later },
    ];
    await expect(MhfeCheckSequence[kind](checks)).rejects.toBe(refusal);
    expect(later).toHaveBeenCalledOnce();
  },
);

it("checks every class when the reports pass and filters only explicitly selected startup classes", async () => {
  const first = vi.fn(async () => report(false));
  const second = vi.fn(async () => report(false));
  const checks: MhfeClassChecks[] = [
    { name: "Core", quick: first, full: first },
    { name: "Wallet", quick: second, full: second },
  ];
  expect(await MhfeCheckSequence.full(checks)).toHaveLength(2);
  first.mockClear();
  second.mockClear();
  expect(await MhfeCheckSequence.startup(checks, ["Wallet"])).toHaveLength(1);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
});

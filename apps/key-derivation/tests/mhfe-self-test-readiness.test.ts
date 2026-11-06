import { afterEach, expect, it, vi } from "vitest";
import type { MhfeSelfTest } from "@ckd/recovery-mhfe-wasm/core/client.js";
import { MhfeError, type MhfeComponentResult } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import { RecoveryJobGate, bindJobGate } from "../src/ui/recovery-job-gate.js";
import { MhfeRun } from "../src/ui/recovery-mhfe-run.js";
import { MhfeSelfTestTab, type MhfeSelfTestEngine } from "../src/ui/recovery-mhfe-self-test.js";
import { SELF_TEST_STAGES, StageProgress } from "../src/ui/recovery-mhfe-status.js";
import { JobClock } from "../src/ui/recovery-progress.js";
import { MhfeCheckSequence } from "@ckd/verification/mhfe-checks.js";
import { RecoveryTestElement, RecoveryTestPage, settlePromises } from "./fake-recovery-page.js";

afterEach(() => vi.unstubAllGlobals());

class SelfTestRow extends RecoveryTestElement {
  insertCell(): RecoveryTestElement {
    const cell = this.ownerDocument.createElement("td");
    this.append(cell);
    return cell;
  }
}

class SelfTestTable extends RecoveryTestElement {
  insertRow(): SelfTestRow {
    const row = new SelfTestRow("tr", this.ownerDocument);
    this.append(row);
    return row;
  }
}

class SelfTestPage extends RecoveryTestPage {
  override createElement(tag: string): RecoveryTestElement {
    return tag === "table" ? new SelfTestTable(tag, this) : super.createElement(tag);
  }
}

interface CheckCase {
  readonly outcome?: MhfeComponentResult["outcome"];
  readonly reportPassed?: boolean;
  readonly vectorsPassed?: boolean;
  readonly error?: MhfeError;
  readonly callback?: boolean;
  readonly laterWorkerFailure?: boolean;
  readonly progressOutcome?: MhfeComponentResult["outcome"];
  readonly errorAfterProgress?: MhfeError;
}

function setup(options: CheckCase = {}) {
  const page = new SelfTestPage();
  for (const id of ["status", "result", "vectors", "stop"])
    page.add(`mhfe-selftest-${id}`, id === "vectors" ? "input" : "button");
  page.add("mhfe-selftest", "button");
  page.require("mhfe-selftest-vectors").checked = options.vectorsPassed !== undefined;
  const button = document.querySelector<HTMLButtonElement>("#mhfe-selftest")!;
  button.dataset.heavyJob = "";
  const jobs = new RecoveryJobGate();
  bindJobGate(jobs, [button], document.createElement("p"));
  jobs.setReady(true);
  const selfTestFailed = vi.fn();
  const outcome: MhfeSelfTest = {
    passed: options.vectorsPassed ?? true,
    suite3: { vector: "public-synthetic-3", asPublished: options.vectorsPassed ?? true },
    suite4: { vector: "public-synthetic-4", asPublished: true },
    firstWrongRound: null,
    fault:
      options.vectorsPassed === false
        ? { kind: "after-argon2", round: null, message: "Public synthetic vector mismatch." }
        : null,
  };
  const selfTest = vi.fn(async () => outcome);
  const fullChecks = vi.fn<MhfeSelfTestEngine["fullChecks"]>(async (onProgress) => {
    if (options.error !== undefined) throw options.error;
    const reports = [
      {
        name: "Core",
        report: {
          passed: options.reportPassed ?? options.outcome !== "failed",
          tier: "full",
          version: "synthetic",
          buildId: "synthetic",
          components: [
            {
              id: "public-synthetic",
              label: "Public synthetic check",
              outcome: options.outcome ?? "passed",
            },
          ],
        },
      },
    ] satisfies Awaited<ReturnType<MhfeSelfTestEngine["fullChecks"]>>;
    const first = reports[0]!;
    if (options.progressOutcome !== undefined) {
      return MhfeCheckSequence.full(
        [
          {
            name: first.name,
            quick: async () => first.report,
            full: async (progress) => {
              progress({
                running: false,
                id: "completed-public-answer",
                label: "Completed public answer",
                outcome: options.progressOutcome ?? "passed",
              });
              if (options.errorAfterProgress !== undefined) throw options.errorAfterProgress;
              return first.report;
            },
          },
        ],
        onProgress,
      );
    }
    if (options.laterWorkerFailure !== true) return reports;
    const refused = async () => {
      throw new MhfeError("WORKER_FAILED", "Synthetic later worker refusal.");
    };
    return MhfeCheckSequence.full([
      { name: first.name, quick: async () => first.report, full: async () => first.report },
      { name: "Wallet", quick: refused, full: refused },
    ]);
  });
  // This injected service is the UI's worker boundary: replies contain no actual KDF work.
  const engine: MhfeSelfTestEngine = {
    progress: async () => new StageProgress(SELF_TEST_STAGES, 1, new JobClock(() => 0)),
    fullChecks,
    client: async () => ({ parameters: async () => ({ version: "synthetic" }), selfTest }),
    cancelCore() {},
    runCancellable: <T>(
      cancel: HTMLButtonElement,
      stop: () => void,
      operation: (run: MhfeRun) => Promise<T>,
    ) => new MhfeRun(stop).withButton(cancel, operation),
  };
  new MhfeSelfTestTab({ jobs, ...(options.callback === false ? {} : { selfTestFailed }) }, engine);
  return { page, button, jobs, selfTestFailed, fullChecks, selfTest };
}

async function run(page: SelfTestPage): Promise<void> {
  page.require("mhfe-selftest").click();
  await settlePromises();
  await settlePromises();
}

it.each([false, true])(
  "preserves a prior wrong answer across a later worker refusal (failed=%s)",
  async (failed) => {
    const { page, jobs, selfTestFailed } = setup({
      outcome: failed ? "failed" : "passed",
      laterWorkerFailure: true,
    });
    await run(page);
    expect(jobs.ready).toBe(!failed);
    expect(selfTestFailed).toHaveBeenCalledTimes(failed ? 1 : 0);
  },
);

it.each([
  { outcome: "failed" as const },
  { reportPassed: false },
  { vectorsPassed: false },
  { error: new MhfeError("SELF_CHECK_FAILED", "Public synthetic check failed.") },
])("closes host readiness when a known answer fails (%j)", async (options) => {
  const { page, button, jobs, selfTestFailed, fullChecks } = setup(options);
  await run(page);
  expect(jobs.runningJob).toBeNull();
  expect(jobs.ready).toBe(false);
  expect(button.disabled).toBe(true);
  expect(selfTestFailed).toHaveBeenCalledOnce();
  expect(selfTestFailed.mock.calls[0]?.[0]).toMatchObject({ code: "SELF_CHECK_FAILED" });
  expect(() => jobs.assertReady()).toThrow();
  await expect(
    jobs.runHeavy("Subsequent secret operation", async () => undefined),
  ).rejects.toThrow();
  jobs.setReady(true);
  expect(jobs.ready).toBe(false);
  await run(page);
  expect(fullChecks).toHaveBeenCalledOnce();
  expect(selfTestFailed).toHaveBeenCalledOnce();
});

it.each(["failed", "passed"] as const)(
  "preserves completed %s progress before a later failure in the same class",
  async (progressOutcome) => {
    const { page, jobs, selfTestFailed } = setup({
      progressOutcome,
      errorAfterProgress: new MhfeError("WORKER_FAILED", "Synthetic later service failure."),
    });
    await run(page);
    expect(jobs.ready).toBe(progressOutcome !== "failed");
    expect(selfTestFailed).toHaveBeenCalledTimes(progressOutcome === "failed" ? 1 : 0);
    if (progressOutcome === "failed")
      expect(page.require("mhfe-selftest-status").textContent).toContain("Completed public answer");
  },
);

it("does not run vectors after failed progress even if the final report contradicts it", async () => {
  const { page, jobs, selfTestFailed, selfTest } = setup({
    progressOutcome: "failed",
    reportPassed: true,
    vectorsPassed: true,
  });
  await run(page);
  expect(jobs.ready).toBe(false);
  expect(selfTestFailed).toHaveBeenCalledOnce();
  expect(selfTest).not.toHaveBeenCalled();
});

it("closes the local gate when an embedding omits its optional host listener", async () => {
  const { page, jobs, selfTestFailed } = setup({ vectorsPassed: false, callback: false });
  await run(page);
  expect(jobs.ready).toBe(false);
  expect(selfTestFailed).not.toHaveBeenCalled();
  expect(page.require("mhfe-selftest-result").text).toContain("NOT compute MHFE");
});

it.each(["WORKER_FAILED", "BUSY"] as const)(
  "keeps operational %s separate from a failed known answer",
  async (code) => {
    const { page, jobs, selfTestFailed } = setup({
      error: new MhfeError(code, "Public operational refusal."),
    });
    await run(page);
    expect(jobs.ready).toBe(true);
    expect(jobs.runningJob).toBeNull();
    expect(selfTestFailed).not.toHaveBeenCalled();
  },
);

it.each(["passed", "warning", "notAvailable", "notRun"] as const)(
  "retains readiness for the nonfailed component outcome %s",
  async (outcome) => {
    const { page, jobs, selfTestFailed } = setup({ outcome, vectorsPassed: true });
    await run(page);
    expect(jobs.ready).toBe(true);
    expect(jobs.runningJob).toBeNull();
    expect(selfTestFailed).not.toHaveBeenCalled();
    expect(page.require("mhfe-selftest-status").textContent).toContain("Self-test complete");
  },
);

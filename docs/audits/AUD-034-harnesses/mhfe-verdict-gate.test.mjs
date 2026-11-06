// Real tab/task/run/gate with synthetic package replies. No MHFE runtime, WASM or KDF work.
import { afterEach, expect, it, vi } from "vitest";
import { MhfeSelfTestTab } from "../../../apps/key-derivation/src/ui/recovery-mhfe-self-test.ts";
import { MhfeRun } from "../../../apps/key-derivation/src/ui/recovery-mhfe-run.ts";
import { RecoveryJobGate } from "../../../apps/key-derivation/src/ui/recovery-job-gate.ts";
import { RecoveryTestPage, settlePromises } from "../../../apps/key-derivation/tests/fake-recovery-page.ts";

afterEach(() => { vi.unstubAllGlobals(); });

it.each([true, false])("propagates the published-vector verdict to host readiness (passed=%s)", async (passed) => {
  const page = new RecoveryTestPage();
  const create = page.createElement.bind(page);
  page.createElement = (tag) => {
    const element = create(tag);
    if (tag === "table") element.insertRow = () => {
      const row = create("tr"); element.append(row);
      row.insertCell = () => { const cell = create("td"); row.append(cell); return cell; };
      return row;
    };
    return element;
  };
  for (const id of ["mhfe-selftest-status", "mhfe-selftest-result", "mhfe-selftest-vectors", "mhfe-selftest-stop", "mhfe-selftest"]) page.add(id, id.endsWith("vectors") ? "input" : "button");
  page.require("mhfe-selftest-vectors").checked = true;
  const jobs = new RecoveryJobGate(); jobs.setReady(true);
  const selfTestFailed = vi.fn(() => jobs.setReady(false));
  const selfTest = vi.fn(async () => ({ passed, suite3: { vector: "public-test-3", asPublished: passed }, suite4: { vector: "public-test-4", asPublished: true }, firstWrongRound: null, fault: passed ? null : { kind: "after-argon2", round: null, message: "public synthetic mismatch" } }));
  const engine = {
    progress: async () => ({ elapsed: () => "synthetic interval", line: () => "synthetic progress" }),
    fullChecks: async () => [{ name: "core", report: { passed: true, tier: "full", version: "synthetic", buildId: "synthetic", components: [{ id: "public-synthetic", label: "Public synthetic component", outcome: "passed" }] } }],
    client: async () => ({ parameters: async () => ({ version: "synthetic" }), selfTest }),
    cancelCore() {},
    runCancellable: (button, stop, operation) => new MhfeRun(stop).withButton(button, operation),
  };
  new MhfeSelfTestTab({ jobs, selfTestFailed }, engine);
  page.require("mhfe-selftest").click();
  for (let turn = 0; turn < 4; turn++) await settlePromises();
  expect(selfTest).toHaveBeenCalledOnce();
  expect(page.require("mhfe-selftest-status").textContent).toBe("Self-test complete in synthetic interval.");
  expect(jobs.runningJob).toBeNull();
  expect({ ready: jobs.ready, notified: selfTestFailed.mock.calls.length }).toEqual({ ready: passed, notified: passed ? 0 : 1 });
});

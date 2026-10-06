import { describe, expect, it } from "vitest";
import { RecoveryJobGate, type JobGateChange } from "../src/ui/recovery-job-gate.js";

describe("Recover & Back Up job gate", () => {
  it("runs one heavy job at a time and frees the slot when a job fails", async () => {
    const gate = new RecoveryJobGate();
    const changes: JobGateChange[] = [];
    gate.onChange((change) => changes.push(change));
    let finish: () => void = () => undefined;
    const first = gate.runHeavy(
      "MHFE encryption",
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    expect(gate.runningJob).toBe("MHFE encryption");
    await expect(gate.runHeavy("MHFE recovery", async () => undefined)).rejects.toThrow(
      "MHFE encryption is running.",
    );
    finish();
    await first;
    expect(gate.runningJob).toBeNull();
    await expect(
      gate.runHeavy("MHFE recovery", () => Promise.reject(new Error("wrong password"))),
    ).rejects.toThrow("wrong password");
    expect(gate.runningJob).toBeNull();
    expect(changes).toEqual(["job", "job", "job", "job"]);
  });

  it("reports the startup self-test result", () => {
    const gate = new RecoveryJobGate();
    const changes: JobGateChange[] = [];
    gate.onChange((change) => changes.push(change));
    expect(gate.ready).toBe(false);
    gate.setReady(true);
    expect(gate.ready).toBe(true);
    expect(changes).toEqual(["ready"]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { MhfeCancelledError } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { MhfeRun } from "../src/ui/recovery-mhfe-run.js";

/** The parts of a Cancel button that a run uses; no DOM is needed. */
interface FakeButton {
  hidden: boolean;
  onclick: (() => void) | null;
}

function cancelButton(): { fake: FakeButton; button: HTMLButtonElement } {
  const fake: FakeButton = { hidden: true, onclick: null };
  return { fake, button: fake as unknown as HTMLButtonElement };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (cause: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** Lets every pending promise reaction run. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await new Promise((done) => setTimeout(done, 0));
}

const CANCELLED = { code: "CANCELLED" };

describe("an MHFE run latches Cancel over every step", () => {
  it("starts nothing after a Cancel during the package's compilation", async () => {
    const { fake, button } = cancelButton();
    const compile = deferred<string>();
    const stopActive = vi.fn();
    const operation = vi.fn(async () => "synthetic sealed container");
    const result = new MhfeRun(stopActive).withButton(button, async (run) => {
      await run.step(() => compile.promise);
      return run.step(operation);
    });
    expect(fake.hidden).toBe(false);
    fake.onclick!();
    compile.resolve("synthetic client");
    await expect(result).rejects.toMatchObject(CANCELLED);
    await settle();
    expect(operation).not.toHaveBeenCalled();
    expect(stopActive).toHaveBeenCalledTimes(1);
    expect(fake.hidden).toBe(true);
    expect(fake.onclick).toBeNull();
  });

  for (const stage of ["container facts", "password review"]) {
    it(`gives no late result after a Cancel during the ${stage}`, async () => {
      const { fake, button } = cancelButton();
      const quick = deferred<string>();
      const lateSideEffect = vi.fn();
      const next = vi.fn(async () => "synthetic next step");
      const result = new MhfeRun(() => undefined).withButton(button, async (run) => {
        const answer = await run.step(() => quick.promise);
        lateSideEffect(answer);
        return run.step(next);
      });
      await settle();
      fake.onclick!();
      // The quick step had started; its answer arrives after the Cancel.
      quick.resolve("synthetic answer");
      await expect(result).rejects.toBeInstanceOf(MhfeCancelledError);
      await settle();
      expect(lateSideEffect).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  }

  it("stops the active operation through the package and returns no result", async () => {
    const { fake, button } = cancelButton();
    const active = deferred<string>();
    // As MhfeClient.cancel does, stopping rejects the operation's own promise.
    const stopActive = vi.fn(() => active.reject(new MhfeCancelledError()));
    const shown = vi.fn();
    const result = new MhfeRun(stopActive).withButton(button, async (run) => {
      shown(await run.step(() => active.promise));
    });
    await settle();
    fake.onclick!();
    await expect(result).rejects.toMatchObject(CANCELLED);
    expect(stopActive).toHaveBeenCalledTimes(1);
    expect(shown).not.toHaveBeenCalled();
  });

  it("stops the package once, and refuses every step after a Cancel", async () => {
    const stopActive = vi.fn();
    const run = new MhfeRun(stopActive);
    run.cancel();
    run.cancel();
    expect(stopActive).toHaveBeenCalledTimes(1);
    expect(run.cancelled).toBe(true);
    const work = vi.fn(async () => "synthetic");
    await expect(run.step(work)).rejects.toMatchObject(CANCELLED);
    expect(work).not.toHaveBeenCalled();
  });

  it("runs to its end without a Cancel", async () => {
    const { fake, button } = cancelButton();
    const stopActive = vi.fn();
    const result = await new MhfeRun(stopActive).withButton(button, async (run) => {
      const client = await run.step(async () => "synthetic client");
      return run.step(async () => `${client} result`);
    });
    expect(result).toBe("synthetic client result");
    expect(stopActive).not.toHaveBeenCalled();
    expect(fake.hidden).toBe(true);
    expect(fake.onclick).toBeNull();
  });

  it("refuses a late step and callback when the source changes during an await", async () => {
    const { button } = cancelButton();
    const answer = deferred<string>();
    let current = true;
    const run = new MhfeRun(() => undefined);
    run.bindCurrent(() => current);
    const publish = vi.fn();
    const result = run.withButton(button, async () => {
      await run.step(() => answer.promise);
      publish();
    });
    current = false;
    run.publish(publish);
    answer.resolve("synthetic late answer");
    await expect(result).rejects.toBeInstanceOf(MhfeCancelledError);
    expect(publish).not.toHaveBeenCalled();
  });

  it("does not publish or stop a newer worker through an already completed run", async () => {
    const { button } = cancelButton();
    const stop = vi.fn();
    const publish = vi.fn();
    const run = new MhfeRun(stop);
    await run.withButton(button, async () => undefined);
    run.publish(publish);
    run.cancel();
    expect(publish).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    await expect(run.step(async () => "late")).rejects.toBeInstanceOf(MhfeCancelledError);
  });

  it("frees the job gate at once when Cancel comes during compilation", async () => {
    const { fake, button } = cancelButton();
    const gate = new RecoveryJobGate();
    gate.setReady(true);
    const compile = deferred<string>();
    const job = gate.runHeavy("MHFE encryption", () =>
      new MhfeRun(() => undefined).withButton(button, (run) => run.step(() => compile.promise)),
    );
    expect(gate.runningJob).toBe("MHFE encryption");
    fake.onclick!();
    await expect(job).rejects.toMatchObject(CANCELLED);
    // The compilation is still pending, yet another long operation may start.
    expect(gate.runningJob).toBeNull();
    compile.resolve("synthetic client");
  });
});

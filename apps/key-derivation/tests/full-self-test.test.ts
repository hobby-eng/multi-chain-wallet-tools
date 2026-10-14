import { afterEach, describe, expect, it, vi } from "vitest";
import { FullSelfTestSection } from "../src/ui/full-self-test.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";

/** The few element features the full self-test section uses. */
class FakeElement extends EventTarget {
  disabled = false;
  textContent = "";
  readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string): void => void this.classes.add(name),
    remove: (name: string): void => void this.classes.delete(name),
  };
  readonly children: unknown[] = [];
  replaceChildren(): void {
    this.children.length = 0;
  }
  append(...nodes: unknown[]): void {
    this.children.push(...nodes);
  }
  click(): void {
    this.dispatchEvent(new Event("click"));
  }
}

function fakeTable() {
  const rows: { cells: { textContent: string }[] }[] = [];
  return {
    className: "",
    rows,
    insertRow() {
      const row = {
        cells: [] as { textContent: string }[],
        insertCell() {
          const cell = { textContent: "" };
          row.cells.push(cell);
          return cell;
        },
      };
      rows.push(row);
      return row;
    },
  };
}

function install(
  startupChecks: () => Promise<{ checks: string[]; durationMs: number }>,
  jobs?: RecoveryJobGate,
) {
  const elements = {
    "full-self-test": new FakeElement(),
    "full-self-test-status": new FakeElement(),
    "full-self-test-result": new FakeElement(),
  };
  vi.stubGlobal("document", {
    querySelector: (selector: string) =>
      elements[selector.slice(1) as keyof typeof elements] ?? null,
    createElement: (name: string) => (name === "table" ? fakeTable() : { className: "" }),
  });
  vi.stubGlobal("performance", { now: () => 0 });
  const section = new FullSelfTestSection(startupChecks, jobs);
  return {
    section,
    button: elements["full-self-test"],
    status: elements["full-self-test-status"],
  };
}

/** Lets the section's awaited promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the full self-test section", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a failure to the page, which closes its controls (AUD-023-SEC001)", async () => {
    const { section, button, status } = install(() =>
      Promise.reject(new Error("BIP85 WIF differs.")),
    );
    const failures: unknown[] = [];
    section.onFailure((cause) => failures.push(cause));
    section.enabled = true;
    button.click();
    await settle();
    expect(status.textContent).toMatch(/^✗ Failed: BIP85 WIF differs\./u);
    expect(failures).toHaveLength(1);
  });

  it("does not report a pass as a failure, and a double click runs it once", async () => {
    const startupChecks = vi.fn(() => Promise.resolve({ checks: ["BIP39"], durationMs: 1 }));
    const { section, button, status } = install(startupChecks);
    const failures: unknown[] = [];
    section.onFailure((cause) => failures.push(cause));
    section.enabled = true;
    button.click();
    button.click();
    await settle();
    expect(startupChecks).toHaveBeenCalledOnce();
    expect(status.textContent).toMatch(/^Every check passed: 1 checks/u);
    expect(failures).toHaveLength(0);
    expect(button.disabled).toBe(false);
  });

  it("runs as the one heavy job and waits for another (AUD-023-UI002)", async () => {
    const jobs = new RecoveryJobGate();
    jobs.setReady(true);
    let finish!: () => void;
    const startupChecks = vi.fn(
      () =>
        new Promise<{ checks: string[]; durationMs: number }>((resolve) => {
          finish = () => resolve({ checks: ["BIP39"], durationMs: 1 });
        }),
    );
    const { section, button, status } = install(startupChecks, jobs);
    section.enabled = true;

    button.click();
    await settle();
    expect(jobs.runningJob).toBe("The full self-test");
    expect(button.disabled).toBe(true);
    await expect(jobs.runHeavy("The MHFE self-test", () => Promise.resolve())).rejects.toThrow(
      /The full self-test is running/u,
    );
    finish();
    await settle();
    expect(jobs.runningJob).toBeNull();
    expect(button.disabled).toBe(false);

    // Another heavy job closes the button, and a press meanwhile starts nothing.
    let release!: () => void;
    const other = jobs.runHeavy(
      "The MHFE self-test",
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    expect(button.disabled).toBe(true);
    button.click();
    await settle();
    expect(startupChecks).toHaveBeenCalledOnce();
    expect(status.textContent).toBe(
      "The MHFE self-test is running. Run the full self-test when it ends.",
    );
    release();
    await other;
    expect(button.disabled).toBe(false);
  });
});

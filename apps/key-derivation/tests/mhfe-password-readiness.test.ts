import { afterEach, expect, it, vi } from "vitest";
import { MhfePasswordTab, type MhfePasswordEngine } from "../src/ui/recovery-mhfe-password.js";
import { RecoveryJobGate, bindJobGate } from "../src/ui/recovery-job-gate.js";
import { RecoveryTestPage, settlePromises } from "./fake-recovery-page.js";

afterEach(() => vi.unstubAllGlobals());

it.each([
  { stage: "package", lost: true, reopened: false },
  { stage: "make", lost: true, reopened: false },
  { stage: "make", lost: false, reopened: false },
  { stage: "make", lost: true, reopened: true },
])(
  "keeps password publication current at $stage (lost=$lost, reopened=$reopened)",
  async ({ stage, lost, reopened }) => {
    const page = new RecoveryTestPage();
    const panel = page.add("mhfe-password-panel");
    for (const suffix of [
      "count",
      "count-label",
      "dice",
      "rolls",
      "result",
      "make",
      "count-field",
      "rolls-field",
    ])
      page.add(
        `mhfe-password-${suffix}`,
        suffix === "make" ? "button" : suffix === "count" ? "input" : "div",
        panel,
      );
    page.add("toggle-mhfe-password-rolls", "button", panel);
    page.require("mhfe-password-count").value = "5";
    const button = document.querySelector<HTMLButtonElement>("#mhfe-password-make")!;
    const jobs = new RecoveryJobGate();
    jobs.setReady(true);
    bindJobGate(jobs, [button], document.createElement("p"));
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const make = vi.fn(async () => {
      if (stage === "make") await pending;
      return { password: "public synthetic password", bits: 64, weak: false, checkWord: false };
    });
    const passwords = vi.fn(async () => {
      if (stage === "package") await pending;
      return { make };
    });
    const engine: MhfePasswordEngine = {
      whenPassed() {},
      passwordParameters: async () => {
        throw new Error("This fixture does not load startup parameters.");
      },
      passwords,
    };
    new MhfePasswordTab({ jobs, writeClipboard: async () => undefined }, engine);
    page.require("mhfe-password-make").click();
    await settlePromises();
    if (lost) jobs.setReady(false);
    if (reopened) jobs.setReady(true);
    if (release === undefined) throw new Error("The pending boundary was not installed.");
    release();
    await settlePromises();
    expect(page.require("mhfe-password-result").querySelectorAll("textarea")).toHaveLength(
      lost ? 0 : 1,
    );
    expect(make).toHaveBeenCalledTimes(stage === "package" && lost ? 0 : 1);
    expect(button.disabled).toBe(lost && !reopened);
    if (lost && !reopened) {
      button.dispatchEvent(new Event("click"));
      await settlePromises();
    }
    expect(passwords).toHaveBeenCalledOnce();
  },
);

// The real workspace and self-test controller; no vectors, KDF, rendering or external writes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installRecoveryWorkspace } from "../src/ui/recovery-workspace.js";
import { MnemoCodeSelfTestTab } from "../src/ui/recovery-mnemocode-self-test.js";
import { fullSelfTestParts } from "../src/ui/full-self-test.js";
import type { RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";
import { RecoveryTestPage, settlePromises } from "./fake-recovery-page.js";

const state = vi.hoisted(() => ({
  context: undefined as RecoveryFeatureContext | undefined,
  run: vi.fn(),
}));
vi.mock("@ckd/recovery-backup/mnemocode-self-test.js", () => ({
  MnemoCodeSelfTestRun: class {
    addFeature(): void {}
    run(): Promise<never> {
      return state.run();
    }
  },
}));
vi.mock("../src/ui/recovery-ui-self-test.js", () => ({ RecoveryUiSelfTest: { run: () => [] } }));
vi.mock("../src/ui/recovery-feature-selection.js", () => ({
  selectedRecoveryFeatures: [
    {
      install(context: RecoveryFeatureContext) {
        state.context = context;
        new MnemoCodeSelfTestTab(context);
      },
    },
  ],
}));

describe("MnemoCode enabled-feature self-test failure", () => {
  let page: RecoveryTestPage;
  const failure = new Error("The enabled card-set known answer differs.");

  beforeEach(() => {
    state.run.mockReset().mockRejectedValue(failure);
    state.context = undefined;
    page = new RecoveryTestPage();
    const workspace = page.add("recovery-workspace");
    for (const id of ["mnemocode-self-test", "mnemocode-reencode-read", "mnemocode-save-cards"])
      page.add(id, "button", workspace).className = "primary";
    for (const id of ["mnemocode-self-test-status", "mnemocode-self-test-result", "recovery-busy"])
      page.add(id, "div", workspace);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function install() {
    const clipboard = vi.fn(async () => undefined);
    const download = vi.fn();
    const derive = vi.fn();
    const workspace = installRecoveryWorkspace({
      registry: {} as never,
      detectTargets: (() => []) as never,
      mnemonicToSeed: (() => new Uint8Array()) as never,
      writeClipboard: clipboard,
      downloadText: download,
      useMnemonicInDeriver: derive,
    });
    workspace.setCryptoEnabled(true);
    return { workspace, clipboard, download, derive };
  }

  it("closes feature controls and old output services, and reports failure to the Deriver", async () => {
    const { workspace, clipboard, download, derive } = install();
    const notify = vi.fn();
    workspace.onSelfTestFailure(notify);
    const oldContext = state.context!;
    await oldContext.writeClipboard("Public test text");
    page.require("mnemocode-self-test").click();
    await settlePromises();
    expect(state.run).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledExactlyOnceWith(failure);
    expect(oldContext.jobs.ready).toBe(false);
    for (const id of ["mnemocode-self-test", "mnemocode-reencode-read", "mnemocode-save-cards"])
      expect(page.require(id).disabled).toBe(true);
    expect(page.require("mnemocode-self-test-status").textContent).toContain(failure.message);
    expect(() => oldContext.writeClipboard("Late public test text")).toThrow("Controls are closed");
    expect(() => oldContext.downloadText("Public test text", "test.txt", "text/plain")).toThrow(
      "Controls are closed",
    );
    expect(() => oldContext.useMnemonicInDeriver("Public test text")).toThrow(
      "Controls are closed",
    );
    expect(clipboard).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
    expect(derive).not.toHaveBeenCalled();
  });

  it("does not run while another job owns the slot or mistake a busy refusal for a self-test failure", async () => {
    const { workspace } = install();
    const notify = vi.fn();
    workspace.onSelfTestFailure(notify);
    let release!: () => void;
    const job = workspace.jobs.runHeavy(
      "Synthetic job",
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    page.require("mnemocode-self-test").dispatchEvent(new Event("click"));
    await settlePromises();
    expect(state.run).not.toHaveBeenCalled();
    expect(state.context!.jobs.ready).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    release();
    await job;
  });

  it("registers the same enabled-feature run in the full self-test and propagates its failure", async () => {
    const before = fullSelfTestParts.parts.length;
    install();
    // Workspace UI known answers come first; the next part is the installed MnemoCode suite.
    await expect(fullSelfTestParts.parts[before + 1]!()).rejects.toBe(failure);
    expect(state.run).toHaveBeenCalledOnce();
  });
});

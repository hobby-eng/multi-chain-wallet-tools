import { action, decodeHarness, fixture, trace } from "./recovery-decode-fixture.js";
import { describe, expect, it, vi } from "vitest";
import { MnemoCodeDecodeTab } from "../src/ui/recovery-mnemocode-decode.js";
import {
  installSecretToggle,
  installTabs,
  renderRecoveredSecret,
} from "../src/ui/recovery-workspace-shared.js";
import { installRecoveryWorkspace } from "../src/ui/recovery-workspace.js";
import { PasswordField } from "../src/ui/recovery-mhfe-fields.js";
import { fullSelfTestParts } from "../src/ui/full-self-test.js";
import { RecoveryUiSelfTest } from "../src/ui/recovery-ui-self-test.js";
import { PHRASE_ONLY_NOTE } from "../src/ui/recovery-feature.js";
import { keyDown, settlePromises } from "./fake-recovery-page.js";
import { installControllerFixture } from "./fake-deriver-controller.js";

/** The real workspace composes actual Decode, manual secret controls and an MHFE PasswordField. */
function workspaceHarness(enable = true) {
  const harness = decodeHarness("direct", false);
  const { page } = harness;
  const root = page.add("recovery-workspace");
  page.add("recovery-busy", "p", root);
  const panels = Array.from({ length: 3 }, (_, index) => {
    const tab = page.add(`workspace-tab-${index}`, "button", root);
    tab.dataset.recoveryTab = "";
    tab.setAttribute("aria-controls", `workspace-panel-${index}`);
    const panel = page.add(`workspace-panel-${index}`, "section", root);
    panel.dataset.recoveryPanel = "";
    return panel;
  });
  const method = page.add("workspace-method", "div", panels[0]!);
  method.className = "backup-method";
  const operations = Array.from({ length: 3 }, (_, index) => {
    const tab = page.add(`workspace-operation-tab-${index}`, "button", method);
    tab.dataset.operationTab = "";
    const panel =
      index === 0
        ? page.require("mnemocode-decode-panel")
        : page.add(`workspace-operation-panel-${index}`, "section", method);
    if (index === 0) method.append(panel);
    panel.dataset.operationPanel = "";
    return panel;
  });
  const manual = page.add("workspace-manual", "article", panels[0]!);
  manual.className = "backup-operation";
  page.add("workspace-manual-phrase", "textarea", manual).value = fixture.phrase;
  const actions = page.add("workspace-manual-actions", "div", manual);
  page.add("workspace-manual-toggle", "button", actions);
  const manualCopy = page.add("workspace-manual-copy", "button", actions);
  manualCopy.className = "secret-copy-action";
  page.add("workspace-password", "input", panels[0]!).type = "password";
  page.add("toggle-workspace-password", "button", panels[0]!);
  const main = installControllerFixture(page, fixture);
  trace.features.push({
    phraseSlot: {
      target: "mnemocode",
      panelId: "workspace-panel-0",
      phraseField: "#workspace-manual-phrase",
      manualBlock: "#workspace-manual",
      linkedNote: PHRASE_ONLY_NOTE,
    },
    install(context) {
      new MnemoCodeDecodeTab(context);
      new PasswordField("workspace-password", "synthetic MHFE password");
      installSecretToggle("#workspace-manual-toggle", "#workspace-manual-phrase", "Show", "Hide");
    },
  });
  const workspace = installRecoveryWorkspace(harness.context);
  if (enable) workspace.setCryptoEnabled(true);
  return { ...harness, workspace, main, panels, operations, manualCopy };
}

describe("AUD-028-SEC005 actual workspace automatic concealment", () => {
  for (const event of ["blur", "hidden"] as const)
    it(`conceals manual, Decode and MHFE password controls on ${event} with parent reveal flags false`, async () => {
      const harness = workspaceHarness();
      await settlePromises();
      const { page } = harness;
      page.require("mnemocode-input").value = fixture.phrase;
      page.require("decode-mnemocode").click();
      action(harness.result, "Show phrase")!.click();
      page.require("workspace-manual-toggle").click();
      page.require("toggle-workspace-password").click();
      const output = harness.result.querySelector("textarea")!;
      const copy = action(harness.result, "Copy")!;
      const diagnostic = harness.result.querySelector(".recovered-seed-diagnostic")!;
      expect(output.classList.contains("concealed")).toBe(false);
      expect(copy.disabled).toBe(false);
      expect(diagnostic.hidden).toBe(false);
      expect(page.require("workspace-password").type).toBe("text");
      expect(harness.manualCopy.disabled).toBe(false);
      // Neither main reveal control was pressed; recovery must own its own local state.
      page.hideOrBlur(event);
      expect(output.classList.contains("concealed")).toBe(true);
      expect(copy.disabled).toBe(true);
      expect(diagnostic.hidden).toBe(true);
      expect(page.require("workspace-password").type).toBe("password");
      expect(page.require("workspace-manual-phrase").classList.contains("concealed")).toBe(true);
      expect(page.require("workspace-manual-toggle").getAttribute("aria-pressed")).toBe("false");
      expect(harness.manualCopy.disabled).toBe(true);
      copy.dispatchEvent(new Event("click"));
      expect(harness.context.writeClipboard).not.toHaveBeenCalled();
      action(harness.result, "Show phrase")!.click();
      expect(output.classList.contains("concealed")).toBe(false);
      expect(copy.disabled).toBe(false);
      // The linked-source handler still owns its reference, independently of manual controls.
      harness.workspace.useSource(
        {
          label: "Public vector source",
          read: () => ({ mnemonic: fixture.phrase, passphrase: "" }),
        },
        "mnemocode",
      );
      const linked = page.querySelector('[data-linked-source-for="mnemocode"]')!;
      action(linked, "Show phrase")!.click();
      expect(linked.querySelector("textarea")!.hidden).toBe(false);
      page.hideOrBlur(event);
      expect(linked.querySelector("textarea")!.hidden).toBe(true);
      expect(linked.querySelector("textarea")!.value).toBe("");
    });

  it("runs the same small UI checks at startup enable and in the full self-test", async () => {
    const check = vi.spyOn(RecoveryUiSelfTest, "run");
    const harness = workspaceHarness();
    expect(check).toHaveBeenCalledOnce();
    expect(harness.workspace.jobs).toHaveProperty("ready", true);
    const rows = await fullSelfTestParts.parts.at(-1)!();
    expect(rows.map((row) => row.name)).toEqual([
      "Recovery tab keyboard navigation",
      "Recovery input and result ownership",
      "Recovery automatic concealment and Copy gating",
    ]);
    expect(check).toHaveBeenCalledTimes(2);
    expect(harness.page.querySelectorAll("[data-test-tab]")).toHaveLength(0);
  });

  it("leaves a phrase the person revealed on the page revealed while the full self-test runs", async () => {
    const harness = workspaceHarness();
    const result = harness.page.createElement("div");
    harness.page.body.append(result);
    renderRecoveredSecret(
      result as unknown as HTMLElement,
      "public revealed test text",
      { reveal: "Show", hide: "Hide", copy: "Copy test" },
      async () => undefined,
    );
    const [reveal, copy] = result.querySelectorAll("button");
    reveal!.click();
    expect(copy!.disabled).toBe(false);
    await fullSelfTestParts.parts.at(-1)!();
    // The check conceals its own fixture only, not the page's revealed results.
    expect(copy!.disabled).toBe(false);
    expect(result.querySelector("textarea")!.classList.contains("concealed")).toBe(false);
  });

  it("keeps the recovery gate closed when the UI startup check fails", () => {
    const harness = workspaceHarness(false);
    expect(harness.page.require("decode-mnemocode").disabled).toBe(true);
    vi.spyOn(RecoveryUiSelfTest, "run").mockImplementation(() => {
      throw new Error("Synthetic lifecycle failure");
    });
    expect(() => harness.workspace.setCryptoEnabled(true)).toThrow("Synthetic lifecycle failure");
    expect(harness.page.require("decode-mnemocode").disabled).toBe(true);
    expect(harness.workspace.jobs).toHaveProperty("ready", false);
  });
});

describe("AUD-028-UI001 actual workspace keyboard tabs", () => {
  for (const kind of ["recovery", "operation"] as const) {
    for (const { key, start, next } of [
      { key: "ArrowRight", start: 0, next: 1 },
      { key: "ArrowLeft", start: 0, next: 2 },
      { key: "Home", start: 2, next: 0 },
      { key: "End", start: 0, next: 2 },
    ])
      it(`${kind} tabs select, show and focus the ${key} destination`, () => {
        const harness = workspaceHarness();
        const panels = kind === "recovery" ? harness.panels : harness.operations;
        const tabs = panels.map((_, index) =>
          harness.page.require(
            kind === "recovery" ? `workspace-tab-${index}` : `workspace-operation-tab-${index}`,
          ),
        );
        tabs[start]!.click();
        tabs[start]!.focus();
        const event = keyDown(tabs[start]!, key);
        expect(event.defaultPrevented).toBe(true);
        expect(tabs.map((tab) => tab.tabIndex)).toEqual(
          tabs.map((_, index) => (index === next ? 0 : -1)),
        );
        expect(tabs[next]!.getAttribute("aria-selected")).toBe("true");
        expect(harness.page.activeElement).toBe(tabs[next]);
        expect(panels.map((panel) => panel.hidden)).toEqual(
          panels.map((_, index) => index !== next),
        );
      });
  }

  it("handles disabled, empty and unrelated-key cases without changing the selection", () => {
    const harness = workspaceHarness();
    const tabs = harness.panels.map((_, index) => harness.page.require(`workspace-tab-${index}`));
    tabs[1]!.disabled = true;
    expect(keyDown(tabs[0]!, "ArrowRight").defaultPrevented).toBe(true);
    expect(harness.page.activeElement).toBe(tabs[2]);
    tabs[1]!.dispatchEvent(new Event("click"));
    expect(tabs[2]!.tabIndex).toBe(0);
    expect(keyDown(tabs[2]!, "Escape").defaultPrevented).toBe(false);
    const empty = harness.page.add("empty-tabs");
    expect(() => installTabs(empty as unknown as ParentNode, "button", "section")).not.toThrow();
    for (const tab of tabs) tab.disabled = true;
    installTabs(
      harness.page as unknown as ParentNode,
      "[data-recovery-tab]",
      "[data-recovery-panel]",
    );
    expect(tabs.every((tab) => tab.tabIndex === -1)).toBe(true);
    expect(harness.panels.every((panel) => panel.hidden)).toBe(true);
  });
});

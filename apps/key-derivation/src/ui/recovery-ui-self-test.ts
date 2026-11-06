import type { SelfTestRow } from "./full-self-test.js";
import { InputRevision } from "./recovery-input-revision.js";
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";
import { installTabs, renderRecoveredSecret } from "./recovery-workspace-shared.js";

class RecoveryUiSelfTestError extends Error {
  readonly code = "recovery.ui-self-test.failed";
  constructor(detail: string) {
    super(`Recovery UI self-test failed: ${detail}.`);
    this.name = "RecoveryUiSelfTestError";
  }
}

/** Millisecond UI ownership checks: synthetic text only, no seed computation or clipboard. */
export class RecoveryUiSelfTest {
  /** Exercise UI invariants with public fixture text; fail with a code and always remove the fixture. */
  static run(this: void): readonly SelfTestRow[] {
    const fixture = document.createElement("section");
    fixture.hidden = true;
    document.body.append(fixture);
    try {
      RecoveryUiSelfTest.#checkTabs(fixture);
      RecoveryUiSelfTest.#checkResult(fixture);
      return [
        { name: "Recovery tab keyboard navigation" },
        { name: "Recovery input and result ownership" },
        { name: "Recovery automatic concealment and Copy gating" },
      ];
    } finally {
      fixture.remove();
    }
  }

  static #require(passed: boolean, detail: string): asserts passed {
    if (!passed) throw new RecoveryUiSelfTestError(detail);
  }

  static #checkTabs(fixture: HTMLElement): void {
    const tabs = document.createElement("div");
    const buttons = Array.from({ length: 3 }, () => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.testTab = "";
      tabs.append(button);
      return button;
    });
    const panels = buttons.map(() => {
      const panel = document.createElement("section");
      panel.dataset.testPanel = "";
      tabs.append(panel);
      return panel;
    });
    fixture.append(tabs);
    const [first, disabled, last] = buttons;
    const [, , lastPanel] = panels;
    RecoveryUiSelfTest.#require(
      first !== undefined &&
        disabled !== undefined &&
        last !== undefined &&
        lastPanel !== undefined,
      "tab fixture controls",
    );
    disabled.disabled = true;
    installTabs(tabs, "[data-test-tab]", "[data-test-panel]");
    const key = new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true });
    first.dispatchEvent(key);
    RecoveryUiSelfTest.#require(
      key.defaultPrevented && last.tabIndex === 0 && !lastPanel.hidden,
      "arrow navigation must skip a disabled tab and select its panel",
    );
    disabled.dispatchEvent(new Event("click"));
    RecoveryUiSelfTest.#require(
      last.tabIndex === 0,
      "a disabled tab must not replace the selection",
    );
  }

  static #checkResult(fixture: HTMLElement): void {
    const codes = new EventTarget();
    const dates = new EventTarget();
    const inputs = new InputRevision(codes, () => undefined);
    inputs.watch(dates);
    const current = inputs.capture();
    let copied = 0;
    let used = 0;
    const result = document.createElement("div");
    fixture.append(result);
    renderRecoveredSecret(
      result,
      "Recovery UI public test text",
      { reveal: "Show test", hide: "Hide test", copy: "Copy test" },
      async () => {
        copied += 1;
      },
      undefined,
      () => {
        used += 1;
      },
      undefined,
      current,
    );
    const [show, copy, use] = [...result.querySelectorAll<HTMLButtonElement>("button")];
    const output = result.querySelector<HTMLTextAreaElement>("textarea");
    RecoveryUiSelfTest.#require(
      show !== undefined && copy !== undefined && use !== undefined && output !== null,
      "result fixture controls",
    );
    show.click();
    copy.click();
    use.click();
    RecoveryUiSelfTest.#require(
      copied === 1 && used === 1 && !copy.disabled,
      "current result actions",
    );
    // Only the fixture: a full self-test must not hide what the person has revealed on the page.
    RecoverySecretLifecycle.install(document).conceal(fixture);
    RecoveryUiSelfTest.#require(
      output.classList.contains("concealed") && copy.disabled,
      "automatic concealment must close Copy",
    );
    show.click();
    dates.dispatchEvent(new Event("input"));
    copy.dispatchEvent(new Event("click"));
    use.dispatchEvent(new Event("click"));
    RecoveryUiSelfTest.#require(
      !current() && copied === 1 && used === 1,
      "old-date result actions",
    );
    const newer = inputs.capture();
    inputs.capture();
    RecoveryUiSelfTest.#require(!newer(), "a newer operation must revoke an older capture");
  }
}

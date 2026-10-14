// Coordinator only: actual BackupCheckSection with bounded deferred synthetic checks.
import assert from "node:assert/strict";
import { browserStub, deferred, flush, runProbe, sourceLoader } from "./deriver-vm-support.mjs";

async function caseFor(ordering) {
  const browser = browserStub();
  const first = deferred();
  const second = deferred();
  const requests = [];
  const prefix = "mnemocode-split";
  const result = browser.field(`${prefix}-check-result`);
  const load = sourceLoader(browser, {
    "./recovery-workspace-shared.js": {
      required: browser.field,
      installSecretToggle() {},
      paragraph(text, className) {
        const element = browser.document.createElement("p");
        element.textContent = text;
        element.className = className;
        return element;
      },
    },
  });
  try {
    const { BackupCheckSection } = await load("recovery-mnemocode-backup-check.ts");
    const section = new BackupCheckSection(prefix);
    const original = {
      dated: true,
      check: (written) => {
        requests.push(written);
        return requests.length === 1 ? first.promise : second.promise;
      },
    };
    section.offer(original);
    browser.field(`${prefix}-check-backup`).value = "synthetic written backup A";
    browser.field(`${prefix}-check-dates`).value = "2000-01-01";
    browser.field(`${prefix}-check`).click();
    assert.equal(requests.length, 1, "Actual section must dispatch the first check");
    assert.equal(requests[0].backup, "synthetic written backup A");
    if (ordering === "other-original") section.offer({ ...original });
    if (ordering === "edit" || ordering === "newer-run") {
      browser.field(`${prefix}-check-backup`).value = "synthetic written backup B";
      browser.field(`${prefix}-check-backup`).emit("input");
      browser.field(`${prefix}-check-dates`).value = "2001-01-01";
      browser.field(`${prefix}-check-dates`).emit("input");
      assert.equal(result.textContent, "", "Input handler must first clear the verdict");
    }
    if (ordering === "newer-run") {
      browser.field(`${prefix}-check`).click();
      assert.equal(requests.length, 2, "The same original must permit another check");
      assert.equal(requests[1].backup, "synthetic written backup B");
      second.resolve({ verdict: "other-phrase", message: "CURRENT synthetic mismatch", notes: [] });
      await flush();
      assert.ok(result.textContent.includes("CURRENT synthetic mismatch"));
    }
    first.resolve({ verdict: "restores", message: "OLD synthetic matches", notes: [] });
    await flush();
    if (ordering === "none")
      return {
        unchangedInputShowsGreen: result.textContent.includes("✓ OLD synthetic matches"),
        onlyOneVerdict: result.children.length === 1,
      };
    if (ordering === "newer-run")
      return {
        latestVerdictPreserved: result.textContent.includes("CURRENT synthetic mismatch"),
        obsoleteSuccessDropped: !result.textContent.includes("OLD synthetic matches"),
        onlyLatestVerdict: result.children.length === 1,
      };
    return {
      obsoleteVerdictDropped: result.textContent === "",
      noGreenForDifferentInput: !result.textContent.includes("✓"),
    };
  } finally {
    first.resolve({ verdict: "unreadable", message: "Synthetic cleanup", notes: [] });
    second.resolve({ verdict: "unreadable", message: "Synthetic cleanup", notes: [] });
    await flush();
    browser.dispose();
  }
}

await runProbe("MnemoCode written backup verdict ownership", [
  ["unchanged-input control", () => caseFor("none")],
  ["different offered original control", () => caseFor("other-original")],
  ["edit while written-backup check waits", () => caseFor("edit")],
  ["older success after newer mismatch for same original", () => caseFor("newer-run")],
]);

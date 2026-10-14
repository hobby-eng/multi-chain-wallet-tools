// AUD-023 remediation re-run of AUD-022-API006: the real BackupCheckSection with deferred synthetic
// BackupCheck results; copied from AUD-022-harnesses/deriver-backup-check.mjs and extended with the
// orderings AUD-022's "required verification" names. The repository test
// apps/key-derivation/tests/recovery-mnemocode-backup-check.test.ts adds the real yielding SSKR
// share check; this probe only owns the page-side ordering.
import assert from "node:assert/strict";
import {
  browserStub,
  deferred,
  flush,
  runProbe,
  sharedReplacement,
  sourceLoader,
} from "./remediation-vm-support.mjs";

const PREFIX = "mnemocode-split";

async function setup() {
  const browser = browserStub();
  const replies = [];
  const requests = [];
  const load = sourceLoader(browser, {
    "./recovery-workspace-shared.js": sharedReplacement(browser),
  });
  const { BackupCheckSection } = await load("recovery-mnemocode-backup-check.ts");
  const section = new BackupCheckSection(PREFIX);
  const original = {
    dated: true,
    check: (written) => {
      requests.push(written);
      const reply = deferred();
      replies.push(reply);
      return reply.promise;
    },
  };
  section.offer(original);
  const field = (name) => browser.field(`${PREFIX}-check-${name}`);
  field("backup").value = "synthetic written backup A";
  field("dates").value = "2000-01-01";
  const result = browser.field(`${PREFIX}-check-result`);
  return {
    browser,
    section,
    original,
    requests,
    replies,
    result,
    press: () => browser.field(`${PREFIX}-check`).click(),
    edit(name, value) {
      field(name).value = value;
      field(name).emit("input");
    },
  };
}

const OLD_OK = { verdict: "restores", message: "OLD synthetic matches", notes: [] };
const NEW_MISMATCH = { verdict: "other-phrase", message: "CURRENT synthetic mismatch", notes: [] };

async function run(ordering) {
  const page = await setup();
  try {
    page.press();
    assert.equal(page.requests.length, 1);
    assert.equal(page.requests[0].backup, "synthetic written backup A");
    if (ordering === "control") {
      page.replies[0].resolve(OLD_OK);
      await flush();
      return {
        unchangedShowsGreen: page.result.textContent.includes("✓ OLD synthetic matches"),
        oneVerdict: page.result.children.length === 1,
      };
    }
    if (ordering === "edit-backup" || ordering === "edit-dates") {
      page.edit(ordering === "edit-backup" ? "backup" : "dates", "synthetic edit");
      page.replies[0].resolve(OLD_OK);
      await flush();
      return { obsoleteDropped: page.result.textContent === "" };
    }
    if (ordering === "failure-after-edit") {
      page.edit("backup", "synthetic written backup B");
      page.replies[0].reject(new Error("Synthetic library failure"));
      await flush();
      return { obsoleteFailureDropped: page.result.textContent === "" };
    }
    if (ordering === "other-original" || ordering === "no-original") {
      page.section.offer(ordering === "other-original" ? { ...page.original } : undefined);
      page.replies[0].resolve(OLD_OK);
      await flush();
      return { obsoleteDropped: page.result.textContent === "" };
    }
    if (ordering === "newer-run-first") {
      page.edit("backup", "synthetic written backup B");
      page.press();
      page.replies[1].resolve(NEW_MISMATCH);
      await flush();
      page.replies[0].resolve(OLD_OK);
      await flush();
      return {
        latestKept: page.result.textContent.includes("CURRENT synthetic mismatch"),
        oldDropped: !page.result.textContent.includes("OLD synthetic matches"),
        oneVerdict: page.result.children.length === 1,
      };
    }
    if (ordering === "older-run-first") {
      // A second press on the same text: the first press's verdict is obsolete even if first.
      page.press();
      page.replies[0].resolve(OLD_OK);
      await flush();
      const firstShowedNothing = page.result.textContent === "";
      page.replies[1].resolve(NEW_MISMATCH);
      await flush();
      return {
        firstShowedNothing,
        latestShown: page.result.textContent.includes("CURRENT synthetic mismatch"),
        oneVerdict: page.result.children.length === 1,
      };
    }
    if (ordering === "edit-after-verdict") {
      page.replies[0].resolve(OLD_OK);
      await flush();
      const shown = page.result.textContent.includes("OLD synthetic matches");
      page.edit("backup", "synthetic written backup B");
      return { shown, removedOnEdit: page.result.textContent === "" };
    }
    throw new Error(`Unknown ordering ${ordering}`);
  } finally {
    for (const reply of page.replies) reply.resolve(OLD_OK);
    await flush();
    page.browser.dispose();
  }
}

await runProbe("Written backup verdict ownership (AUD-022-API006 re-run)", [
  ["unchanged-input control", () => run("control")],
  ["backup edit while the check waits (AUD-022)", () => run("edit-backup")],
  ["dates edit while the check waits", () => run("edit-dates")],
  ["failure after an edit", () => run("failure-after-edit")],
  ["another original offered while the check waits", () => run("other-original")],
  ["no original offered while the check waits", () => run("no-original")],
  ["older success after a newer mismatch (AUD-022)", () => run("newer-run-first")],
  ["older press finishes first, newer press later", () => run("older-run-first")],
  ["edit after the verdict", () => run("edit-after-verdict")],
]);

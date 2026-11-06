import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { MnemoCodeEncodeTab } from "../src/ui/recovery-mnemocode-encode.js";
import { RecoveryTestPage } from "./fake-recovery-page.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import type { RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";

vi.mock("@ckd/recovery-backup/fingerprint.js", () => ({
  fingerprintWithoutPassphrase: () => "00000000",
}));
vi.mock("../src/ui/recovery-mnemocode-backup-check.js", () => ({
  BackupCheckSection: class {
    offer(): void {}
  },
}));
vi.mock("../src/ui/recovery-workspace-shared.js", async (original) => ({
  ...(await original<typeof import("../src/ui/recovery-workspace-shared.js")>()),
  installFieldImports: () => undefined,
}));

beforeAll(async () => {
  await loadMnemoCode();
});

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const MASKED = "wool abuse actual wool abuse actual wool abuse actual wool abuse congress";

function page() {
  const page = new RecoveryTestPage();
  const root = page.add("operation");
  root.className = "backup-operation";
  root.dataset.secretScope = "";
  for (const id of ["mnemocode-encode-mode", "mnemocode-encode-format"])
    page.add(id, "select", root);
  page.require("mnemocode-encode-mode").value = "direct";
  page.require("mnemocode-encode-format").value = "colors";
  for (const id of ["mnemocode-encode-dates", "mnemocode-source"]) page.add(id, "textarea", root);
  for (const id of [
    "mnemocode-encode-dates-field",
    "mnemocode-encode-result",
    "mnemocode-encode-mask-note",
    "mnemocode-show-masked-words-field",
    "mnemocode-mode-help",
    "mnemocode-format-help",
  ])
    page.add(id, "div", root);
  for (const id of ["mnemocode-mode-help", "mnemocode-format-help"])
    page.add(`${id}-popover`, "div", page.require(id)).className = "recovery-help-popover";
  page.add("mnemocode-show-masked-words", "input", root).type = "checkbox";
  page.add("encode-mnemocode", "button", root);
  page.add("toggle-mnemocode-created", "button", root);
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  new MnemoCodeEncodeTab({
    jobs,
    readMnemonic: () => PHRASE,
    writeClipboard: vi.fn(),
    mnemonicToSeed: vi.fn(),
    downloadText: vi.fn(),
  } as unknown as RecoveryFeatureContext);
  page.require("mnemocode-encode-mode").value = "seedshift";
  page.require("mnemocode-encode-mode").dispatchEvent(new Event("change"));
  page.require("mnemocode-encode-format").value = "colors";
  page.require("mnemocode-encode-dates").value = "23-09-2026";
  return page;
}

describe("Ordinary Encode's separate masked-English opt-in", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows only the selected code representation by default", () => {
    const p = page();
    p.require("encode-mnemocode").click();
    expect(p.require("mnemocode-encode-result").textContent).toBe("");
    expect(p.require("mnemocode-encode-result").querySelectorAll("article")).toHaveLength(1);
    expect(p.require("mnemocode-show-masked-words").checked).toBe(false);
  });

  it("adds concealed masked words only after opt-in and clears them on changing the choice", () => {
    const p = page();
    p.require("mnemocode-show-masked-words").checked = true;
    p.require("encode-mnemocode").click();
    const articles = p.require("mnemocode-encode-result").querySelectorAll("article");
    expect(articles).toHaveLength(2);
    const words = articles.at(-1)?.querySelector(".share-secret");
    expect(words?.textContent).toBe(MASKED);
    expect(words?.classList.contains("concealed")).toBe(true);
    p.require("mnemocode-show-masked-words").dispatchEvent(new Event("change"));
    expect(p.require("mnemocode-encode-result").children).toHaveLength(0);
    expect(words?.textContent).toBe("");
  });

  it("never duplicates the words when English is already the selected representation", () => {
    const p = page();
    p.require("mnemocode-encode-format").value = "english";
    p.require("mnemocode-show-masked-words").checked = true;
    p.require("encode-mnemocode").click();
    expect(p.require("mnemocode-encode-result").querySelectorAll("article")).toHaveLength(1);
    expect(p.require("mnemocode-encode-result").querySelector(".share-secret")?.textContent).toBe(
      MASKED,
    );
  });

  it("hides the after-Seedshift choice for Direct", () => {
    const p = page();
    p.require("mnemocode-encode-mode").value = "direct";
    p.require("mnemocode-encode-mode").dispatchEvent(new Event("change"));
    expect(p.require("mnemocode-show-masked-words").disabled).toBe(true);
    expect(p.require("mnemocode-show-masked-words-field").hidden).toBe(true);
  });

  it.each(["unicode", "colors-unicode"])(
    "retires both joined and separated %s codes when the source changes",
    (format) => {
      const p = page();
      p.require("mnemocode-encode-mode").value = "direct";
      p.require("mnemocode-encode-format").value = format;
      p.require("encode-mnemocode").click();
      const result = p.require("mnemocode-encode-result");
      const joined = result.querySelector(".share-secret");
      const separated = result.querySelector(".apart-codes");
      expect(joined?.textContent.length).toBeGreaterThan(0);
      expect(separated?.textContent.length).toBeGreaterThan(0);
      p.require("mnemocode-source").dispatchEvent(new Event("input"));
      expect(joined?.textContent).toBe("");
      expect(separated?.textContent).toBe("");
    },
  );
});

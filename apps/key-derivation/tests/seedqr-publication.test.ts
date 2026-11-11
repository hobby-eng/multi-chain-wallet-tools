import { QrImageBoundary } from "../../../test/support/qr-image-boundary.js";
// Actual installer, SeedQR/QR encoding and download helper; only browser rendering is passive.
import { afterEach, expect, it, vi } from "vitest";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";
import { createCoinRegistry } from "@ckd/coins/registry-base.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { recoveryFeature } from "../src/ui/recovery-seedqr.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import type { RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";
import { settlePromises } from "./fake-recovery-page.js";

// The SeedQR tab of a build without MnemoCode: the build's selection gives it no hidden form
// (build-key-derivation-html.mjs). The hidden form has its browser case, seedqr-hidden.
vi.mock("../src/ui/recovery-seedqr-hidden-selection.js", () => ({ hiddenSeedQr: undefined }));

const PHRASE = `${"abandon ".repeat(11)}about`;

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(format: string) {
  vi.useFakeTimers();
  const page = new PassiveQrPage();
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  for (const id of [
    "toggle-seedqr-source",
    "seedqr-source",
    "toggle-seedqr-created",
    "toggle-seedqr-payload",
    "seedqr-payload",
    "seedqr-restore-format",
    "seedqr-restore-result",
    "seedqr-create-result",
    "create-seedqr",
    "seedqr-format",
    "restore-seedqr",
    "clear-all",
  ])
    page.add(id, id.includes("source") || id === "seedqr-payload" ? "textarea" : "button");
  page.require("seedqr-payload").after = (...nodes) => page.body.append(...nodes);
  page.require("seedqr-format").value = format;
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:public-qr-fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const context: RecoveryFeatureContext = {
    jobs,
    registry: createCoinRegistry([]),
    detectTargets: () => [],
    linkedValue: () => null,
    linkedSourceRevealed: () => false,
    readMnemonic: () => {
      jobs.assertReady();
      return PHRASE;
    },
    mnemonicToSeed,
    writeClipboard: async () => {
      jobs.assertReady();
    },
    downloadText: () => {
      throw new Error("PNG export uses the actual blob download helper.");
    },
    useMnemonicInDeriver: () => undefined,
  };
  recoveryFeature.install(context);
  page.require("create-seedqr").click();
  const result = page.require("seedqr-create-result");
  const trigger = result.querySelector(".qr-trigger");
  if (trigger === null) throw new Error("The real SeedQR installer did not produce its card.");
  return { page, jobs, result, trigger };
}

it.each(["standard", "compact"])("keeps a concealed %s SeedQR closed", (format) => {
  const { page, trigger } = setup(format);
  trigger.click();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(page.canvases).toHaveLength(0);
});

it.each(["standard", "compact"])("revokes a pending %s SeedQR PNG on gate loss", async (format) => {
  const { page, jobs, result, trigger } = setup(format);
  page.require("toggle-seedqr-created").click();
  trigger.click();
  result.querySelector(".payment-qr-save")!.click();
  expect(page.pending).toHaveLength(1);
  jobs.setReady(false);
  page.pending[0]!(new Blob(["public synthetic PNG"], { type: "image/png" }));
  await settlePromises();
  expect(page.downloads).toEqual([]);
  for (const canvas of page.canvases) expect([canvas.width, canvas.height]).toEqual([0, 0]);
});

it("still downloads a current and revealed SeedQR", async () => {
  const { page, result, trigger } = setup("standard");
  page.require("toggle-seedqr-created").click();
  trigger.click();
  result.querySelector(".payment-qr-save")!.click();
  page.pending[0]!(new Blob(["public synthetic PNG"], { type: "image/png" }));
  await settlePromises();
  expect(page.downloads).toEqual(["standard-seedqr-qr.png"]);
});

it("closes an open SeedQR when Hide payload is activated without a pointer event", () => {
  const { page, result, trigger } = setup("standard");
  page.require("toggle-seedqr-created").click();
  trigger.click();
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  const popover = result.querySelector(".payment-qr-popover")!;
  expect(popover.matches(":popover-open")).toBe(true);
  // Element.click represents keyboard activation too; no outside pointer event is dispatched.
  page.require("toggle-seedqr-created").click();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(popover.matches(":popover-open")).toBe(false);
});

it.each(["source", "format", "clear", "linked", "gate cycle"])(
  "revokes a pending SeedQR after %s changes",
  async (reason) => {
    const { page, jobs, result, trigger } = setup("standard");
    page.require("seedqr-source").value = PHRASE;
    page.require("toggle-seedqr-created").click();
    trigger.click();
    result.querySelector(".payment-qr-save")!.click();
    if (reason === "source") {
      page.require("seedqr-source").value = "";
      page.require("seedqr-source").dispatchEvent(new Event("input", { bubbles: true }));
    } else if (reason === "format") {
      page.require("seedqr-format").value = "compact";
      page.require("seedqr-format").dispatchEvent(new Event("change", { bubbles: true }));
    } else if (reason === "clear") page.require("clear-all").click();
    else if (reason === "linked")
      page.dispatchEvent(new CustomEvent("recovery-source-change", { detail: "seedqr" }));
    else {
      jobs.setReady(false);
      jobs.setReady(true);
    }
    page.pending[0]!(new Blob(["public synthetic PNG"], { type: "image/png" }));
    await settlePromises();
    expect(page.downloads).toEqual([]);
  },
);

it.each([false, true])(
  "actual SeedQR import respects Clear=%s before its format callback",
  async (cleared) => {
    const { page } = setup("standard");
    const { pending } = new QrImageBoundary(page);
    const target = page.require("seedqr-payload");
    target.value = "existing public SeedQR";
    page.require("seedqr-restore-format").value = "compact";
    const chooser = page.body.querySelectorAll("input").find((input) => input.type === "file");
    if (chooser === undefined) throw new Error("The actual SeedQR FileChoice input is missing.");
    Object.defineProperty(chooser, "files", {
      value: [new File(["synthetic bitmap boundary"], "public.jpg", { type: "image/jpeg" })],
    });
    chooser.dispatchEvent(new Event("change"));
    await settlePromises();
    if (cleared) page.require("clear-all").click();
    pending[0]!.release("public imported standard text");
    await settlePromises();
    expect(target.value).toBe(cleared ? "existing public SeedQR" : "public imported standard text");
    expect(page.require("seedqr-restore-format").value).toBe(cleared ? "compact" : "standard");
    expect(pending[0]!.close).toHaveBeenCalledOnce();
  },
);

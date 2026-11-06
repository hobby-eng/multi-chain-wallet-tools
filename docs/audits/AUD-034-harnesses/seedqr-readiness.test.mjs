// Real SeedQR installer, gate, encoder, QR action and download helper. No native rendering/export.
import { afterEach, expect, it, vi } from "vitest";
import { recoveryFeature } from "../../../apps/key-derivation/src/ui/recovery-seedqr.ts";
import { RecoveryJobGate } from "../../../apps/key-derivation/src/ui/recovery-job-gate.ts";
import { RecoveryTestPage, settlePromises } from "../../../apps/key-derivation/tests/fake-recovery-page.ts";

class PassivePage extends RecoveryTestPage {
  documentElement = { namespaceURI: "http://www.w3.org/1999/xhtml" };
  pending = [];
  downloads = [];
  constructor() { super(); Object.assign(this.window, { innerWidth: 1200, innerHeight: 800 }); }
  createElement(tag) {
    const element = super.createElement(tag);
    Object.defineProperty(element, "isConnected", { get: () => this.body.contains(element) });
    let open = false;
    const matches = element.matches.bind(element);
    Object.assign(element, {
      matches: (selector) => selector === ":popover-open" ? open : selector === ":hover" ? false : matches(selector),
      showPopover: () => { open = true; }, hidePopover: () => { open = false; },
      getBoundingClientRect: () => ({ width: 100, height: 100, top: 0, right: 100, bottom: 100 }),
    });
    if (tag === "canvas") Object.assign(element, { width: 0, height: 0, getContext: () => ({ fillRect() {} }), toBlob: (callback) => this.pending.push(callback) });
    if (tag === "a") element.click = () => this.downloads.push(element.download);
    return element;
  }
  createElementNS(_namespace, tag) { return this.createElement(tag); }
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("revokes pending SeedQR image publication when the real readiness gate closes", async () => {
  vi.useFakeTimers();
  const page = new PassivePage();
  const jobs = new RecoveryJobGate(); jobs.setReady(true);
  for (const id of ["toggle-seedqr-source", "seedqr-source", "toggle-seedqr-created", "toggle-seedqr-payload", "seedqr-payload", "seedqr-restore-format", "seedqr-restore-result", "seedqr-create-result", "create-seedqr", "seedqr-format", "restore-seedqr"]) page.add(id, id.includes("source") || id === "seedqr-payload" ? "textarea" : "button");
  page.require("seedqr-format").value = "standard";
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:public-synthetic-qr");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  recoveryFeature.install({ jobs, linkedValue: () => null, mnemonicToSeed: () => new Uint8Array(64), readMnemonic: () => { jobs.assertReady(); return `${"abandon ".repeat(11)}about`; }, writeClipboard: async () => { jobs.assertReady(); } });
  page.require("create-seedqr").click();
  const result = page.require("seedqr-create-result");
  const trigger = result.querySelector(".qr-trigger");
  if (trigger === null) throw new Error(`SeedQR fixture did not produce a real card: ${result.textContent}`);
  trigger.click();
  result.querySelector(".payment-qr-save").click();
  expect(page.pending).toHaveLength(1);
  jobs.setReady(false);
  page.pending[0](new Blob(["public passive PNG"], { type: "image/png" }));
  await settlePromises();
  expect(page.downloads).toEqual([]);
});

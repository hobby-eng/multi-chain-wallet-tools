import { vi } from "vitest";
import { PassiveQrPage } from "../../../test/support/qr-page.js";
import { recoveryFeature } from "../src/ui/recovery-slip39.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { createCoinRegistry } from "@ckd/coins/registry-base.js";
import type { RecoveryFeatureContext } from "../src/ui/recovery-workspace-shared.js";

/** Actual SLIP-39 installer with passive browser edges and explicit native input elements. */
export class Slip39Page {
  readonly page = new PassiveQrPage();
  readonly jobs = new RecoveryJobGate();
  readonly context: RecoveryFeatureContext;

  constructor(shares: string) {
    const create = this.page.add("slip39-create-panel", "section");
    const restore = this.page.add("slip39-restore-panel", "section");
    for (const [panel, fields] of [
      [create, ["slip39-source-mnemonic", "slip39-create-passphrase"]],
      [restore, ["slip39-shares", "slip39-restore-passphrase"]],
    ] as const)
      for (const id of fields)
        this.page.add(id, id.includes("passphrase") ? "input" : "textarea", panel);
    for (const id of ["toggle-slip39-source", "toggle-slip39-created", "create-slip39-shares"])
      this.page.add(id, "button", create);
    for (const id of ["toggle-slip39-shares", "restore-slip39-shares", "slip39-restore-stop"])
      this.page.add(id, "button", restore);
    this.page.require("restore-slip39-shares").textContent = "Restore phrase";
    this.page.add("slip39-create-result", "div", create);
    this.page.add("slip39-restore-result", "div", restore);
    this.page.add("clear-all", "button");
    this.page.require("slip39-shares").value = shares;
    vi.stubGlobal("__SLIP39_WORKER_SOURCE__", "Public passive worker fixture");
    this.jobs.setReady(true);
    this.context = {
      jobs: this.jobs,
      registry: createCoinRegistry([]),
      detectTargets: () => [],
      readMnemonic: () => "",
      linkedValue: () => null,
      linkedSourceRevealed: () => false,
      writeClipboard: async () => undefined,
      downloadText: () => undefined,
      useMnemonicInDeriver: () => undefined,
      mnemonicToSeed: () => new Uint8Array(64),
    };
    recoveryFeature.install(this.context);
  }

  get result() {
    return this.page.require("slip39-restore-result");
  }
  restore(): void {
    this.page.require("restore-slip39-shares").click();
  }
}

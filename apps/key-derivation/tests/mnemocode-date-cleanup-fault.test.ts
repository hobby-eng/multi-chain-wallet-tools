// Actual share controllers and import revisions; passive shared worker/crypto ports do not run.
import { expect, it, vi } from "vitest";
import { FieldImportRevision } from "@ckd/ui/field-import-revision.js";
import { REPAIR, RESTORE, page, trace } from "./mnemocode-share-repair-fixture.js";

it.each(["restore", "repair"])(
  "revokes a pending %s dates import when cleanup refuses a mode transition",
  (operation) => {
    const prefix = operation === "restore" ? RESTORE : REPAIR;
    const root = page.require(
      operation === "restore" ? `${RESTORE}-panel` : "mnemocode-forgotten-share",
    );
    if (operation === "repair") trace.walletChoice = "fingerprint";
    const direct = page.add(`${prefix}-mode-direct`, "input", root);
    const masked = page.add(`${prefix}-mode-seedshift`, "input", root);
    for (const radio of [direct, masked]) {
      radio.type = "radio";
      radio.name = `${prefix}-mode`;
    }
    direct.value = "direct";
    masked.value = "seedshift";
    masked.checked = true;
    masked.dispatchEvent(new Event("change", { bubbles: true }));
    const field = page.require(`${prefix}-dates`);
    Object.defineProperty(field, "isConnected", { get: () => page.body.contains(field) });
    field.value = "23-09-2026";
    const native = document.querySelector<HTMLTextAreaElement>(`#${prefix}-dates`);
    if (native === null) throw new Error("The native dates field is missing.");
    const imports = new FieldImportRevision(document, native);
    using capture = imports.capture();
    expect(capture.current()).toBe(true);
    vi.spyOn(page.require(`${prefix}-result`), "replaceChildren").mockImplementationOnce(() => {
      throw new Error("Synthetic private native cleanup detail");
    });
    masked.checked = false;
    direct.checked = true;
    direct.dispatchEvent(new Event("change", { bubbles: true }));
    direct.checked = false;
    masked.checked = true;
    masked.dispatchEvent(new Event("change", { bubbles: true }));
    expect(capture.current()).toBe(false);
  },
);

import { afterEach, expect, it, vi } from "vitest";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";
import { FieldImportRevision } from "../src/field-import-revision.js";

afterEach(() => vi.unstubAllGlobals());

it.each(["revise", "edit", "clear", "pagehide", "remove"])(
  "retires owned prior text immediately on %s without waiting for the file reader",
  (action) => {
    const page = new PassiveQrPage();
    page.add("clear-all", "button");
    const field = page.add("captured-records", "textarea");
    field.value = "public synthetic prior phrase";
    const native = page.asDocument().querySelector<HTMLTextAreaElement>("#captured-records");
    if (native === null) throw new Error("The native records field is missing.");
    const revisions = new FieldImportRevision(page.asDocument(), native);
    using capture = revisions.capture();
    expect(capture.presentation).toBe(field.value);
    if (action === "revise") revisions.revise();
    else if (action === "edit") field.dispatchEvent(new Event("input"));
    else if (action === "clear") page.require("clear-all").click();
    else if (action === "pagehide") page.window.dispatchEvent(new Event("pagehide"));
    else page.deliverRemoved(field);
    expect(capture.current()).toBe(false);
    expect(() => capture.presentation).toThrow();
  },
);

it("retires every field's owned capture when Clear revokes their shared page", () => {
  const page = new PassiveQrPage();
  page.add("clear-all", "button");
  const captures = [];
  try {
    for (const id of ["public-first", "public-second"]) {
      page.add(id, "textarea").value = id;
      const field = page.asDocument().querySelector<HTMLTextAreaElement>(`#${id}`);
      if (field === null) throw new Error("The native field is missing.");
      captures.push(new FieldImportRevision(page.asDocument(), field).capture());
    }
    page.require("clear-all").click();
    for (const capture of captures) {
      expect(capture.current()).toBe(false);
      expect(() => capture.presentation).toThrow();
    }
  } finally {
    for (const capture of captures) capture.wipe();
  }
});

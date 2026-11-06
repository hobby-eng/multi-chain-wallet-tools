import { afterEach, expect, it, vi } from "vitest";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";
import { installTextFileImport } from "../src/text-file-import.js";

afterEach(() => vi.unstubAllGlobals());

it("refuses an oversized existing records field before reading another local file", () => {
  const page = new PassiveQrPage();
  const field = page.add("oversized-records", "textarea");
  // Independent 1 MiB admission boundary: the typed input alone is already too large.
  field.value = "x".repeat(1024 * 1024 + 1);
  const say = vi.fn();
  Object.assign(field, { setCustomValidity: say, reportValidity: () => true });
  const native = page.asDocument().querySelector<HTMLTextAreaElement>("#oversized-records");
  if (native === null) throw new Error("The native records field is missing.");
  installTextFileImport(page.asDocument(), native, { accept: ".txt", append: true });
  const chooser = page.body.querySelector('input[type="file"]');
  if (chooser === null) throw new Error("The native file chooser is missing.");
  const file = new File(["x"], "public-share.txt");
  const read = vi.spyOn(file, "arrayBuffer");
  Object.assign(chooser, { files: [file] });
  chooser.dispatchEvent(new Event("change"));
  expect(read).not.toHaveBeenCalled();
  expect(say).toHaveBeenCalledWith(expect.stringContaining("combined text"));
});

it("revokes a delayed read through the native file chooser cancel event", async () => {
  const page = new PassiveQrPage();
  const field = page.add("cancelled-records", "textarea");
  field.value = "public original record";
  Object.assign(field, { setCustomValidity: () => undefined, reportValidity: () => true });
  const native = page.asDocument().querySelector<HTMLTextAreaElement>("#cancelled-records");
  if (native === null) throw new Error("The native records field is missing.");
  installTextFileImport(page.asDocument(), native, { accept: ".txt", append: true });
  const chooser = page.body.querySelector('input[type="file"]');
  if (chooser === null) throw new Error("The native file chooser is missing.");
  const file = new File(["public delayed record"], "public-record.txt");
  const bytes = new TextEncoder().encode("public delayed record");
  let finish!: (buffer: ArrayBuffer) => void;
  vi.spyOn(file, "arrayBuffer").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  Object.assign(chooser, { files: [file] });
  chooser.dispatchEvent(new Event("change"));
  // Native input.value="" after choosing forgets its files. The passive port models that reset.
  Object.assign(chooser, { files: [] });
  chooser.dispatchEvent(new Event("cancel"));
  finish(bytes.buffer);
  await vi.waitFor(() => expect(bytes.every((byte) => byte === 0)).toBe(true));
  expect(field.value).toBe("public original record");
});

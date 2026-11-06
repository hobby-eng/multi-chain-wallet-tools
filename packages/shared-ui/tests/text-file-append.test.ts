import { afterEach, expect, it, vi } from "vitest";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";
import { installTextFileImport } from "../src/text-file-import.js";

afterEach(() => vi.unstubAllGlobals());

it("accumulates two local record files instead of replacing the earlier imported records", async () => {
  const page = new PassiveQrPage();
  const field = page.add("public-records", "textarea");
  Object.assign(field, { setCustomValidity: () => undefined, reportValidity: () => true });
  const native = page.asDocument().querySelector<HTMLTextAreaElement>("#public-records");
  if (native === null) throw new Error("The native records field is missing.");
  const options = { accept: ".txt,text/plain", append: true, preserveWhitespace: false } as const;
  installTextFileImport(page.asDocument(), native, options);
  const chooser = page.body.querySelector('input[type="file"]');
  if (chooser === null) throw new Error("The native file chooser is missing.");
  for (const [text, expected] of [
    ["public share one\r\n", "public share one"],
    ["public share two\r\n", "public share one\npublic share two"],
  ] as const) {
    Object.assign(chooser, {
      files: [new File([text], "public-share.txt", { type: "text/plain" })],
    });
    chooser.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(field.value).toBe(expected));
  }
});

it("refuses an appended record when the combined UTF-8 bytes exceed the file boundary", async () => {
  const page = new PassiveQrPage();
  const field = page.add("bounded-records", "textarea");
  // Each é occupies two UTF-8 bytes: the pre-existing records already fill the 1 MiB boundary.
  const previous = "é".repeat((1024 * 1024) / 2);
  field.value = previous;
  const report = vi.fn();
  Object.assign(field, { setCustomValidity: report, reportValidity: () => true });
  const native = page.asDocument().querySelector<HTMLTextAreaElement>("#bounded-records");
  if (native === null) throw new Error("The native records field is missing.");
  installTextFileImport(page.asDocument(), native, { accept: ".txt", append: true });
  const chooser = page.body.querySelector('input[type="file"]');
  if (chooser === null) throw new Error("The native file chooser is missing.");
  Object.assign(chooser, { files: [new File(["x"], "public-share.txt")] });
  chooser.dispatchEvent(new Event("change"));
  await vi.waitFor(() =>
    expect(report).toHaveBeenCalledWith(expect.stringContaining("combined text")),
  );
  expect(field.value).toBe(previous);
});

it("does not append a delayed file after an edit and wipes the native read buffer", async () => {
  const page = new PassiveQrPage();
  const field = page.add("revised-records", "textarea");
  field.value = "public share one";
  Object.assign(field, { setCustomValidity: () => undefined, reportValidity: () => true });
  const native = page.asDocument().querySelector<HTMLTextAreaElement>("#revised-records");
  if (native === null) throw new Error("The native records field is missing.");
  installTextFileImport(page.asDocument(), native, { accept: ".txt", append: true });
  const chooser = page.body.querySelector('input[type="file"]');
  if (chooser === null) throw new Error("The native file chooser is missing.");
  const file = new File(["public share two"], "public-share.txt");
  const bytes = new TextEncoder().encode("public share two");
  let finish!: (buffer: ArrayBuffer) => void;
  vi.spyOn(file, "arrayBuffer").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  Object.assign(chooser, { files: [file] });
  chooser.dispatchEvent(new Event("change"));
  field.value = "public replacement";
  field.dispatchEvent(new Event("input"));
  finish(bytes.buffer);
  await vi.waitFor(() => expect(bytes.every((byte) => byte === 0)).toBe(true));
  expect(field.value).toBe("public replacement");
});

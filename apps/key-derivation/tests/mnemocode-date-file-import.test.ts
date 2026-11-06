import { afterEach, expect, it, vi } from "vitest";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";
import { DatesField } from "../src/ui/recovery-mnemocode-fields.js";

afterEach(() => vi.unstubAllGlobals());

it.each(["encode", "decode", "reencode", "forgotten", "restore", "forgotten-shares"])(
  "reads a local dates file through the real %s date control",
  async (prefix) => {
    const page = new PassiveQrPage();
    const row = page.add(`mnemocode-${prefix}-dates-field`);
    const field = page.add(`mnemocode-${prefix}-dates`, "textarea", row);
    // Only the native textarea edge normalizes CR/CRLF; MnemoCode reads the dates themselves.
    let presented = "";
    Object.defineProperty(field, "value", {
      get: () => presented,
      set: (text: string) => {
        presented = text.replace(/\r\n?/gu, "\n");
      },
    });
    Object.assign(field, { setCustomValidity: () => undefined, reportValidity: () => true });
    const dates = new DatesField(prefix);
    dates.showFor("seedshift");
    const chooser = row.querySelector('input[type="file"]');
    expect(chooser).not.toBeNull();
    if (chooser === null) throw new Error("The local dates file chooser is missing.");
    Object.assign(chooser, {
      files: [
        new File(["23-09-2026\r\n01-01-2000\r\n"], "public-dates.txt", { type: "text/plain" }),
      ],
    });
    chooser.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(field.value).toBe("23-09-2026\n01-01-2000"));
    // The dates go to MnemoCode as text, which reads them itself; Direct takes none.
    expect(dates.values("seedshift")).toBe("23-09-2026\n01-01-2000");
    expect(dates.values("direct")).toBeUndefined();
  },
);

it("revokes a pending dates file when its mode closes and reopens before the read finishes", async () => {
  const page = new PassiveQrPage();
  const row = page.add("mnemocode-encode-dates-field");
  const field = page.add("mnemocode-encode-dates", "textarea", row);
  Object.assign(field, { setCustomValidity: () => undefined, reportValidity: () => true });
  field.value = "01-01-2000";
  const dates = new DatesField("encode");
  dates.showFor("seedshift");
  const chooser = row.querySelector('input[type="file"]');
  if (chooser === null) throw new Error("The local dates file chooser is missing.");
  const file = new File(["23-09-2026"], "public-dates.txt");
  const bytes = new TextEncoder().encode("23-09-2026");
  let finish!: (buffer: ArrayBuffer) => void;
  vi.spyOn(file, "arrayBuffer").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  Object.assign(chooser, { files: [file] });
  chooser.dispatchEvent(new Event("change"));
  dates.showFor("direct");
  dates.showFor("seedshift");
  finish(bytes.buffer);
  await vi.waitFor(() => expect(bytes.every((byte) => byte === 0)).toBe(true));
  expect(field.value).toBe("01-01-2000");
});

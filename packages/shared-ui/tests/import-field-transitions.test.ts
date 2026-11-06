import { afterEach, expect, it, vi } from "vitest";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";
import { FieldImportRevision } from "../src/field-import-revision.js";
import { installTextFileImport } from "../src/text-file-import.js";

afterEach(() => vi.unstubAllGlobals());

function mount() {
  const page = new PassiveQrPage();
  const field = page.add("transition-records", "input");
  field.type = "password";
  field.value = "public original value";
  Object.assign(field, { setCustomValidity: () => undefined, reportValidity: () => true });
  const native = page.asDocument().querySelector<HTMLInputElement>("#transition-records");
  if (native === null) throw new Error("The native field is missing.");
  return { page, field, native };
}

function roundTrip(ports: ReturnType<typeof mount>, change: string): void {
  const { page, field } = ports;
  if (change === "disabled") {
    field.disabled = true;
    page.queueAttribute(field, "disabled");
    field.disabled = false;
    page.queueAttribute(field, "disabled");
  } else {
    field.type = "text";
    page.queueAttribute(field, "type");
    field.type = "password";
    page.queueAttribute(field, "type");
  }
}

it.each(["disabled", "type"])(
  "retires a capture across a native %s round trip before mutation records are delivered",
  (change) => {
    const ports = mount();
    const revisions = new FieldImportRevision(ports.page.asDocument(), ports.native);
    using capture = revisions.capture();
    roundTrip(ports, change);
    expect(capture.current()).toBe(false);
    expect(() => capture.presentation).toThrow();
  },
);

it.each(["disabled", "type"])(
  "does not publish a delayed file after the native %s state was restored",
  async (change) => {
    const ports = mount();
    installTextFileImport(ports.page.asDocument(), ports.native, { accept: ".txt" });
    const chooser = ports.page.body.querySelector('input[type="file"]');
    if (chooser === null) throw new Error("The native file chooser is missing.");
    const file = new File(["public delayed value"], "public-value.txt");
    const bytes = new TextEncoder().encode("public delayed value");
    let finish!: (buffer: ArrayBuffer) => void;
    vi.spyOn(file, "arrayBuffer").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    Object.assign(chooser, { files: [file] });
    chooser.dispatchEvent(new Event("change"));
    roundTrip(ports, change);
    finish(bytes.buffer);
    await vi.waitFor(() => expect(bytes.every((byte) => byte === 0)).toBe(true));
    expect(ports.field.value).toBe("public original value");
  },
);

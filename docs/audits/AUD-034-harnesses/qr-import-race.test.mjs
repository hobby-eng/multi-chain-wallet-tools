// Audit-only reproduction through the real importer, file chooser and QR decoder; public data.
import { afterEach, expect, it, vi } from "vitest";
import { encode } from "uqr";
import { installQrImageImport } from "../../../packages/shared-ui/src/qr-image-import.ts";
import { createQrAction } from "../../../packages/shared-ui/src/payment-qr.ts";
import { RecoveryTestPage, settlePromises } from "../../../apps/key-derivation/tests/fake-recovery-page.ts";

const PAYLOAD = "public audit QR input";
function image() {
  const matrix = encode(PAYLOAD, { ecc: "L", border: 4 }).data;
  const scale = 5, width = matrix.length * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; ++y) for (let x = 0; x < width; ++x) {
    const value = matrix[Math.floor(y / scale)][Math.floor(x / scale)] ? 0 : 255;
    data.set([value, value, value, 255], (y * width + x) * 4);
  }
  return { width, height: width, data };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(["newer typed input", ""])("keeps the current field value %j after a pending image decode", async (newValue) => {
  const page = new RecoveryTestPage();
  const target = page.add("audit-qr", "textarea");
  target.value = "existing synthetic input";
  const raster = image();
  let release = () => { throw new Error("Decoder not started"); };
  const bitmap = new Promise((done) => { release = () => done({ width: raster.width, height: raster.height, close() {} }); });
  vi.stubGlobal("createImageBitmap", () => bitmap);
  const create = page.createElement.bind(page);
  let selectedInput;
  page.createElement = (tag) => tag === "canvas" ? {
    width: 0, height: 0,
    getContext: () => ({ drawImage() {}, getImageData: () => raster }),
  } : (() => {
    const element = create(tag);
    if (tag === "input") selectedInput = element;
    return element;
  })();
  const errors = [];
  installQrImageImport(page, target, { onError: (message) => errors.push(message) });
  const input = selectedInput;
  if (input === undefined) throw new Error("No real FileChoice input");
  Object.defineProperty(input, "files", { value: [new File(["synthetic JPEG browser boundary"], "public.jpg", { type: "image/jpeg" })] });
  input.dispatchEvent(new Event("change"));
  await settlePromises();
  target.value = newValue;
  target.dispatchEvent(new Event("input", { bubbles: true }));
  release();
  await settlePromises();
  expect(errors).toEqual([]);
  expect(target.value).toBe(newValue);
});

it("releases a removed QR action's pagehide listener", () => {
  const page = new RecoveryTestPage();
  const add = vi.spyOn(page.window, "addEventListener");
  const remove = vi.spyOn(page.window, "removeEventListener");
  const action = createQrAction(page, PAYLOAD, "Public", PAYLOAD);
  page.body.append(action);
  const registration = add.mock.calls.find(([type]) => type === "pagehide");
  if (!registration) throw new Error("No pagehide listener registered");
  action.remove();
  // There is no release/dispose capability. The live Window retains callback -> hide -> popover.
  expect(remove.mock.calls.some(([type, callback]) => type === "pagehide" && callback === registration[1])).toBe(true);
});

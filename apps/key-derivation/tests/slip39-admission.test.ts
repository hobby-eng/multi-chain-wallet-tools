import { Slip39Page } from "./slip39-page.js";
// Real SLIP39 parser and UI entry; restored entropy is synthetic, no KDF runs in this scope.
import { afterEach, expect, it, vi } from "vitest";
import * as slip39 from "@ckd/recovery-backup/slip39.js";

vi.mock("@ckd/ui/qr-image-import.js", () => ({ installQrImageImport: () => undefined }));
// Only the native KDF operation is passive; actual parser/recovery cleanup remains in use.
vi.mock("@noble/hashes/pbkdf2.js", () => ({
  pbkdf2: (_hash: unknown, _password: Uint8Array, _salt: Uint8Array, options: { dkLen: number }) =>
    new Uint8Array(options.dkLen),
}));
const SHARE =
  "duckling enlarge academic academic agency result length solution fridge kidney coal piece deal husband erode duke ajar critical decision keyboard";
const MARKER = "synthetic-private-marker";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([false, true])("never abandons extra parsed buffers before later invalid=%s", (invalid) => {
  const values: Uint8Array[] = [];
  const parse = slip39.Slip39.parse;
  vi.spyOn(slip39.Slip39, "parse").mockImplementation((text) => {
    const parsed = parse(text);
    values.push(parsed.value);
    return parsed;
  });
  const view = new Slip39Page(invalid ? `${SHARE}\ninvalid` : SHARE);
  view.restore();
  expect(values).toHaveLength(1);
  expect(values.every((bytes) => bytes.every((byte) => byte === 0))).toBe(true);
});

it("does not echo an unknown concealed share token in parser or UI diagnostics", () => {
  const malformed = SHARE.replace("length", MARKER);
  let message = "";
  try {
    slip39.parseSlip39Share(malformed);
  } catch (cause) {
    message = cause instanceof Error ? cause.message : "";
  }
  expect(message).not.toContain(MARKER);
  expect(message).toMatch(/word.*7/u);
  const view = new Slip39Page(malformed);
  view.restore();
  expect(view.result.textContent).not.toContain(MARKER);
});

it("disposes independently parsed shares while retaining harmless metadata", () => {
  using first = slip39.Slip39.parse(SHARE);
  using second = slip39.Slip39.parse(SHARE.toUpperCase());
  const bytes = first.value;
  expect(second.value).toEqual(bytes);
  expect(second.value.buffer).not.toBe(bytes.buffer);
  const identifier = first.identifier;
  first.wipe();
  first.wipe();
  expect(bytes.every((byte) => byte === 0)).toBe(true);
  expect(() => first.value).toThrow();
  expect(first.identifier).toBe(identifier);
  expect(second.value.some((byte) => byte !== 0)).toBe(true);
});

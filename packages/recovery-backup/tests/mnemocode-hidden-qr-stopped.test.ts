import { beforeAll, expect, it, vi } from "vitest";
import { syntheticQrPng } from "../../../test/support/synthetic-png.mjs";
import { mnemocodeState } from "../src/mnemocode-engine.js";
import { readHiddenQrRecord } from "../src/mnemocode-hidden-qr.js";
import { loadMnemoCode } from "../src/mnemocode-module.js";

// Fault: a WebAssembly trap inside MnemoCode's hidden reader, which no known input causes. The glue
// of MnemoCode's WebAssembly is the program's edge; its other exports, initSync among them, are the
// real ones, and the page's engine guards them as on the page.
vi.mock("@ckd/mnemocode-wasm/mnemocode.js", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  readHiddenQrPng: () => {
    throw new WebAssembly.RuntimeError("unreachable");
  },
}));

beforeAll(async () => {
  await loadMnemoCode();
});

it("reads a PNG as keeping no hidden record once MnemoCode stopped, and says so", () => {
  const reasons: string[] = [];
  const ordinary = syntheticQrPng(`${"0000".repeat(11)}0003`, 330, 330, 10);
  expect(mnemocodeState()).toBe("ready");
  // The trap stops MnemoCode during this very read; the next read finds it stopped.
  expect(readHiddenQrRecord(ordinary, (reason) => reasons.push(reason))).toBeUndefined();
  expect(mnemocodeState()).toBe("stopped");
  expect(readHiddenQrRecord(ordinary, (reason) => reasons.push(reason))).toBeUndefined();
  const stopped =
    "A hidden record was not looked for: MnemoCode is off until the page is loaded again.";
  expect(reasons).toEqual([stopped, stopped]);
});

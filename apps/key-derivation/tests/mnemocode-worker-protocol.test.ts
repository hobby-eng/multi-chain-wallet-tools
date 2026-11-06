import { describe, expect, it } from "vitest";
import { MnemoCodeWorkerProtocol } from "../src/workers/mnemocode-worker-protocol.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { selectedMode, selectedFormat } from "../src/ui/recovery-mnemocode-fields.js";

describe("MnemoCode worker refusal and stop boundary", () => {
  it("copies only the immutable refusal code, native kind and safe message", () => {
    const errors = new ErrorCatalog("synthetic.module", {
      bad: { kind: "type", text: () => "Invalid synthetic input." },
    });
    const error = errors.create("bad", [], { cause: { bytes: Uint8Array.of(31, 47) } });
    const wire = MnemoCodeWorkerProtocol.failure(error);
    expect(wire).toEqual({
      type: "error",
      name: "TypeError",
      message: "Invalid synthetic input.",
      code: "synthetic.module.bad",
    });
    const restored = MnemoCodeWorkerProtocol.refusal(wire);
    expect(restored).toBeInstanceOf(TypeError);
    expect(restored).not.toHaveProperty("cause");
    expect(Object.getOwnPropertyDescriptor(restored, "code")).toMatchObject({
      writable: false,
      configurable: false,
    });
  });

  it("does not coerce an unknown fault or echo its private text", () => {
    const fault = {
      toString() {
        throw new Error("Synthetic private fault");
      },
    };
    expect(MnemoCodeWorkerProtocol.failure(fault)).toEqual({
      type: "error",
      name: "Error",
      message: "The MnemoCode worker failed.",
    });
    expect(
      MnemoCodeWorkerProtocol.failure(new Error("Synthetic private fault")).message,
    ).not.toContain("private");
  });

  it.each([{ kind: "stopped" }, { stopped: true }])(
    "discards stopped results and wipes a late list $kind",
    (stop) => {
      const bytes = Uint8Array.of(5, 7);
      expect(MnemoCodeWorkerProtocol.completed({ ...stop, list: { bytes } })).toBeUndefined();
      expect([...bytes]).toEqual([0, 0]);
      const noMatch = { kind: "none", message: "No match." };
      expect(MnemoCodeWorkerProtocol.completed(noMatch)).toBe(noMatch);
    },
  );

  it("wipes the PDF of a pattern whose result is dropped, as it holds the legend", () => {
    const pdf = Uint8Array.of(37, 80, 68, 70);
    MnemoCodeWorkerProtocol.discard({ legend: "synthetic", pdf });
    expect([...pdf]).toEqual([0, 0, 0, 0]);
  });

  it.each([selectedMode, selectedFormat])(
    "refuses invalid selectors without showing supplied text",
    (select) => {
      const supplied = "synthetic private selector";
      expect(() => select({ value: supplied } as HTMLSelectElement)).toThrow();
      try {
        select({ value: supplied } as HTMLSelectElement);
      } catch (cause) {
        expect(cause).toBeInstanceOf(Error);
        expect((cause as Error).message).not.toContain(supplied);
        expect(cause).toHaveProperty("code");
      }
    },
  );
});

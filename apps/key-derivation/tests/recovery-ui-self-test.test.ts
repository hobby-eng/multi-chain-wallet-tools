import { afterEach, expect, it, vi } from "vitest";
import { CompleteIdPage } from "@ckd/test-support/complete-id-page.js";
import { RecoveryTestElement } from "./fake-recovery-page.js";
import { RecoveryUiSelfTest } from "../src/ui/recovery-ui-self-test.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("runs every cheap UI invariant and removes its synthetic controls", () => {
  const page = new CompleteIdPage();
  expect(RecoveryUiSelfTest.run().map((row) => row.name)).toEqual([
    "Recovery tab keyboard navigation",
    "Recovery input and result ownership",
    "Recovery automatic concealment and Copy gating",
  ]);
  expect(page.querySelectorAll("[data-test-tab]")).toHaveLength(0);
  expect(page.querySelectorAll("[data-recovery-secret-control]")).toHaveLength(0);
});

it("returns a stable failure code and removes fixtures when native keyboard delivery fails", () => {
  const page = new CompleteIdPage();
  vi.spyOn(RecoveryTestElement.prototype, "dispatchEvent").mockImplementationOnce(() => true);
  expect(() => RecoveryUiSelfTest.run()).toThrow(
    expect.objectContaining({ code: "recovery.ui-self-test.failed" }),
  );
  expect(page.querySelectorAll("[data-test-tab]")).toHaveLength(0);
});

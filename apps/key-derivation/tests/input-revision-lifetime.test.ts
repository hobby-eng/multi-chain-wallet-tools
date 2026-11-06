import { afterEach, expect, it, vi } from "vitest";
import { CompleteIdPage } from "@ckd/test-support/complete-id-page.js";
import { InputRevision } from "../src/ui/recovery-input-revision.js";
import { SecretValue } from "@ckd/core/secret-value.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["jobQuestion", "resultInteraction"] as const)(
  "does not snapshot private fields inside %s",
  (kind) => {
    const page = new CompleteIdPage();
    const area = page.add("interaction");
    area.dataset[kind] = "";
    const field = page.add("private-answer", "textarea", area);
    field.value = "synthetic private answer";
    const create = vi.spyOn(SecretValue, "utf16Texts");
    const edited = vi.fn();
    const revision = new InputRevision(page.body, edited);
    const current = revision.capture();
    field.dispatchEvent(new Event("input", { bubbles: true }));
    expect(current()).toBe(true);
    expect(edited).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  },
);

it("retires source comparison bytes and native inputs even when an edit callback fails", () => {
  const page = new CompleteIdPage();
  const field = page.add("private-source", "textarea");
  field.value = "synthetic private source";
  let fail = false;
  const revision = new InputRevision(page.body, () => {
    if (fail) throw new Error("Synthetic retirement fault");
  });
  const tracked = vi.spyOn(SecretValue, "utf16Texts");
  field.dispatchEvent(new Event("input", { bubbles: true }));
  const snapshot: unknown = tracked.mock.results[0]?.value;
  if (!(snapshot instanceof SecretValue))
    throw new Error("The comparison needs an owned snapshot.");
  const callbacks: EventListener[] = [];
  const clear = page.require("clear-all");
  vi.spyOn(clear, "addEventListener").mockImplementation((type, listener) => {
    if (type === "click" && typeof listener === "function") callbacks.push(listener);
  });
  revision.bindPageLifetime(() => {
    field.value = "";
  });
  fail = true;
  expect(() => callbacks[0]!.call(clear, new Event("click"))).toThrow("Synthetic retirement fault");
  expect(field.value).toBe("");
  expect(() => snapshot.assertLive()).toThrow(
    expect.objectContaining({ code: "core.secret-value.wiped" }),
  );
});

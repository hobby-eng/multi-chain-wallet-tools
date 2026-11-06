import { afterEach, expect, it, vi } from "vitest";
import { CompleteIdPage } from "@ckd/test-support/complete-id-page.js";
import { SecretValue } from "@ckd/core/secret-value.js";
import { FieldEdits } from "../src/ui/field-edits.js";

function inputEvent(type: string, target: EventTarget): Event {
  const event = new Event(type);
  Object.defineProperty(event, "target", { value: target });
  return event;
}

function observeOwners() {
  const owners: SecretValue<readonly string[]>[] = [];
  const create = SecretValue.utf16Texts.bind(SecretValue);
  vi.spyOn(SecretValue, "utf16Texts").mockImplementation((values) => {
    const owner = create(values);
    owners.push(owner);
    return owner;
  });
  return owners;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["clear", "pagehide"] as const)(
  "retires retained private field snapshots on %s",
  (kind) => {
    const page = new CompleteIdPage();
    const owners = observeOwners();
    const field = page.add("synthetic-source", "textarea");
    field.value = "synthetic private source fixture";
    const edits = new FieldEdits();
    expect(edits.isNew(inputEvent("input", field))).toBe(true);
    expect(edits.isNew(inputEvent("change", field))).toBe(false);
    if (kind === "clear") page.require("clear-all").click();
    else page.window.dispatchEvent(new Event("pagehide"));
    expect(edits.isNew(inputEvent("change", field))).toBe(true);
    expect(owners).toHaveLength(2);
    expect(() => owners[0]!.assertLive()).toThrow(
      expect.objectContaining({ code: "core.secret-value.wiped" }),
    );
  },
);

it("retires the previous owner on replacement and preserves exact UTF-16 editing identity", () => {
  const page = new CompleteIdPage();
  const owners = observeOwners();
  const field = page.add("synthetic-source", "textarea");
  const edits = new FieldEdits();
  field.value = "\uD800";
  expect(edits.isNew(inputEvent("input", field))).toBe(true);
  expect(edits.isNew(inputEvent("change", field))).toBe(false);
  field.value = "\uFFFD";
  expect(edits.isNew(inputEvent("change", field))).toBe(true);
  expect(owners).toHaveLength(2);
  expect(() => owners[0]!.assertLive()).toThrow(
    expect.objectContaining({ code: "core.secret-value.wiped" }),
  );
});

it("does not allocate comparison storage for text above its bounded cache budget", () => {
  const page = new CompleteIdPage();
  const owners = observeOwners();
  const field = page.add("synthetic-source", "textarea");
  field.value = "x".repeat(65_537);
  const edits = new FieldEdits();
  expect(edits.isNew(inputEvent("input", field))).toBe(true);
  expect(edits.isNew(inputEvent("change", field))).toBe(true);
  expect(owners).toHaveLength(0);
});

it("treats malformed native field metadata as a new edit without reading text", () => {
  const edits = new FieldEdits();
  const target = Object.assign(new EventTarget(), { tagName: 1 });
  Object.defineProperty(target, "value", {
    get(): string {
      throw new Error("No text read for a malformed native field");
    },
  });
  expect(edits.isNew(inputEvent("change", target))).toBe(true);
});

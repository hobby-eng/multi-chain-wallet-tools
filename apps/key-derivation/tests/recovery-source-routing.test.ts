import { afterEach, expect, it, vi } from "vitest";
import { DeriverViewFixture } from "@ckd/test-support/deriver-view.js";
import { DeriverSource } from "../src/ui/deriver-source.js";
import { installRecoverySourceController } from "../src/ui/recovery-source-controller.js";
import type {
  RecoverySourceReference,
  RecoverySourceTarget,
} from "../src/ui/recovery-source-link.js";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function fixture() {
  const host = new DeriverViewFixture();
  host.view.mnemonic.value = PHRASE;
  const source = new DeriverSource(host.view, {
    writeClipboard: async () => {},
    onVisibility: () => {},
  });
  const opened: { reference: RecoverySourceReference; target: RecoverySourceTarget }[] = [];
  const errors: string[] = [];
  let reads = 0;
  let child: RecoverySourceReference | null = null;
  installRecoverySourceController({
    document: host.view.document,
    open(reference, target) {
      opened.push({ reference, target });
    },
    originalReference() {
      reads += 1;
      return source.reference();
    },
    childReference() {
      return child;
    },
    showError(message) {
      errors.push(message);
    },
  });
  const click = (kind: string, target: string) => {
    const button = host.page.add("synthetic-recovery-route", "button");
    Object.assign(button.dataset, { recoverySource: kind, recoveryTarget: target });
    button.click();
  };
  return {
    source,
    view: host.view,
    opened,
    errors,
    reads: () => reads,
    click,
    child(reference: RecoverySourceReference | null) {
      child = reference;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["", "synthetic unknown source"])(
  "refuses unknown source %j before obtaining the original reference",
  (kind) => {
    const setup = fixture();
    setup.click(kind, "seedqr");
    expect(setup.reads()).toBe(0);
    expect(setup.opened).toHaveLength(0);
    expect(setup.errors).toHaveLength(1);
    expect(setup.errors[0]).not.toContain(kind || PHRASE);
  },
);

it("refuses an unknown target without reading a source or reflecting the supplied target", () => {
  const setup = fixture();
  setup.click("main", "synthetic private target");
  expect(setup.reads()).toBe(0);
  expect(setup.opened).toHaveLength(0);
  expect(setup.errors).toHaveLength(1);
  expect(setup.errors[0]).not.toContain("synthetic private target");
});

it("passes an admitted original capability without copying its phrase into the destination", () => {
  const setup = fixture();
  setup.click("main", "seedqr");
  expect(setup.opened).toHaveLength(1);
  expect(setup.opened[0]?.target).toBe("seedqr");
  const reference = setup.opened[0]!.reference;
  expect(reference.read()?.mnemonic).toBe(PHRASE);
  setup.source.changed();
  expect(reference.read()).toBeNull();
  expect(setup.errors).toHaveLength(0);
});

it("refuses an unavailable child without falling back to the original phrase", () => {
  const setup = fixture();
  setup.click("bip85", "seedqr");
  expect(setup.reads()).toBe(0);
  expect(setup.opened).toHaveLength(0);
  expect(setup.errors).toHaveLength(1);
});

it("keeps a child reference independent of original-source access", () => {
  const setup = fixture();
  const child = setup.source.reference();
  setup.child(child);
  setup.click("bip85", "seedqr");
  expect(setup.reads()).toBe(0);
  expect(setup.opened[0]?.reference).toBe(child);
  expect(setup.errors).toHaveLength(0);
});

it("reports invalid original text without including the entered phrase", () => {
  const setup = fixture();
  setup.view.mnemonic.value = "synthetic private malformed phrase";
  setup.click("main", "seedqr");
  expect(setup.opened).toHaveLength(0);
  expect(setup.errors).toHaveLength(1);
  expect(setup.errors[0]).not.toContain("synthetic private malformed phrase");
});

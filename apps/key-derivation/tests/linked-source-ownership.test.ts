// Actual source/view/link owners; native DOM/window surfaces are passive fixtures, without layout.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeriverViewFixture } from "@ckd/test-support/deriver-view.js";
import { DeriverSource } from "../src/ui/deriver-source.js";
import { LinkedSources } from "../src/ui/recovery-linked-sources.js";
import type { RecoveryPhraseSlot } from "../src/ui/recovery-feature.js";
import type { RecoverySourceTarget } from "../src/ui/recovery-source-link.js";

const FIRST =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const SECOND = "legal winner thank year wave sausage worth useful legal winner thank yellow";

function fixture() {
  const host = new DeriverViewFixture();
  host.view.mnemonic.value = FIRST;
  const source = new DeriverSource(host.view, {
    writeClipboard: async () => {},
    onVisibility: () => {},
  });
  const slots: RecoveryPhraseSlot[] = ["seedqr", "mnemocode"].map((name) => ({
    target: name === "seedqr" ? "seedqr" : "mnemocode",
    panelId: `synthetic-${name}-panel`,
    phraseField: `#synthetic-${name}-phrase`,
    linkedNote: "Public test note.",
  }));
  for (const slot of slots) {
    const panel = host.page.add(slot.panelId, "section");
    host.page.add(slot.phraseField.slice(1), "textarea", panel);
  }
  const links = new LinkedSources(slots);
  links.install();
  const card = (target: RecoverySourceTarget) => {
    const node = host.view.document.querySelector<HTMLElement>(
      `[data-linked-source-for="${target}"]`,
    );
    if (node === null) throw new Error("The actual linked card must exist.");
    const phrase = node.querySelector<HTMLTextAreaElement>("textarea");
    const buttons = Array.from(node.querySelectorAll<HTMLButtonElement>("button"));
    const toggle = buttons.find(
      (button) => button.textContent === "Show phrase" || button.textContent === "Hide phrase",
    );
    const unlink = buttons.find((button) => button.textContent === "Enter another phrase");
    if (phrase === null || toggle === undefined || unlink === undefined)
      throw new Error("The actual card controls must exist.");
    return { node, phrase, toggle, unlink };
  };
  const show = (target: RecoverySourceTarget) => {
    const view = card(target);
    view.toggle.click();
    return view;
  };
  return {
    page: host.page,
    view: host.view,
    source,
    links,
    card,
    show,
    blur: () => host.page.window.dispatchEvent(new Event("blur")),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("linked source ownership across native DOM events", () => {
  it("keeps a reentrant replacement registered for the next concealment pass", () => {
    const f = fixture();
    const reference = f.source.reference();
    f.links.use(reference, "seedqr");
    f.links.use(reference, "mnemocode");
    f.show("seedqr");
    const old = f.show("mnemocode");
    let replaced = false;
    f.view.document.addEventListener("recovery-source-visibility", (event) => {
      if (
        !(event instanceof CustomEvent) ||
        event.detail !== "seedqr" ||
        f.links.isRevealed("seedqr") ||
        replaced
      )
        return;
      replaced = true;
      f.view.mnemonic.value = SECOND;
      f.source.changed();
      f.links.use(f.source.reference(), "mnemocode");
      f.show("mnemocode");
    });
    f.blur();
    const replacement = f.card("mnemocode");
    expect(replacement.phrase.value).toBe(SECOND);
    expect(f.links.isRevealed("mnemocode")).toBe(true);
    expect(old.phrase.value).toBe("");
    f.blur();
    expect(replacement.phrase.value).toBe("");
    expect(replacement.phrase.hidden).toBe(true);
  });

  it("wipes a retired card and refuses its detached toggle even with the same source reference", () => {
    const f = fixture();
    const reference = f.source.reference();
    f.links.use(reference, "seedqr");
    const old = f.show("seedqr");
    f.links.use(reference, "seedqr");
    expect(old.phrase.value).toBe("");
    old.toggle.click();
    expect(old.phrase.value).toBe("");
    expect(f.links.isRevealed("seedqr")).toBe(false);
  });

  it("refuses a detached unlink control's authority over a replacement card", () => {
    const f = fixture();
    const reference = f.source.reference();
    f.links.use(reference, "seedqr");
    const old = f.card("seedqr");
    f.links.use(reference, "seedqr");
    const replacement = f.card("seedqr");
    old.unlink.click();
    expect(replacement.node.isConnected).toBe(true);
    expect(f.links.linkedValue("seedqr")?.mnemonic).toBe(FIRST);
  });

  it("keeps only the newest card after a reentrant source-change replacement", () => {
    const f = fixture();
    const reference = f.source.reference();
    let replaced = false;
    f.view.document.addEventListener("recovery-source-change", (event) => {
      if (!(event instanceof CustomEvent) || event.detail !== "seedqr" || replaced) return;
      replaced = true;
      f.links.use(reference, "seedqr");
    });
    f.links.use(reference, "seedqr");
    expect(f.view.document.querySelectorAll('[data-linked-source-for="seedqr"]')).toHaveLength(1);
  });

  it("conceals the existing DOM view when its real source capability expires", () => {
    const f = fixture();
    f.links.use(f.source.reference(), "seedqr");
    const view = f.show("seedqr");
    f.source.changed();
    f.links.offer(null);
    expect(view.phrase.value).toBe("");
    expect(view.phrase.hidden).toBe(true);
    expect(f.links.isRevealed("seedqr")).toBe(false);
    expect(() => f.links.linkedValue("seedqr")).toThrow(
      expect.objectContaining({ code: "recovery.linked-source.changed" }),
    );
  });
});

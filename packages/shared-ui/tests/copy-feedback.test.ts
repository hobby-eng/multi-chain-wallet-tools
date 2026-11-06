import { afterEach, expect, it, vi } from "vitest";
import { CopyFeedback } from "../src/copy-feedback.js";
import { CompleteIdPage } from "@ckd/test-support/complete-id-page.js";

function fixture(icon: boolean) {
  const page = new CompleteIdPage();
  const button = Object.assign(page.add("copy", "button"), { title: "Original public title" });
  button.textContent = "Copy public data";
  button.title = "Original public title";
  button.dataset.iconButton = String(icon);
  const queued = new Map<number, () => void>();
  const delivered: (() => void)[] = [];
  let next = 0;
  const feedback = new CopyFeedback({
    setTimeout(callback) {
      const deliver = () => callback();
      queued.set(++next, deliver);
      delivered.push(deliver);
      return next;
    },
    clearTimeout(id) {
      queued.delete(id);
    },
  });
  const nativeButton = page.asDocument().querySelector<HTMLButtonElement>("#copy")!;
  return { feedback, button, nativeButton, queued, delivered };
}

afterEach(() => vi.unstubAllGlobals());

it.each([true, false])(
  "restores the original copy control after repeated success (icon %s)",
  (icon) => {
    const setup = fixture(icon);
    setup.feedback.flash(setup.nativeButton);
    setup.feedback.flash(setup.nativeButton);
    expect(setup.queued.size).toBe(1);
    setup.delivered[0]!(); // An already queued obsolete native callback must not shorten new feedback.
    expect(icon ? setup.button.title : setup.button.textContent).toBe("Copied");
    setup.delivered[1]!();
    expect(setup.button.textContent).toBe("Copy public data");
    expect(setup.button.title).toBe("Original public title");
    expect(setup.button.classList.contains("copied")).toBe(false);
  },
);

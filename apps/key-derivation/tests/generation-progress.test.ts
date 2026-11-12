import { describe, expect, it, vi } from "vitest";
import { GenerationOutlook } from "../src/ui/generation-outlook.js";
import { GenerationProgress } from "../src/ui/generation-progress.js";

/** A passive element that counts how often its text is written. */
class Control extends EventTarget {
  hidden = true;
  writes = 0;
  #text = "";
  readonly classes = new Set<string>();
  readonly classList = {
    toggle: (name: string, on: boolean) =>
      on ? this.classes.add(name) : this.classes.delete(name),
  };
  ownerDocument: { activeElement: unknown } | undefined;
  get textContent(): string {
    return this.#text;
  }
  set textContent(text: string) {
    this.writes += 1;
    this.#text = text;
  }
  click(): void {
    this.dispatchEvent(new Event("click"));
  }
  readonly focus = vi.fn();
}

function setup() {
  const elements = {
    line: new Control(),
    count: new Control(),
    stop: new Control(),
    error: new Control(),
  };
  let now = 0;
  const progress = new GenerationProgress(
    elements as unknown as ConstructorParameters<typeof GenerationProgress>[0],
    () => now,
  );
  return { elements, progress, at: (time: number) => (now = time) };
}

describe("the lines of a draw under the Generate buttons", () => {
  it("shows the start line and Stop at once, and the count a few times a second", () => {
    const { elements, progress, at } = setup();
    const stop = vi.fn();
    const run = progress.begin("Drawing a new 24-word phrase…", stop);
    expect(elements.line.textContent).toBe("Drawing a new 24-word phrase…");
    expect(elements.stop.hidden).toBe(false);
    expect(elements.count.hidden).toBe(true);
    run.count("64 tried");
    expect(elements.count).toMatchObject({ hidden: false, textContent: "64 tried" });
    at(100);
    run.count("128 tried");
    expect(elements.count.textContent).toBe("64 tried");
    at(260);
    run.count("192 tried");
    expect(elements.count.textContent).toBe("192 tried");
    elements.stop.click();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("offers no Stop for a draw that ends at once, and shows how a draw ended", () => {
    const { elements, progress } = setup();
    const run = progress.begin("Drawing a new 12-word phrase.", undefined);
    expect(elements.stop.hidden).toBe(true);
    run.done("Generated a new 12-word BIP39 recovery phrase.");
    expect(elements.line.textContent).toBe("Generated a new 12-word BIP39 recovery phrase.");
    // An ended draw's later calls do nothing.
    run.stopped("Stopped.");
    run.count("1 tried");
    expect(elements.line.textContent).toBe("Generated a new 12-word BIP39 recovery phrase.");
    expect(elements.count.hidden).toBe(true);
  });

  it("gives the focus back to the Generate button when Stop hides while it has it", () => {
    const { elements, progress } = setup();
    const pressed = new Control();
    const page = { activeElement: elements.stop as unknown };
    elements.stop.ownerDocument = page;
    progress.begin("Drawing.", vi.fn(), pressed as unknown as HTMLElement).stopped("Stopped.");
    expect(pressed.focus).toHaveBeenCalledOnce();
    expect(elements.line.focus).not.toHaveBeenCalled();
    // Elsewhere, the focus stays where it is.
    page.activeElement = undefined;
    progress.begin("Drawing.", vi.fn(), pressed as unknown as HTMLElement).done("Generated.");
    expect(pressed.focus).toHaveBeenCalledOnce();
    expect(elements.line.focus).not.toHaveBeenCalled();
  });

  it("gives the focus to the status line when a draw ends by itself while Stop has it", () => {
    // A key pressed on Stop just as the draw ends must not start a new draw on Generate.
    const { elements, progress } = setup();
    const pressed = new Control();
    elements.stop.ownerDocument = { activeElement: elements.stop as unknown };
    progress.begin("Drawing.", vi.fn(), pressed as unknown as HTMLElement).done("Generated.");
    expect(elements.line.focus).toHaveBeenCalledOnce();
    expect(pressed.focus).not.toHaveBeenCalled();
    progress.begin("Drawing.", vi.fn(), pressed as unknown as HTMLElement).fail("Failed.");
    expect(elements.line.focus).toHaveBeenCalledTimes(2);
    expect(pressed.focus).not.toHaveBeenCalled();
  });

  it("shows a failure as an error where the line was, and a newer draw wins over an older one", () => {
    const { elements, progress } = setup();
    const older = progress.begin("Drawing A.", vi.fn());
    const newer = progress.begin("Drawing B.", vi.fn());
    older.fail("A failed.");
    expect(elements.error.textContent).toBe("");
    expect(elements.line.textContent).toBe("Drawing B.");
    newer.fail("The MHFE wallet check needs a BIP39 passphrase: type it first.");
    // The live line stays in the page, empty, which the page's style shows as nothing.
    expect(elements.line.textContent).toBe("");
    expect(elements.stop.hidden).toBe(true);
    expect(elements.error.textContent).toBe(
      "The MHFE wallet check needs a BIP39 passphrase: type it first.",
    );
    progress.dismissError();
    expect(elements.error.textContent).toBe("");
    progress.refuse("Cryptographic self-test has not completed.");
    expect(elements.error.textContent).toBe("Cryptographic self-test has not completed.");
  });

  it("hides a done line when its passphrase changes, but keeps a stop and a running draw", () => {
    const { elements, progress } = setup();
    progress.begin("Drawing.", vi.fn()).stopped("Stopped after 5 draws.");
    progress.dismissDone();
    expect(elements.line.textContent).toBe("Stopped after 5 draws.");
    progress.begin("Drawing.", vi.fn()).done("Generated.");
    progress.dismissDone();
    expect(elements.line.textContent).toBe("");
    const running = progress.begin("Drawing.", vi.fn());
    progress.dismissDone();
    expect(elements.line.textContent).toBe("Drawing.");
    // Clear forgets the draw: its later lines do not come back.
    progress.reset();
    running.stopped("Stopped.");
    expect(elements.line.textContent).toBe("");
  });

  it("writes a text only when it changes", () => {
    const { elements, progress } = setup();
    progress.dismissError();
    progress.dismissError();
    expect(elements.error.writes).toBe(0);
    progress.begin("Drawing.", undefined).done("Generated.");
    const writes = elements.line.writes;
    progress.dismissDone();
    progress.dismissDone();
    expect(elements.line.writes).toBe(writes + 1);
  });
});

describe("the outlook under the generation options", () => {
  it("shows the bits, the time and the note, hides what is null, and writes only changes", () => {
    const elements = {
      box: new Control(),
      bits: new Control(),
      time: new Control(),
      note: new Control(),
    };
    const outlook = new GenerationOutlook(
      elements as unknown as ConstructorParameters<typeof GenerationOutlook>[0],
    );
    const lines = {
      bits: { text: "Not recommended.", alert: true },
      time: "About 1 min.",
      note: null,
    };
    outlook.show(lines);
    expect(elements.box.hidden).toBe(false);
    expect(elements.bits.classes.has("warning")).toBe(true);
    expect(elements.time).toMatchObject({ hidden: false, textContent: "About 1 min." });
    expect(elements.note.hidden).toBe(true);
    // The same lines again, as a passphrase typed while an option is ticked asks: nothing written.
    const writes = elements.bits.writes + elements.time.writes;
    outlook.show(lines);
    expect(elements.bits.writes + elements.time.writes).toBe(writes);
    outlook.show({ bits: { text: "Ample.", alert: false }, time: null, note: "No passphrase." });
    expect(elements.bits.classes.has("warning")).toBe(false);
    expect(elements.time.hidden).toBe(true);
    expect(elements.note).toMatchObject({ hidden: false, textContent: "No passphrase." });
    outlook.show(null);
    expect(elements.box.hidden).toBe(true);
  });
});

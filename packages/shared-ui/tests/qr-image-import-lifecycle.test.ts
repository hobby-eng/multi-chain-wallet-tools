import { afterEach, expect, it, vi } from "vitest";
import { installTextFileImport } from "../src/text-file-import.js";
import { installQrImageImport } from "../src/qr-image-import.js";
import { PassiveQrPage } from "../../../test/support/qr-page.js";
import { QrImageBoundary } from "../../../test/support/qr-image-boundary.js";
import { syntheticQrPng } from "../../../test/support/synthetic-png.mjs";
import { edit, settlePromises } from "../../../apps/key-derivation/tests/fake-recovery-page.js";

const OLD = "existing public input";
const IMPORTED = "public imported QR";

function mount(multiple = false) {
  const page = new PassiveQrPage();
  const target = page.add("qr-input", "textarea");
  const clear = page.add("clear-all", "button");
  target.value = OLD;
  target.after = (...nodes) => page.body.append(...nodes);
  const { pending } = new QrImageBoundary(page);
  const decoded = vi.fn((value: { text: string }) => value.text);
  const errors = vi.fn();
  installQrImageImport(page.asDocument(), target as unknown as HTMLTextAreaElement, {
    multiple,
    onDecoded: decoded,
    onError: errors,
  });
  installTextFileImport(page.asDocument(), target as unknown as HTMLTextAreaElement, {
    accept: "text/plain",
    onError: errors,
  });
  const chooser = page.body.querySelectorAll("input").find((input) => {
    const accept: unknown = Reflect.get(input, "accept");
    return typeof accept === "string" && accept.startsWith("image/");
  });
  if (chooser === undefined) throw new Error("The actual FileChoice input is missing.");
  return {
    page,
    target,
    clear,
    pending,
    decoded,
    errors,
    async choose(count = 1) {
      Object.defineProperty(chooser, "files", {
        configurable: true,
        value: Array.from(
          { length: count },
          () => new File(["synthetic bitmap boundary"], "public.jpg", { type: "image/jpeg" }),
        ),
      });
      chooser.dispatchEvent(new Event("change"));
      await settlePromises();
    },
    async chooseText(text = "new public text") {
      const input = page.body
        .querySelectorAll("input")
        .find((node) => Reflect.get(node, "accept") === "text/plain");
      if (input === undefined) throw new Error("The actual text FileChoice input is missing.");
      const bytes = new TextEncoder().encode(text);
      const file = new File([bytes], "public.txt", { type: "text/plain" });
      let release!: (buffer: ArrayBuffer) => void;
      let reject!: (error: Error) => void;
      const pending = new Promise<ArrayBuffer>((resolve, refuse) => {
        release = resolve;
        reject = refuse;
      });
      vi.spyOn(file, "arrayBuffer").mockReturnValue(pending);
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new Event("change"));
      await settlePromises();
      return {
        release: () => release(bytes.buffer),
        reject: () => reject(new Error("Synthetic old text error")),
      };
    },
    async finish(index = 0, text = IMPORTED) {
      pending[index]!.release(text);
      await settlePromises();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["newer typed input", ""])("keeps edited input %j after late decoding", async (text) => {
  const view = mount();
  await view.choose();
  edit(view.target, text);
  await view.finish();
  expect(view.target.value).toBe(text);
  expect(view.decoded).not.toHaveBeenCalled();
  expect(view.errors).not.toHaveBeenCalled();
  expect(view.pending[0]!.close).toHaveBeenCalledOnce();
});

it.each(["clear", "pagehide", "removed"])("revokes imports on %s", async (event) => {
  const view = mount();
  await view.choose();
  if (event === "clear") view.clear.click();
  if (event === "pagehide") view.page.window.dispatchEvent(new Event("pagehide"));
  if (event === "removed") {
    view.target.remove();
    view.page.deliverRemoved(view.target);
    view.page.body.append(view.target);
  }
  await view.finish();
  expect(view.target.value).toBe(OLD);
  expect(view.decoded).not.toHaveBeenCalled();
});

it("a newer choice owns publication even when the older decoder finishes last", async () => {
  const view = mount();
  await view.choose();
  await view.choose();
  await view.finish(1, "new public QR");
  await view.finish(0);
  expect(view.target.value).toBe("new public QR");
  expect(view.decoded).toHaveBeenCalledOnce();
});

it("suppresses a stale decoder failure", async () => {
  const view = mount();
  await view.choose();
  edit(view.target, "newer field");
  view.pending[0]!.reject();
  await settlePromises();
  expect(view.errors).not.toHaveBeenCalled();
});

it("preserves multi-file append as one admitted operation", async () => {
  const view = mount(true);
  await view.choose(2);
  await view.finish(0, "public QR one");
  await view.finish(1, "public QR two");
  expect(view.target.value).toBe(`${OLD}\npublic QR one\npublic QR two`);
  expect(view.decoded).toHaveBeenCalledTimes(2);
});

it.each(["QR", "text"])(
  "mixed choosers keep the newer input when older %s completes first",
  async (older) => {
    const view = mount();
    if (older === "QR") {
      await view.choose();
      const text = await view.chooseText();
      await view.finish();
      text.release();
      await settlePromises();
      expect(view.target.value).toBe("new public text");
      expect(view.decoded).not.toHaveBeenCalled();
    } else {
      const text = await view.chooseText("old public text");
      await view.choose();
      text.release();
      await settlePromises();
      await view.finish();
      expect(view.target.value).toBe(IMPORTED);
      expect(view.decoded).toHaveBeenCalledOnce();
    }
  },
);

it.each(["QR", "text"])("mixed choosers suppress an older %s refusal", async (older) => {
  const view = mount();
  if (older === "QR") {
    await view.choose();
    const text = await view.chooseText();
    view.pending[0]!.reject();
    await settlePromises();
    text.release();
    await settlePromises();
  } else {
    const text = await view.chooseText();
    await view.choose();
    text.reject();
    await settlePromises();
    await view.finish();
  }
  expect(view.errors).not.toHaveBeenCalled();
});

it("reads the hidden record a PNG keeps before its visible QR, and only then the image", async () => {
  const page = new PassiveQrPage();
  const target = page.add("qr-input", "textarea");
  target.value = OLD;
  target.after = (...nodes) => page.body.append(...nodes);
  const { pending } = new QrImageBoundary(page);
  const seen: number[][] = [];
  const readHidden = vi.fn((png: Uint8Array) => {
    seen.push([...png.subarray(0, 8)]);
    return "public hidden record";
  });
  installQrImageImport(page.asDocument(), target as unknown as HTMLTextAreaElement, {
    readHidden,
  });
  const chooser = page.body
    .querySelectorAll("input")
    .find((input) => String(Reflect.get(input, "accept")).startsWith("image/"));
  if (chooser === undefined) throw new Error("The actual FileChoice input is missing.");
  const png = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0);
  Object.defineProperty(chooser, "files", {
    configurable: true,
    value: [new File([png], "public.png", { type: "image/png" })],
  });
  chooser.dispatchEvent(new Event("change"));
  await settlePromises();
  expect(readHidden).toHaveBeenCalledOnce();
  expect(seen).toEqual([[137, 80, 78, 71, 13, 10, 26, 10]]);
  expect(target.value).toBe("public hidden record");
  // No bitmap was decoded: the hidden record was the answer.
  expect(pending).toHaveLength(0);
});

it("says why a hidden record went unread beside a refusal of the image's ordinary reading", async () => {
  const page = new PassiveQrPage();
  const target = page.add("qr-input", "textarea");
  target.value = OLD;
  target.after = (...nodes) => page.body.append(...nodes);
  const { pending } = new QrImageBoundary(page);
  const reason = "A public reason the record went unread.";
  const seen: (string | undefined)[] = [];
  const errors = vi.fn();
  installQrImageImport(page.asDocument(), target as unknown as HTMLTextAreaElement, {
    readHidden: (_png, unread) => {
      unread(reason);
      return undefined;
    },
    onDecoded: (decoded) => {
      seen.push(decoded.hiddenUnread);
      if (decoded.text === "public decoy text") throw new Error("No payload of this field.");
      return decoded.text;
    },
    onError: errors,
  });
  const chooser = page.body
    .querySelectorAll("input")
    .find((input) => String(Reflect.get(input, "accept")).startsWith("image/"));
  if (chooser === undefined) throw new Error("The actual FileChoice input is missing.");
  /** Chooses a public PNG and waits for its ordinary reading, the `count`th, to begin. */
  const choose = async (count: number): Promise<void> => {
    Object.defineProperty(chooser, "files", {
      configurable: true,
      value: [
        new File([syntheticQrPng("public", 165, 165, 5)], "public.png", {
          type: "image/png",
        }),
      ],
    });
    chooser.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(pending).toHaveLength(count));
  };

  // The field's refusal of what the image gives, and a failed ordinary reading, both name it.
  await choose(1);
  pending[0]!.release("public decoy text");
  await vi.waitFor(() => expect(errors).toHaveBeenCalledTimes(1));
  expect(errors).toHaveBeenLastCalledWith(`No payload of this field. ${reason}`);
  await choose(2);
  pending[1]!.reject();
  await vi.waitFor(() => expect(errors).toHaveBeenCalledTimes(2));
  // The page's PNG admission says the image could not be decoded, as for any PNG.
  expect(errors).toHaveBeenLastCalledWith(`The PNG image could not be decoded. ${reason}`);
  expect(target.value).toBe(OLD);
  // A payload the field takes goes in as ever, and a note under the field says why: a decoy that
  // looks like a payload is never taken silently.
  const note = page.body.querySelector("p.qr-import-note");
  if (note === null) throw new Error("The import's note is missing.");
  expect(note.hidden).toBe(true);
  await choose(3);
  pending[2]!.release("public payload");
  await vi.waitFor(() => expect(target.value).toBe("public payload"));
  expect(seen).toEqual([reason, reason]);
  expect(errors).toHaveBeenCalledTimes(2);
  expect(note.hidden).toBe(false);
  expect(note.textContent).toBe(`Read as an ordinary QR code. ${reason}`);
  // The field's next edit takes the note away with the text it spoke of.
  edit(target, "public edit");
  expect(note.hidden).toBe(true);
  expect(note.textContent).toBe("");
});

it("leaves the note away after an image whose hidden reader looked", async () => {
  const page = new PassiveQrPage();
  const target = page.add("qr-input", "textarea");
  target.after = (...nodes) => page.body.append(...nodes);
  const { pending } = new QrImageBoundary(page);
  installQrImageImport(page.asDocument(), target as unknown as HTMLTextAreaElement, {
    readHidden: () => undefined,
  });
  const chooser = page.body
    .querySelectorAll("input")
    .find((input) => String(Reflect.get(input, "accept")).startsWith("image/"));
  if (chooser === undefined) throw new Error("The actual FileChoice input is missing.");
  Object.defineProperty(chooser, "files", {
    configurable: true,
    value: [new File([syntheticQrPng("public", 165, 165, 5)], "public.png", { type: "image/png" })],
  });
  chooser.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  pending[0]!.release("public payload");
  await vi.waitFor(() => expect(target.value).toBe("public payload"));
  expect(page.body.querySelector("p.qr-import-note")?.hidden).toBe(true);
});

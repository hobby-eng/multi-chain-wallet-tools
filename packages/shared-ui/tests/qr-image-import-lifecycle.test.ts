import { afterEach, expect, it, vi } from "vitest";
import { installTextFileImport } from "../src/text-file-import.js";
import { installQrImageImport } from "../src/qr-image-import.js";
import { PassiveQrPage } from "../../../test/support/qr-page.js";
import { QrImageBoundary } from "../../../test/support/qr-image-boundary.js";
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

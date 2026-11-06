import { afterEach, expect, it, vi } from "vitest";
import { getCoinAdapter } from "@ckd/coins/registry.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";
import { DeriverViewFixture } from "@ckd/test-support/deriver-view.js";
import {
  createResultExportController,
  type ResultExportContext,
} from "../src/ui/result-export-controller.js";

const SYNTHETIC_SECRET = "synthetic fixture, never a wallet key";

function fixture(revealed = true) {
  let reads = 0;
  let visible = revealed;
  const result: DerivationResult = {
    id: "bitcoin-legacy",
    title: "Synthetic",
    networkLabel: "mainnet",
    pathTemplate: "m/i",
    basicSummary: [],
    summary: [],
    notices: [],
    rows: [
      {
        index: 0,
        path: "m/0",
        title: "Synthetic row",
        advanced: [],
        basic: [
          { key: "address", label: "Address", value: "synthetic public address", secret: false },
          {
            key: "privateKey",
            label: "Private key",
            secret: true,
            get value() {
              reads += 1;
              return SYNTHETIC_SECRET;
            },
          },
        ],
      },
    ],
  };
  const dependencies = {
    secretsRevealed: () => visible,
    writeClipboard: vi.fn(async (_text: string, _signal?: AbortSignal): Promise<void> => {}),
    downloadBlob: vi.fn((_blob: Blob, _filename: string): void => {}),
    flashCopied: vi.fn((_button: HTMLButtonElement): void => {}),
    setDownloadPreparing: vi.fn((_button: HTMLButtonElement, _preparing: boolean): void => {}),
    showError: vi.fn((_message: string): void => {}),
    showStatus: vi.fn((_message: string): void => {}),
  };
  const context: ResultExportContext = {
    adapter: getCoinAdapter("bitcoin-legacy"),
    result,
    selected: new Set([0]),
    mode: "basic",
    format: "plain",
  };
  return {
    controller: createResultExportController(dependencies),
    dependencies,
    context,
    button: new PassiveQrPage().asDocument().createElement("button"),
    reads: () => reads,
    conceal: () => {
      visible = false;
    },
  };
}

function delayNativeBlob() {
  const NativeResponse = Response;
  let release = (): void => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    "Response",
    class {
      readonly #response: Response;
      constructor(body: BodyInit, init: ResponseInit) {
        this.#response = new NativeResponse(body, init);
      }
      async blob(): Promise<Blob> {
        await pending;
        return this.#response.blob();
      }
    },
  );
  return release;
}

/** The actual view runs against the same native ID-document boundary as the child wallet. */
function nativeView() {
  const { view } = new DeriverViewFixture();
  return { view, button: view.document.querySelector<HTMLButtonElement>("#download-selection")! };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("refuses a concealed private copy before reading its values", async () => {
  const page = fixture(false);
  await page.controller.copyRows(page.button, "privateKeys", page.context);
  expect(page.reads()).toBe(0);
  expect(page.dependencies.writeClipboard).not.toHaveBeenCalled();
  expect(page.dependencies.showError).toHaveBeenCalledOnce();
});

it("withdraws a private download concealed while native Blob assembly is pending", async () => {
  const release = delayNativeBlob();
  const page = fixture();
  const finished = vi.fn();
  const pending = page.controller.downloadRows(page.button, "privateKeys", page.context, finished);
  page.conceal();
  release();
  await pending;
  expect(page.dependencies.downloadBlob).not.toHaveBeenCalled();
  expect(page.dependencies.showStatus).not.toHaveBeenCalled();
  expect(finished).toHaveBeenCalledOnce();
  expect(page.dependencies.setDownloadPreparing).toHaveBeenLastCalledWith(page.button, false);
});

it("does not repeat supplied clipboard error text in the page", async () => {
  const page = fixture();
  page.dependencies.writeClipboard.mockRejectedValueOnce(new Error(SYNTHETIC_SECRET));
  await page.controller.copyRows(page.button, "privateKeys", page.context);
  expect(page.dependencies.showError).toHaveBeenCalledOnce();
  expect(page.dependencies.showError.mock.calls.flat().join(" ")).not.toContain(SYNTHETIC_SECRET);
});

it("copies the exact selected public values while private fields stay concealed", async () => {
  const page = fixture(false);
  await page.controller.copyRows(page.button, "addresses", page.context);
  expect(page.dependencies.writeClipboard).toHaveBeenCalledExactlyOnceWith(
    "synthetic public address",
    expect.any(AbortSignal),
  );
  expect(page.reads()).toBe(0);
  expect(page.dependencies.flashCopied).toHaveBeenCalledOnce();
});

it("downloads the exact private text only after disclosure is allowed", async () => {
  const page = fixture();
  const finished = vi.fn();
  await page.controller.downloadRows(page.button, "privateKeys", page.context, finished);
  const [blob, filename] = page.dependencies.downloadBlob.mock.calls[0]!;
  expect(await blob.text()).toBe(SYNTHETIC_SECRET);
  expect(filename).toBe("bitcoin-legacy-basic-1-rows.txt");
  expect(finished).toHaveBeenCalledOnce();
});

it("withdraws an invalidated public download before native publication", async () => {
  const release = delayNativeBlob();
  const page = fixture();
  const pending = page.controller.downloadRows(page.button, "addresses", page.context, vi.fn());
  page.controller.invalidate();
  release();
  await pending;
  expect(page.dependencies.downloadBlob).not.toHaveBeenCalled();
  expect(page.dependencies.showStatus).not.toHaveBeenCalled();
});

it("cancels the native clipboard fallback and suppresses stale completion after invalidation", async () => {
  const page = fixture();
  let resolve = (): void => {};
  const pending = new Promise<void>((done) => {
    resolve = done;
  });
  page.dependencies.writeClipboard.mockReturnValueOnce(pending);
  const copied = page.controller.copyRows(page.button, "addresses", page.context);
  const signal = page.dependencies.writeClipboard.mock.calls[0]?.[1];
  expect(signal?.aborted).toBe(false);
  page.controller.invalidate();
  expect(signal?.aborted).toBe(true);
  resolve();
  await copied;
  expect(page.dependencies.flashCopied).not.toHaveBeenCalled();
  expect(page.dependencies.showStatus).not.toHaveBeenCalled();
});

it("handles unknown native export choices without reading values or rejecting the UI task", async () => {
  const page = fixture();
  await Reflect.apply(page.controller.copyRows, page.controller, [
    page.button,
    "unknown",
    page.context,
  ]);
  expect(page.reads()).toBe(0);
  expect(page.dependencies.showError).toHaveBeenCalledExactlyOnceWith(
    "Choose a supported result export action.",
  );
});

it("wipes encoded download buffers when a pending result is invalidated", async () => {
  const nativeEncoder = new TextEncoder();
  const encode = nativeEncoder.encode.bind(nativeEncoder);
  const buffers: Uint8Array[] = [];
  vi.spyOn(TextEncoder.prototype, "encode").mockImplementation((text) => {
    const bytes = encode(text);
    buffers.push(bytes);
    return bytes;
  });
  const release = delayNativeBlob();
  const page = fixture();
  const pending = page.controller.downloadRows(page.button, "privateKeys", page.context, vi.fn());
  await Promise.resolve();
  expect(buffers.some((bytes) => bytes.length > 0)).toBe(true);
  page.controller.invalidate();
  expect(buffers.every((bytes) => bytes.every((byte) => byte === 0))).toBe(true);
  release();
  await pending;
  expect(page.dependencies.downloadBlob).not.toHaveBeenCalled();
});

it("does not let an older download complete over a replacement using the same button", async () => {
  const NativeResponse = Response;
  const releases: (() => void)[] = [];
  vi.stubGlobal(
    "Response",
    class {
      readonly #native: Response;
      readonly #wait: Promise<void>;
      constructor(body: BodyInit, init: ResponseInit) {
        this.#native = new NativeResponse(body, init);
        this.#wait = new Promise((resolve) => {
          releases.push(resolve);
        });
      }
      async blob(): Promise<Blob> {
        await this.#wait;
        return this.#native.blob();
      }
    },
  );
  const page = fixture();
  const oldFinished = vi.fn();
  const newFinished = vi.fn();
  const old = page.controller.downloadRows(page.button, "addresses", page.context, oldFinished);
  const current = page.controller.downloadRows(page.button, "addresses", page.context, newFinished);
  releases[0]!();
  await old;
  expect(page.dependencies.downloadBlob).not.toHaveBeenCalled();
  expect(oldFinished).not.toHaveBeenCalled();
  expect(page.dependencies.setDownloadPreparing).toHaveBeenLastCalledWith(page.button, true);
  releases[1]!();
  await current;
  expect(page.dependencies.downloadBlob).toHaveBeenCalledOnce();
  expect(newFinished).toHaveBeenCalledOnce();
  expect(page.dependencies.setDownloadPreparing).toHaveBeenLastCalledWith(page.button, false);
});

it.each(["copy", "download"] as const)(
  "does not read concealed grouped values before %s admission",
  async (operation) => {
    const page = fixture(false);
    const row = page.context.result.rows[0]!;
    row.groups = [{ key: "keys", title: "Synthetic group", basic: row.basic, advanced: [] }];
    row.basic = [];
    if (operation === "copy")
      await page.controller.copyRows(page.button, "privateKeys", page.context);
    else await page.controller.downloadRows(page.button, "privateKeys", page.context, vi.fn());
    expect(page.reads()).toBe(0);
    expect(page.dependencies.writeClipboard).not.toHaveBeenCalled();
    expect(page.dependencies.downloadBlob).not.toHaveBeenCalled();
  },
);

it("restores the real view's original label across overlapping download preparations", () => {
  const { view, button } = nativeView();
  button.textContent = "Save selected";
  button.disabled = false;
  view.setDownloadPreparing(button, true);
  view.setDownloadPreparing(button, true);
  view.setDownloadPreparing(button, false);
  expect(button.textContent).toBe("Save selected");
  expect(button.disabled).toBe(false);
});

it("restores the real view's idle state when a native download is invalidated", async () => {
  const release = delayNativeBlob();
  const page = fixture();
  const { view, button } = nativeView();
  button.textContent = "Save selected";
  button.disabled = false;
  page.dependencies.setDownloadPreparing.mockImplementation((target, preparing) =>
    view.setDownloadPreparing(target, preparing),
  );
  const pending = page.controller.downloadRows(button, "addresses", page.context, vi.fn());
  page.controller.invalidate();
  expect(button.textContent).toBe("Save selected");
  expect(button.disabled).toBe(false);
  release();
  await pending;
  expect(page.dependencies.downloadBlob).not.toHaveBeenCalled();
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { ClipboardAction } from "../src/clipboard-action.js";
import { PassiveQrPage } from "@ckd/test-support/qr-page.js";

const TEXT = "public synthetic private-field fixture";

function fixture(revealed: boolean) {
  const native = vi.fn(async (_text: string, _signal?: AbortSignal) => {});
  const dependencies = {
    secretsRevealed: () => revealed,
    writeClipboard: native,
    flashCopied: vi.fn((_button: HTMLButtonElement) => {}),
    showError: vi.fn((_message: string) => {}),
    showStatus: vi.fn((_message: string) => {}),
  };
  return {
    owner: new ClipboardAction(dependencies),
    button: new PassiveQrPage().asDocument().createElement("button"),
    native,
    dependencies,
    conceal: () => {
      revealed = false;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("lazy clipboard disclosure", () => {
  it("refuses a concealed value before evaluating its field source", async () => {
    const f = fixture(false);
    const source = vi.fn(() => TEXT);
    await f.owner.copy(f.button, source, true);
    expect(source).not.toHaveBeenCalled();
    expect(f.native).not.toHaveBeenCalled();
    expect(f.dependencies.showError).toHaveBeenCalled();
  });

  it.each([true, false])(
    "evaluates an admitted field once and gives native clipboard text: secret=%s",
    async (secret) => {
      const f = fixture(secret);
      const source = vi.fn(() => TEXT);
      await f.owner.copy(f.button, source, secret);
      expect(source).toHaveBeenCalledTimes(1);
      expect(f.native).toHaveBeenCalledWith(TEXT, expect.any(AbortSignal));
      expect(f.dependencies.flashCopied).toHaveBeenCalledWith(f.button);
    },
  );

  it.each(["invalidate", "conceal"])(
    "refuses the native handoff if reading the source causes %s",
    async (action) => {
      const f = fixture(true);
      await f.owner.copy(
        f.button,
        () => {
          if (action === "invalidate") f.owner.invalidate();
          else f.conceal();
          return TEXT;
        },
        true,
      );
      expect(f.native).not.toHaveBeenCalled();
      expect(f.dependencies.flashCopied).not.toHaveBeenCalled();
      expect(f.dependencies.showStatus).not.toHaveBeenCalled();
    },
  );

  it("reports a failed field read without exposing its error contents or calling native clipboard", async () => {
    const f = fixture(true);
    await f.owner.copy(
      f.button,
      () => {
        throw new Error(TEXT);
      },
      true,
    );
    expect(f.native).not.toHaveBeenCalled();
    expect(f.dependencies.showError).toHaveBeenCalledExactlyOnceWith("Clipboard access failed.");
  });
});

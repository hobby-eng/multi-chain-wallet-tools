import { describe, expect, it } from "vitest";
import { MHFE_INPUT_TEXT_BYTES, MhfeInputLifetime, MhfeInputText } from "../src/mhfe-input-text.js";

function pendingReply<Value>(): { promise: Promise<Value>; resolve: (value: Value) => void } {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("MHFE borrowed input admission and ownership", () => {
  it.each(["\ud800", "\udfff", "word \ud800 word"])(
    "refuses malformed text before keeping a copy: case %#",
    (value) => {
      expect(() => new MhfeInputText(value)).toThrow(
        expect.objectContaining({ code: "mhfe.input.admission" }),
      );
    },
  );
  it.each([null, undefined, 42, {}, new Uint8Array(1)])(
    "refuses nontext with a stable host code: case %#",
    (value) => {
      expect(() => new MhfeInputText(value)).toThrow(
        expect.objectContaining({ code: "mhfe.input.admission" }),
      );
    },
  );
  it("counts raw UTF-8 bytes up to MHFE's typed line, white space included", () => {
    const fits = new MhfeInputText(" ".repeat(MHFE_INPUT_TEXT_BYTES));
    fits.wipe();
    // é is two bytes, 🙂 four: one byte too many each time.
    for (const value of [
      " ".repeat(MHFE_INPUT_TEXT_BYTES + 1),
      `${"é".repeat(MHFE_INPUT_TEXT_BYTES / 2)}a`,
      `${"🙂".repeat(MHFE_INPUT_TEXT_BYTES / 4)}a`,
    ])
      expect(() => new MhfeInputText(value)).toThrow(
        expect.objectContaining({ code: "mhfe.input.admission" }),
      );
  });
  it("keeps exact raw text until disposal", () => {
    const owner = new MhfeInputText("\ufeffé ");
    expect(owner.use((text) => text)).toBe("\ufeffé ");
    expect(JSON.stringify(owner)).not.toContain("é");
    owner.wipe();
    owner.wipe();
    expect(() => owner.use((text) => text)).toThrow(
      expect.objectContaining({ code: "core.secret-value.wiped" }),
    );
  });
  it("does not retain an input fragment in its admission diagnostic", () => {
    const value = `synthetic-private-input ${"x".repeat(MHFE_INPUT_TEXT_BYTES)}`;
    expect(() => new MhfeInputText(value)).toThrow(
      /^The MHFE input is longer than 8,192 bytes\.$/u,
    );
  });
  it("gives copied operations an independent, explicitly disposable lifetime", () => {
    const source = new MhfeInputText("synthetic");
    using copy = source.copy();
    source.wipe();
    expect(copy.use((text) => text)).toBe("synthetic");
    expect(() => source.copy()).toThrow(
      expect.objectContaining({ code: "core.secret-value.wiped" }),
    );
  });
});

describe("MHFE active input lifetimes", () => {
  it("wipes a pending input immediately when its host retires", async () => {
    using lifetime = new MhfeInputLifetime();
    const input = new MhfeInputText("synthetic");
    const reply = pendingReply<string>();
    const pending = lifetime.hold(input, () => reply.promise);
    expect(input.use((text) => text)).toBe("synthetic");
    lifetime.wipe();
    expect(() => input.use((text) => text)).toThrow(
      expect.objectContaining({ code: "core.secret-value.wiped" }),
    );
    reply.resolve("finished");
    await expect(pending).resolves.toBe("finished");
  });

  it("keeps a replacement input live when an older retired reply arrives", async () => {
    using lifetime = new MhfeInputLifetime();
    const oldReply = pendingReply<void>();
    const newReply = pendingReply<void>();
    const oldInput = new MhfeInputText("old");
    const oldPending = lifetime.hold(oldInput, () => oldReply.promise);
    lifetime.wipe();
    const newInput = new MhfeInputText("new");
    const newPending = lifetime.hold(newInput, () => newReply.promise);
    oldReply.resolve();
    await oldPending;
    expect(newInput.use((text) => text)).toBe("new");
    newReply.resolve();
    await newPending;
    expect(() => newInput.assertLive()).toThrow(
      expect.objectContaining({ code: "core.secret-value.wiped" }),
    );
  });

  it("wipes on failure and preserves the original failure identity", async () => {
    using lifetime = new MhfeInputLifetime();
    const input = new MhfeInputText("synthetic");
    const failure = new Error("synthetic worker failure");
    await expect(lifetime.hold(input, () => Promise.reject(failure))).rejects.toBe(failure);
    expect(() => input.assertLive()).toThrow(
      expect.objectContaining({ code: "core.secret-value.wiped" }),
    );
  });

  it("refuses overlapping ownership without retiring the original operation", async () => {
    using lifetime = new MhfeInputLifetime();
    const input = new MhfeInputText("synthetic");
    const reply = pendingReply<void>();
    const pending = lifetime.hold(input, () => reply.promise);
    await expect(lifetime.hold(input, () => Promise.resolve())).rejects.toMatchObject({
      code: "mhfe.input.owned",
    });
    expect(input.use((text) => text)).toBe("synthetic");
    reply.resolve();
    await pending;
    await expect(lifetime.hold(input, () => Promise.resolve())).rejects.toMatchObject({
      code: "core.secret-value.wiped",
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { Bip38Input, Bip38InputError } from "../src/bip38-input.js";
import { Bip38Batch } from "../src/bip38-batch.js";
import { decryptBip38Key } from "../src/bip38-decryptor.js";
import { Bip38Results } from "../src/bip38-results.js";
import { CompleteIdPage } from "../../../test/support/complete-id-page.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BIP38 operation admission", () => {
  it("preserves delimiter and deduplication behavior under the library's one batch limit", () => {
    expect(Bip38Input.batch("6Pfirst, 6Psecond;6Pfirst\n6Pthird")).toEqual([
      "6Pfirst",
      "6Psecond",
      "6Pthird",
    ]);
    const keys = Array.from({ length: Bip38Input.parameters.maxKeys }, (_, index) => `6P${index}`);
    expect(Bip38Input.batch(keys.join("\n"))).toHaveLength(keys.length);
    expect(() => Bip38Input.batch([...keys, "6Pextra"].join("\n"))).toThrow(
      expect.objectContaining({ code: "count" }),
    );
  });

  it.each([null, 42, {}, "x".repeat(Bip38Input.parameters.maxFieldCodeUnits + 1)])(
    "refuses an invalid raw field before parsing: case %#",
    (value) => {
      expect(() => Bip38Input.batch(value)).toThrow(expect.objectContaining({ code: "text" }));
      expect(() => Bip38Input.password(value)).toThrow(expect.objectContaining({ code: "text" }));
    },
  );

  it("rejects empty input/password without trimming an intentional whitespace password", () => {
    expect(() => Bip38Input.batch(" ,;\n")).toThrow(expect.objectContaining({ code: "empty" }));
    expect(() => Bip38Input.password("")).toThrow(expect.objectContaining({ code: "password" }));
    expect(Bip38Input.password(" ")).toBe(" ");
  });

  it("keeps single-key compatibility refusals asynchronous and does not default unknown choices", async () => {
    await expect(
      decryptBip38Key("not a key", "synthetic", "bitcoin", "mainnet"),
    ).rejects.toMatchObject({ code: "key" });
    expect(() => Bip38Input.chain("unknown")).toThrow(
      expect.objectContaining({ code: "INVALID_CHAIN" }),
    );
    for (const network of ["unknown", null])
      expect(() => Bip38Input.network("bitcoin", network)).toThrow(
        expect.objectContaining({ code: "INVALID_NETWORK" }),
      );
    expect(Bip38Input.message(new Error("synthetic secret must not be shown"))).not.toContain(
      "synthetic secret",
    );
    const changedMessage = new Bip38InputError("key");
    changedMessage.message = "synthetic secret must not be shown";
    expect(Bip38Input.message(changedMessage)).not.toContain("synthetic secret");
  });

  it("owns exact snapshots, refuses invalid indexes and retires all later reads", () => {
    const batch = new Bip38Batch("6Pone;6Ptwo", "synthetic", "dash", "testnet");
    expect(batch.count).toBe(2);
    expect(batch.matches("6Pone;6Ptwo", "synthetic", "dash", "testnet")).toBe(true);
    expect(batch.matches("6Pone;6Ptwo ", "synthetic", "dash", "testnet")).toBe(false);
    for (const index of [-1, 0.5, 2, Number.NaN])
      expect(() => batch.decrypt(index)).toThrow(expect.objectContaining({ code: "index" }));
    batch.wipe();
    batch.wipe();
    expect(batch.matches("6Pone;6Ptwo", "synthetic", "dash", "testnet")).toBe(false);
    expect(() => batch.decrypt(0)).toThrow(expect.objectContaining({ code: "released" }));
    expect(JSON.stringify(batch)).not.toContain("synthetic");
  });
});

describe("BIP38 result disclosure lifetime", () => {
  it.each([false, true])(
    "only reports a clipboard failure belonging to the current result, retired=%s",
    async (retired) => {
      new CompleteIdPage();
      let reject: ((cause: unknown) => void) | undefined;
      const pending = new Promise<void>((_resolve, fail) => {
        reject = fail;
      });
      vi.stubGlobal("navigator", { clipboard: { writeText: () => pending } });
      const notify = vi.fn();
      const list = document.createElement("div");
      const owner = new Bip38Results(list, document.createElement("button"), notify);
      owner.success(1, {
        address: "synthetic",
        wif: "synthetic-private-WIF",
        privateKeyHex: "11".repeat(32),
        compressed: true,
      });
      owner.toggle();
      list.querySelector<HTMLButtonElement>("[data-copy-bip38-secret]")!.click();
      if (retired) owner.clear();
      const cause = new Error("Synthetic native clipboard failure");
      reject!(cause);
      for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
      if (retired) expect(notify).not.toHaveBeenCalled();
      else expect(notify).toHaveBeenCalledExactlyOnceWith(cause);
      owner.dispose();
    },
  );

  it("accepts the offered Bitcoin regtest choice and refuses unsupported Dash regtest", () => {
    using batch = new Bip38Batch("6Psynthetic", "synthetic", "bitcoin", "regtest");
    expect(batch.matches("6Psynthetic", "synthetic", "bitcoin", "regtest")).toBe(true);
    expect(() => new Bip38Batch("6Psynthetic", "synthetic", "dash", "regtest")).toThrow();
  });

  it("clears retained fields and aborts detached copy handlers before replacement", async () => {
    new CompleteIdPage();
    const copy = vi.fn(async (_text: string) => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    const list = document.createElement("div");
    const toggle = document.createElement("button");
    const results = new Bip38Results(list, toggle, () => {
      throw new Error("Unexpected native clipboard failure");
    });
    results.success(1, {
      address: "synthetic-address",
      wif: "synthetic-private-WIF",
      privateKeyHex: "11".repeat(32),
      compressed: true,
    });
    const field = list.querySelector<HTMLInputElement>("[data-bip38-secret]")!;
    const button = list.querySelector<HTMLButtonElement>("[data-copy-bip38-secret]")!;
    expect(field.type).toBe("password");
    expect(button.disabled).toBe(true);
    results.toggle();
    button.click();
    await Promise.resolve();
    expect(copy).toHaveBeenCalledExactlyOnceWith("synthetic-private-WIF");
    copy.mockClear();
    results.clear();
    expect(field.value).toBe("");
    expect(field.type).toBe("password");
    expect(button.disabled).toBe(true);
    expect(list.children).toHaveLength(0);
    button.dispatchEvent(new Event("click"));
    await Promise.resolve();
    expect(copy).not.toHaveBeenCalled();
    results.dispose();
    results.dispose();
    expect(() => results.toggle()).toThrow(expect.objectContaining({ code: "released" }));
    expect(() => results.failure(2, new Error("synthetic"))).toThrow(
      expect.objectContaining({ code: "released" }),
    );
  });
});

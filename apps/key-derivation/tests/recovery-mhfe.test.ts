import { describe as group, expect, it } from "vitest";
import { MhfeError } from "@ckd/recovery-mhfe-wasm/client.js";
import {
  FULL_SUITE_ID,
  SAME_LENGTH_SUITE_ID,
  clearOnFirstProgress,
  describe,
  readBackDiffers,
  recoverySummary,
  rememberNote,
} from "../src/ui/recovery-mhfe-status.js";

group("MHFE panel", () => {
  it("empties the password fields once, when the operation reports its first progress", () => {
    const password = { value: "public test password" } as HTMLInputElement;
    const repeat = { value: "public test password" } as HTMLInputElement;
    const clear = clearOnFirstProgress(password, repeat);
    expect(password.value).toBe("public test password");
    clear();
    expect([password.value, repeat.value]).toEqual(["", ""]);
    password.value = "typed again";
    clear();
    expect(password.value).toBe("typed again");
  });

  it("says that an error in the page stopped the operation", () => {
    const cause = new Error("progress element missing");
    // The error as the MHFE client gives it: its constructor stores the page's error as `cause`.
    const error = Object.defineProperty(
      new MhfeError("CALLBACK_FAILED", "callback failed"),
      "cause",
      { value: cause },
    );
    expect(describe(error, "fallback")).toContain(
      "Stopped because this page failed to show the progress (progress element missing)",
    );
    expect(describe(new MhfeError("CANCELLED", "x"), "fallback")).toContain("Stopped.");
    expect(describe(new MhfeError("EMPTY_PASSWORD", "The password is empty."), "fallback")).toBe(
      "The password is empty.",
    );
  });

  it("tells what to keep for a same-length container and for a 24-word one", () => {
    const same = rememberNote(12, true, false, 0, SAME_LENGTH_SUITE_ID);
    expect(same).toContain(`Suite ${SAME_LENGTH_SUITE_ID}.`);
    expect(same).toContain("the 12 words and the password are enough");
    expect(same).toContain("copy these 12 words exactly");
    // The fingerprint under a recovered phrase is computed without a BIP39 passphrase.
    expect(same).toContain("without a BIP39 passphrase");
    expect(same).not.toContain("Remember the word count");

    const full = rememberNote(12, false, true, 0, FULL_SUITE_ID);
    expect(full).toContain(`Suite ${FULL_SUITE_ID}.`);
    expect(full).toContain("Remember the word count: your phrase has 12 words");
    expect(full).toContain("copy these 24 words exactly");
    expect(full).not.toContain("Nothing else needs to be kept");
  });

  it("never calls a same-length recovery verified", () => {
    const phrase = "public test phrase";
    expect(
      recoverySummary({ words: 12, verified: false, phrase, suiteId: SAME_LENGTH_SUITE_ID }, 0),
    ).toMatch(
      /^Not verified: this container keeps the length of its 12-word phrase.*passphrase\.$/u,
    );
    expect(
      recoverySummary({ words: 12, verified: true, phrase, suiteId: FULL_SUITE_ID }, 0),
    ).toContain("the built-in check passed");
    expect(
      recoverySummary({ words: 24, verified: false, phrase, suiteId: FULL_SUITE_ID }, 0),
    ).toContain("no shorter length passed its check");
  });

  it("shows the words read back only when they differ from the entry", () => {
    const read = "abandon ability able about";
    expect(readBackDiffers("  Abandon  ability\nable ABOUT ", read)).toBe(false);
    // Words shortened to their first four letters are written out by the reader.
    expect(readBackDiffers("aban abil able abou", read)).toBe(true);
  });
});

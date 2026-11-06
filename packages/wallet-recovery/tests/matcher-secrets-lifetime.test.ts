import { afterEach, expect, it, vi } from "vitest";
import { MatcherSecrets } from "../src/matcher-secrets.js";
import { SecretValue } from "@ckd/core/secret-value.js";

afterEach(() => vi.restoreAllMocks());

it("refuses fallible metadata before acquiring private bytes and leaves the owner usable", () => {
  const original = SecretValue.utf16Texts.bind(SecretValue);
  const acquire = vi.spyOn(SecretValue, "utf16Texts").mockImplementation(original);
  using owner = new MatcherSecrets();
  expect(() =>
    owner.add(
      ["1", "public target", "Bitcoin", "m/44"],
      [
        {
          key: "wif",
          get label(): string {
            throw new Error("Synthetic metadata refusal");
          },
          value: "synthetic private output",
          secret: true,
        },
      ],
    ),
  ).toThrow("Synthetic metadata refusal");
  expect(acquire).not.toHaveBeenCalled();
  expect(owner.size).toBe(0);
  owner.add(
    ["2", "public target", "Bitcoin", "m/44"],
    [{ key: "wif", label: "WIF", value: "healthy private output", secret: true }],
  );
  expect(owner.size).toBe(1);
  expect(owner.tsv().split("\n")).toHaveLength(2);
});

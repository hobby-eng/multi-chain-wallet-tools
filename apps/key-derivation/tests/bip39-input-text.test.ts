import { expect, it } from "vitest";
import { Bip39InputError } from "@ckd/core/bip39-input.js";
import { Bip39InputText } from "../src/ui/bip39-input-text.js";
import { DerivationErrorText } from "../src/ui/derivation-error-text.js";
import { DerivationWorkerError } from "../src/workers/derive-client.js";

it.each([
  { code: "bip39.input.text", text: "Enter the recovery phrase as text." },
  {
    code: "bip39.input.text-size",
    text: "The recovery phrase exceeds the 8192 UTF-16 code unit limit. Shorten the input; it has not been truncated.",
  },
  {
    code: "bip39.input.diagnostic-count",
    text: "The diagnostic accepts at most 48 words. Shorten the input to inspect it.",
  },
] as const)(
  "keeps one input-free $code message through native and worker boundaries",
  ({ code, text }) => {
    expect(Bip39InputText.of(new Bip39InputError(code))).toBe(text);
    expect(
      DerivationErrorText.of(new DerivationWorkerError("Synthetic private detail", code)),
    ).toBe(text);
  },
);

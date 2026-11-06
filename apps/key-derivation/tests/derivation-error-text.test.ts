import { expect, it } from "vitest";
import { DerivationErrorText } from "../src/ui/derivation-error-text.js";
import { DerivationWorkerError } from "../src/workers/derive-client.js";
import { DerivationSecretsError } from "@ckd/core/secrets.js";
import { DerivationResultsError } from "@ckd/ui/derivation-results.js";
import { RenderedSecretsError } from "../src/ui/secrets.js";

it.each([
  {
    code: "ui.secret.cleanup",
    text: "A private result could not be cleared normally. Close this wallet page.",
  },
  {
    code: "ui.secret.retired",
    text: "This private result is being replaced or cleared. Run the operation again.",
  },
] as const)("translates $code without exposing native cleanup details", ({ code, text }) => {
  expect(DerivationErrorText.of(new RenderedSecretsError(code))).toBe(text);
  expect(DerivationErrorText.of({ code, message: "synthetic private native detail" })).toBe(text);
});

it("translates a reentrant branch refusal before and after worker transport", () => {
  const code = "derivation.results.mutating";
  const text = "The wallet results are being replaced or cleared. Derive the wallet again.";
  expect(DerivationErrorText.of(new DerivationResultsError(code))).toBe(text);
  expect(DerivationErrorText.of(new DerivationWorkerError("synthetic private detail", code))).toBe(
    text,
  );
});

it.each([
  {
    code: "derivation.key.address",
    text: "The selected address no longer matches the requested derivation path.",
  },
  {
    code: "derivation.key.unavailable",
    text: "This derivation mode does not expose a compatible private key.",
  },
  {
    code: "derivation.key.material",
    text: "The derived private key could not be read in its expected form.",
  },
  {
    code: "derivation.result.text",
    text: "The derivation result contains an invalid private text field.",
  },
  {
    code: "derivation.result.retired",
    text: "This derivation result has already been cleared. Derive it again.",
  },
  {
    code: "derivation.result.property",
    text: "The derivation result could not release its private text normally.",
  },
] as const)(
  "translates $code from local and worker errors without repeating supplied diagnostics",
  ({ code, text }) => {
    expect(DerivationErrorText.of(new DerivationSecretsError(code))).toBe(text);
    expect(
      DerivationErrorText.of(new DerivationWorkerError("synthetic private diagnostic", code)),
    ).toBe(text);
  },
);

it("uses the input-free fallback for an unknown worker refusal", () => {
  expect(
    DerivationErrorText.of(
      new DerivationWorkerError("synthetic private diagnostic"),
      "The requested derivation failed.",
    ),
  ).toBe("The requested derivation failed.");
});

it.each([new Error("synthetic private detail"), "synthetic private thrown text"])(
  "does not display an unknown native failure or thrown text",
  (cause) => {
    expect(DerivationErrorText.of(cause)).toBe("Derivation failed.");
  },
);

it("does not coerce an unknown thrown object to text", () => {
  let reads = 0;
  const cause = {
    toString() {
      reads += 1;
      return "synthetic private detail";
    },
  };
  expect(DerivationErrorText.of(cause)).toBe("Derivation failed.");
  expect(reads).toBe(0);
});

it("handles a failing foreign code getter without exposing its supplied detail", () => {
  const cause = new Error("synthetic private message");
  Object.defineProperty(cause, "code", {
    get() {
      throw new Error("synthetic private getter");
    },
  });
  expect(DerivationErrorText.of(cause)).toBe("Derivation failed.");
});

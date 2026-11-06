import { expect, it } from "vitest";
import { assertPsbtComposition } from "./psbt-inspector-composition.mjs";

const options = (features) => ({ has: (name) => features.includes(name), hasCoin: () => true });

it("excludes the Script decoding owner unless a consumer capability is selected", () => {
  const source = ["apps/psbt-inspector/src/script-decoder.ts"];
  expect(() => assertPsbtComposition(options([]), source)).toThrow("excluded script-decoder");
  for (const feature of ["script-decoder", "descriptor-decoder"])
    expect(() =>
      assertPsbtComposition(options([feature]), [
        ...source,
        "apps/psbt-inspector/src/script-decoder-feature.ts",
        `apps/psbt-inspector/src/${feature === "script-decoder" ? "script" : "descriptor"}.ts`,
      ]),
    ).not.toThrow();
});

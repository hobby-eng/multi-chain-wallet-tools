import { expect, it } from "vitest";
import { assertKeyDerivationComposition } from "./key-derivation-composition.mjs";
import { assertDashOnlyGraph } from "./build-profiles.mjs";

it.each(["silent-payments", "silent-payment-parameters"])(
  "excludes the Bitcoin %s library when Silent Payments is absent",
  (module) => {
    const path = `packages/coin-protocols/src/coins/bitcoin/${module}.ts`;
    expect(() =>
      assertKeyDerivationComposition({ has: () => false, hasCoin: () => true }, [path]),
    ).toThrow("silent-payments is excluded");
    expect(() => assertDashOnlyGraph([path], "Silent Payments")).toThrow();
  },
);

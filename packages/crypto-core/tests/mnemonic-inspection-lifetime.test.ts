import { expect, it } from "vitest";
import { diagnoseMnemonic } from "../src/bip39.js";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

it.each([PHRASE, PHRASE.replace("about", "abandno"), ""])(
  "retires every retained diagnostic secret view for a bounded phrase",
  (phrase) => {
    const diagnostic = diagnoseMnemonic(phrase);
    const wipe: unknown = Reflect.get(diagnostic, "wipe");
    expect(typeof wipe).toBe("function");
    if (typeof wipe !== "function") throw new Error("The diagnostic must own its lifetime.");
    Reflect.apply(wipe, diagnostic, []);
    for (const property of ["normalized", "words", "unknownWords", "construction"])
      expect(() => {
        Reflect.get(diagnostic, property);
      }).toThrow(expect.objectContaining({ code: "bip39.diagnostic.retired" }));
    Reflect.apply(wipe, diagnostic, []);
  },
);

import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.file-name", {
  "invalid-component": () => "An export file name must be one safe path component.",
});
/** ASCII space: every lower code point is a control character, unsafe in an output name. */
const FIRST_PRINTABLE_CHARACTER = 0x20;

/** Shared filename admission for filesystem exports and browser downloads; never coerces input. */
export class ExportFileName {
  /** Returns one safe component; refuses traversal, separators, controls and Windows special names. */
  static checked(name: unknown): string {
    if (
      typeof name !== "string" ||
      name === "" ||
      name === "." ||
      name === ".." ||
      /[/\\<>:"|?*]/u.test(name) ||
      Array.from(name).some(
        (character) => (character.codePointAt(0) ?? 0) < FIRST_PRINTABLE_CHARACTER,
      ) ||
      /[. ]$/u.test(name) ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(name)
    )
      throw ERRORS.create("invalid-component", []);
    return name;
  }
}

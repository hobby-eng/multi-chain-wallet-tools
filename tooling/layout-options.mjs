import { resolve } from "node:path";
import { BUILD_PROFILES, getToolBuild, profileToolIds } from "./build-profiles.mjs";

const DEFAULT_WIDTHS = [1280, 768, 390]; // Desktop, tablet and phone widths in CSS pixels.
const MAXIMUM_WIDTH = 16384;
const MAXIMUM_WIDTH_COUNT = 16;
const MAXIMUM_PAGE_COUNT = 64;
const VALUE_OPTIONS = new Set(["--profile", "--tool", "--widths", "--json"]);
const MAXIMUM_ARGUMENT_COUNT = MAXIMUM_PAGE_COUNT + 2 * VALUE_OPTIONS.size + 2;
const REFUSALS = {
  argument: "Use declared layout options with one nonempty value each.",
  duplicate: "Supply each layout option once.",
  profile: "Select a declared build profile or all.",
  tool: "Select a tool available in the requested build profiles.",
  widths: `Supply 1 to ${MAXIMUM_WIDTH_COUNT} distinct integer widths from 1 to ${MAXIMUM_WIDTH} CSS pixels.`,
  pages: `Select 1 to ${MAXIMUM_PAGE_COUNT} HTML pages for the layout check.`,
  conflict:
    "Use profile/tool selectors for built pages, or explicit HTML paths; self-test runs alone.",
};

/** Stable input-free refusal before any Playwright load or browser launch. */
export class LayoutOptionsError extends Error {
  code;
  constructor(reason) {
    super(REFUSALS[reason]);
    this.name = "LayoutOptionsError";
    this.code = `layout.${reason}`;
  }
}

/** Owns admitted page selection and bounded viewport work for the layout command. */
export class LayoutOptions {
  #paths;
  #widths;
  #json;
  #selfTest;

  /** Validates every argument, including selectors, before selecting any explicit or built page. */
  constructor(argv, root) {
    if (!Array.isArray(argv) || argv.length > MAXIMUM_ARGUMENT_COUNT)
      throw new LayoutOptionsError("argument");
    argv = Array.from(argv);
    if (argv.some((value) => typeof value !== "string" || value === ""))
      throw new LayoutOptionsError("argument");
    const { values, paths, selfTest } = LayoutOptions.#parse(argv);
    this.#selfTest = selfTest;
    this.#json = values.get("--json");
    this.#widths = LayoutOptions.#parseWidths(values.get("--widths"));
    if (selfTest) {
      if (values.size > 0 || paths.length > 0) throw new LayoutOptionsError("conflict");
      this.#paths = [];
      return;
    }
    if (paths.length > 0 && (values.has("--profile") || values.has("--tool")))
      throw new LayoutOptionsError("conflict");
    const requested = values.get("--profile") ?? "all";
    const profiles = Object.values(BUILD_PROFILES).filter(
      (profile) => requested === "all" || requested === profile.id,
    );
    if (profiles.length === 0) throw new LayoutOptionsError("profile");
    const tool = values.get("--tool");
    const selected = profiles.flatMap((profile) =>
      profileToolIds(profile)
        .filter((id) => tool === undefined || id === tool)
        .map((id) => resolve(root, "dist", getToolBuild(profile, id).artifactRelativePath)),
    );
    if (selected.length === 0) throw new LayoutOptionsError("tool");
    this.#paths = paths.length > 0 ? paths.map((path) => resolve(root, path)) : selected;
    if (this.#paths.length === 0 || this.#paths.length > MAXIMUM_PAGE_COUNT)
      throw new LayoutOptionsError("pages");
  }

  static #parse(argv) {
    const values = new Map();
    const paths = [];
    let selfTest = false;
    let pathsOnly = false;
    for (let index = 0; index < argv.length; index += 1) {
      const argument = argv[index];
      if (pathsOnly || !argument.startsWith("-")) {
        paths.push(argument);
        continue;
      }
      if (argument === "--") {
        pathsOnly = true;
        continue;
      }
      if (argument === "--self-test") {
        if (selfTest) throw new LayoutOptionsError("duplicate");
        selfTest = true;
        continue;
      }
      const separator = argument.indexOf("=");
      const name = separator < 0 ? argument : argument.slice(0, separator);
      if (!VALUE_OPTIONS.has(name)) throw new LayoutOptionsError("argument");
      if (values.has(name)) throw new LayoutOptionsError("duplicate");
      const value = separator < 0 ? argv[++index] : argument.slice(separator + 1);
      if (value === undefined || value === "" || value.startsWith("--"))
        throw new LayoutOptionsError("argument");
      values.set(name, value);
    }
    return { values, paths, selfTest };
  }

  static #parseWidths(raw) {
    if (raw === undefined) return [...DEFAULT_WIDTHS];
    if (raw.length > MAXIMUM_WIDTH_COUNT * (String(MAXIMUM_WIDTH).length + 1))
      throw new LayoutOptionsError("widths");
    const parts = raw.split(",");
    if (
      parts.length === 0 ||
      parts.length > MAXIMUM_WIDTH_COUNT ||
      parts.some((part) => !/^[1-9][0-9]*$/u.test(part))
    )
      throw new LayoutOptionsError("widths");
    const widths = parts.map(Number);
    if (
      new Set(widths).size !== widths.length ||
      widths.some((value) => !Number.isSafeInteger(value) || value > MAXIMUM_WIDTH)
    )
      throw new LayoutOptionsError("widths");
    return widths;
  }

  /** Desktop width used by the command's single-page synthetic self-test, in CSS pixels. */
  static get selfTestWidth() {
    return DEFAULT_WIDTHS[0];
  }
  /** A separate absolute path list; an ordinary check always has at least one selected page. */
  get paths() {
    return [...this.#paths];
  }
  /** A separate viewport-width list, in CSS pixels, with bounded count and extent. */
  get widths() {
    return [...this.#widths];
  }
  /** Optional output path; the caller writes a report only after completing the check. */
  get json() {
    return this.#json;
  }
  /** True only for the standalone synthetic checker self-test. */
  get selfTest() {
    return this.#selfTest;
  }
}

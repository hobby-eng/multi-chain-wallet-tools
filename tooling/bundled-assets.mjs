import { realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

const LOADERS = Object.freeze({
  ".wasm": "binary",
  ".ttf": "binary",
  ".png": "binary",
  ".jpg": "binary",
  ".md": "text",
  ".json": "json",
});

class BundledAssetError extends Error {
  #code;

  constructor(code, message) {
    super(message);
    this.name = "BundledAssetError";
    this.#code = code;
  }

  get code() {
    return this.#code;
  }
}

/** Resolves bundled resources to existing files owned by the analyzed checkout. */
export class BundledAssets {
  #root;
  #paths;

  /** Uses the same alias table as the compiler; the root must already exist. */
  constructor(root, paths = {}) {
    this.#root = realpathSync(root);
    this.#paths = paths;
  }

  /** The browser builder and graph verifier share one supported resource catalog. */
  static get loaders() {
    return LOADERS;
  }

  /** Leaves source-code imports to compiler resolution. */
  static accepts(specifier) {
    return Object.hasOwn(LOADERS, extname(BundledAssets.#resourcePath(specifier)));
  }

  /** Returns an owned resource edge, or undefined for code and external package imports. */
  resolve(file, specifier) {
    const resource = BundledAssets.#resourcePath(specifier);
    const candidates = this.#candidates(file, resource);
    if (!BundledAssets.accepts(specifier) && !BundledAssets.accepts(candidates[0] ?? ""))
      return undefined;
    if (candidates.length === 0) return undefined;
    if (specifier !== resource) this.#assertNoLiteralSuffix(file, specifier);
    for (const candidate of candidates) {
      this.#assertOwned(candidate);
      try {
        const target = realpathSync(candidate);
        this.#assertOwned(target);
        if (statSync(target).isFile()) return target;
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      }
    }
    throw new BundledAssetError("build.asset.missing", "A bundled resource file is missing.");
  }

  static #resourcePath(specifier) {
    // esbuild retries a failed filesystem lookup without its query/fragment suffix.
    return specifier.replace(/[?#].*$/u, "");
  }

  #assertNoLiteralSuffix(file, specifier) {
    for (const candidate of this.#candidates(file, specifier)) {
      this.#assertOwned(candidate);
      try {
        statSync(candidate);
      } catch (error) {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") continue;
        throw error;
      }
      throw new BundledAssetError(
        "build.asset.literal-suffix",
        "A bundled resource suffix names an unsupported literal filesystem entry.",
      );
    }
  }

  #candidates(file, specifier) {
    if (specifier.startsWith(".") || isAbsolute(specifier))
      return [resolve(dirname(file), specifier)];
    if (Object.hasOwn(this.#paths, specifier)) return this.#targets(this.#paths[specifier]);
    let best;
    let ambiguous = false;
    for (const [alias, targets] of Object.entries(this.#paths)) {
      const parts = alias.split("*");
      if (parts.length === 1) continue;
      if (parts.length !== 2)
        throw new BundledAssetError(
          "build.asset.alias-pattern",
          "A resource alias has an unsupported wildcard pattern.",
        );
      const [prefix, suffix] = parts;
      if (
        specifier.length < prefix.length + suffix.length ||
        !specifier.startsWith(prefix) ||
        !specifier.endsWith(suffix)
      )
        continue;
      if (best === undefined || prefix.length > best.prefix.length) {
        best = { prefix, suffix, targets };
        ambiguous = false;
      } else if (prefix.length === best.prefix.length) {
        ambiguous = true;
      }
    }
    if (ambiguous)
      throw new BundledAssetError(
        "build.asset.alias-ambiguous",
        "Overlapping resource aliases need an unambiguous longest prefix.",
      );
    if (best === undefined) return [];
    return this.#targets(
      best.targets,
      specifier.slice(best.prefix.length, specifier.length - best.suffix.length),
    );
  }

  #targets(targets, matched) {
    if (
      !Array.isArray(targets) ||
      targets.length === 0 ||
      targets.some((target) => typeof target !== "string" || target.split("*").length > 2)
    )
      throw new BundledAssetError(
        "build.asset.alias-targets",
        "A resource alias needs supported file targets.",
      );
    return targets.map((target) =>
      resolve(this.#root, matched === undefined ? target : target.replace("*", matched)),
    );
  }

  #assertOwned(target) {
    const path = relative(this.#root, target);
    if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path))
      throw new BundledAssetError(
        "build.asset.outside-root",
        "A bundled resource is outside the analyzed checkout.",
      );
  }
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { englishList } from "../packages/crypto-core/src/listing.ts";
import { WASM_CATALOG } from "./wasm-modules.mjs";

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;

function versionOf(manifest, label) {
  const version = String(manifest.version ?? "");
  if (!VERSION_PATTERN.test(version)) throw new Error(`${label} version must use x.y.z.`);
  return version;
}

/** Application release metadata and independently versioned reusable bridges. */
export class ProjectMetadata {
  #root;
  #release;
  #independent;

  constructor(root) {
    this.#root = root;
    this.#release = readReleaseMetadata(root);
    this.#independent = new Set(
      WASM_CATALOG.firstParty()
        .filter((module) => module.releaseManaged === false)
        .map((module) => `packages/${module.packageDirectory}`),
    );
  }

  get release() {
    return this.#release;
  }

  packageVersion(directory) {
    if (!this.#independent.has(directory)) return this.#release.version;
    const path = resolve(this.#root, directory, "package.json");
    return versionOf(JSON.parse(readFileSync(path, "utf8")), directory);
  }
}

export const PRODUCT_FACTS = Object.freeze({
  multiChainCoins: Object.freeze(["Bitcoin", "Ethereum", "Dash"]),
  multiChainCoinIds: Object.freeze(["bitcoin", "ethereum", "dash"]),
  dashCommunityCapabilities: Object.freeze([
    "Dash Core",
    "Dash Platform payments",
    "Dash Platform Identity",
    "Dash Purpose48 P2SH multisig cosigner",
    "Dash Orchard",
  ]),
  tools: Object.freeze([
    "Wallet Key Derivation Tool",
    "Wallet Activity Viewer",
    "Wallet Discovery Scanner",
    "PSBT & Multisig Inspector",
  ]),
});

export function formatEnglishList(values) {
  return englishList(values, "and");
}

export function readReleaseMetadata(root) {
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const version = versionOf(manifest, "package.json");
  const releaseDate = String(manifest.releaseDate ?? "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(releaseDate) ||
    Number.isNaN(Date.parse(`${releaseDate}T00:00:00Z`))
  ) {
    throw new Error("package.json releaseDate must be a valid YYYY-MM-DD date.");
  }
  return Object.freeze({ version, releaseDate, tag: `v${version}` });
}

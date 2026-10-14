import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pins from "./toolchain-pins.json" with { type: "json" };

// Node and pnpm already have their authoritative metadata; Rust and bindgen use this neutral pin.
export const TOOLCHAIN_PINS = Object.freeze(pins);

/** Docker bootstrap runs before Node exists, so its static Node pin is reconciled here. */
export function verifyToolchainProjections(root) {
  const node = readFileSync(resolve(root, ".node-version"), "utf8").trim();
  for (const file of ["Dockerfile.reproducible", "Dockerfile.launchers"]) {
    const source = readFileSync(resolve(root, file), "utf8");
    if (source.match(/^ARG NODE_VERSION=(.+)$/mu)?.[1] !== node)
      throw new Error(`${file} Node pin differs from .node-version.`);
    if (!source.includes("COPY tooling/toolchain-pins.json /tmp/toolchain-pins.json"))
      throw new Error(`${file} must consume the shared Rust toolchain pins.`);
  }
}

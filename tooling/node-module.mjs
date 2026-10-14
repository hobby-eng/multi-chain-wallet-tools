// A module of the tools built for Node and imported, the way the smoke checks and the self-test
// checks run browser code outside a browser: bundled into a temporary folder, which is removed
// once the caller is done with the module.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

export const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

/**
 * Bundles `entry` (a path from the repository root, or `{ contents }` of a TypeScript entry) for
 * Node, imports it, and passes the module to `use`; returns what `use` returns. `options` adds
 * esbuild settings such as defines or loaders.
 */
export async function withNodeModule(entry, use, options = {}) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "wallet-tools-node-module-"));
  const outfile = join(temporaryDirectory, "module.mjs");
  try {
    await build({
      ...(typeof entry === "string"
        ? { entryPoints: [resolve(root, entry)] }
        : { stdin: { contents: entry.contents, loader: "ts", resolveDir: root } }),
      outfile,
      bundle: true,
      format: "esm",
      platform: "node",
      logLevel: "silent",
      ...options,
    });
    return await use(await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

/** The network a smoke check was asked for: its first argument, `fallback` by default. */
export function smokeNetwork(label, fallback = "mainnet") {
  const network = process.argv[2] ?? fallback;
  if (network !== "mainnet" && network !== "testnet")
    throw new Error(`${label} argument must be mainnet or testnet.`);
  return network;
}

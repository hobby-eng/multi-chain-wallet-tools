// AUD-026 build reviewer: runs an unmodified builder script and prints, for every esbuild bundle it
// makes, the import chain from the bundle's entry to each input whose path contains TRACE_TARGET.
// It wraps esbuild's build() through a Node module hook; the builder and the repository are not
// changed. Usage:
//   TRACE_TARGET=/crypto-core/src/bip39.ts node docs/audits/AUD-026-harnesses/build-import-chain.mjs \
//     apps/discovery-scanner/scripts/build-discovery-scanner-html.mjs --coins bitcoin ...
// The exit code is the builder's.
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [script, ...args] = process.argv.slice(2);
if (!script || !process.env.TRACE_TARGET)
  throw new Error("Usage: TRACE_TARGET=... build-import-chain.mjs <script> [args]");
const hook = `
export async function resolve(specifier, context, next) {
  if (specifier === "esbuild" && !context.parentURL?.includes("aud026-esbuild-wrapper")) {
    return { url: "data:text/javascript," + "/*aud026-esbuild-wrapper*/" + encodeURIComponent(${JSON.stringify(wrapperSource())}), shortCircuit: true };
  }
  return next(specifier, context);
}`;
function wrapperSource() {
  const real = pathToFileURL(
    resolve("node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/lib/main.js"),
  ).href;
  return `
import real from ${JSON.stringify(real)};
const target = process.env.TRACE_TARGET;
function chains(metafile) {
  const inputs = metafile.inputs;
  const importedBy = new Map();
  for (const [path, input] of Object.entries(inputs))
    for (const edge of input.imports) if (inputs[edge.path]) importedBy.set(edge.path, importedBy.get(edge.path) ?? path);
  const found = [];
  for (const path of Object.keys(inputs)) {
    if (!path.includes(target)) continue;
    const chain = [path];
    let current = path;
    const seen = new Set([path]);
    while (importedBy.has(current) && !seen.has(importedBy.get(current))) {
      current = importedBy.get(current);
      seen.add(current);
      chain.push(current);
    }
    found.push(chain.reverse().join("\\n    -> "));
  }
  return found;
}
let bundle = 0;
export async function build(options) {
  const result = await real.build(options);
  bundle += 1;
  if (result.metafile) {
    const found = chains(result.metafile);
    console.log("[trace] bundle " + bundle + " (" + (options.entryPoints ?? ["<stdin>"]).join(",") + "): " + found.length + " input(s) match " + target);
    for (const chain of found) console.log("  " + chain);
  }
  return result;
}
export const { context, transform, formatMessages, analyzeMetafile, version, stop, initialize } = real;
export default { ...real, build };
`;
}
register(`data:text/javascript,${encodeURIComponent(hook)}`);
process.argv = [process.argv[0], resolve(script), ...args];
await import(pathToFileURL(resolve(script)).href);
